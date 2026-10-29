import base64, http.client, json, os, sys, tempfile, threading, time, unittest, uuid
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import app, providers

PNG=b'\x89PNG\r\n\x1a\n' + b'fake-test-image'
DATA=base64.b64encode(PNG).decode()
PROVIDER={'id':'router','name':'OpenRouter','kind':'openai','base_url':'https://openrouter.ai/api/v1','api_key':'test-key','model':'text-model'}

def wait_for(predicate):
    for _ in range(200):
        if predicate(): return
        time.sleep(.01)
    raise AssertionError('run did not finish')

class ImageGenerationTests(unittest.TestCase):
    def test_provider_protocol_and_validation(self):
        calls=[]
        def request(p, path, payload=None, timeout=15):
            calls.append((path,payload))
            return {'data':[{'id':'z'}, {'id':'a'}, {'id':'a'}]} if path=='/images/models' else {'data':[{'b64_json':DATA,'media_type':'image/png'}], 'usage':{'cost':.01}}
        with patch.object(providers,'_json_request',side_effect=request):
            self.assertEqual(providers.image_models(PROVIDER),['a','z'])
            result=providers.generate_image(PROVIDER,'a','Draw a circle',threading.Event())
            self.assertEqual(result['bytes'],PNG)
            self.assertEqual(result['usage']['cost'],.01)
            self.assertEqual(calls,[('/images/models',None),('/images',{'model':'a','prompt':'Draw a circle'})])
            with self.assertRaises(providers.ProviderError):providers.generate_image(dict(PROVIDER,base_url='https://elsewhere.example/v1'),'a','x',threading.Event())
            with self.assertRaises(providers.ProviderError):providers.generate_image(dict(PROVIDER,api_key=''),'a','x',threading.Event())
        with patch.object(providers,'_json_request',return_value={'data':[{'b64_json':DATA,'media_type':'image/jpeg'}]}):
            with self.assertRaises(providers.ProviderError):providers.generate_image(PROVIDER,'a','x',threading.Event())
        with patch.object(providers,'_json_request',return_value={'data':[]}):
            with self.assertRaises(providers.ProviderError):providers.generate_image(PROVIDER,'a','x',threading.Event())

    def test_cancellation_and_single_request(self):
        cancel=threading.Event();started=threading.Event();release=threading.Event();calls=[]
        def request(*args,**kwargs):
            calls.append(1);started.set();release.wait(3);return {'data':[{'b64_json':DATA}]}
        with patch.object(providers,'_json_request',side_effect=request):
            outcome=[]
            def run():
                try:providers.generate_image(PROVIDER,'a','x',cancel)
                except Exception as exc:outcome.append(exc)
            worker=threading.Thread(target=run);worker.start();self.assertTrue(started.wait(2));cancel.set();worker.join(2);release.set()
            self.assertFalse(worker.is_alive());self.assertEqual(len(calls),1);self.assertIsInstance(outcome[0],providers.CancelledError)

    def test_run_saves_image_and_keeps_chat_model(self):
        with tempfile.TemporaryDirectory() as directory:
            rt=app.Runtime(Path(directory)/'data',Path(directory)/'work')
            chat={'id':'chat','name':'ChatGPT','kind':'codex','model':'text-model','has_key':False}
            router={k:v for k,v in PROVIDER.items() if k!='api_key'};router['has_key']=True
            rt.store.put('providers',chat);rt.store.put('providers',router)
            rt.store.put('sessions',{'id':'s','title':'test','provider_id':'chat','model':'text-model','mode':'chat','created_at':app.now(),'updated_at':app.now()})
            try:
                with patch.object(rt.vault,'get',return_value='test-key'),patch.object(providers,'generate_image',return_value={'bytes':PNG,'mime':'image/png','usage':{'cost':.01}}) as generate:
                    rid=rt.start('s',{'content':'Draw a circle','provider_id':'chat','model':'text-model','mode':'chat','create_image':True,'image_provider_id':'router','image_model':'image-model'})['run_id']
                    wait_for(lambda:not rt.controls)
                    run=rt.store.get('runs',rid);session=rt.session('s');messages=rt.store.where('messages','session_id','s');artifacts=rt.store.where('artifacts','session_id','s')
                    self.assertEqual(run['status'],'completed');self.assertTrue(run['create_image']);self.assertEqual(run['usage']['cost_usd'],.01)
                    self.assertEqual((session['provider_id'],session['model']),('chat','text-model'))
                    self.assertEqual((messages[-1]['run_id'],messages[-1]['create_image']),(rid,True))
                    self.assertEqual((artifacts[0]['run_id'],artifacts[0]['image_generated']),(rid,True))
                    self.assertEqual(rt.artifact_bytes(artifacts[0]),PNG)
                    self.assertEqual(generate.call_args.args[1:3],('image-model','Draw a circle'))
            finally:rt.store.db.close()

    def test_codex_result_is_limited_to_own_thread_folder(self):
        with tempfile.TemporaryDirectory() as directory:
            thread=str(uuid.uuid4());root=Path(directory)/'generated_images'/thread;root.mkdir(parents=True)
            (root/'call_fixture.png').write_bytes(PNG)
            with patch.dict(os.environ,{'CODEX_HOME':directory}):
                self.assertEqual(providers.codex_generated_image(thread,time.time())['bytes'],PNG)
                for invalid in ('../other',None,str(uuid.uuid4())):
                    with self.assertRaises(providers.ProviderError):providers.codex_generated_image(invalid,time.time())
                (root/'call_second.png').write_bytes(PNG)
                with self.assertRaises(providers.ProviderError):providers.codex_generated_image(thread,time.time())

    def test_codex_cli_uses_isolated_image_tool_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);binary=root/'codex';argsfile=root/'args.json';thread=str(uuid.uuid4())
            binary.write_text('#!/usr/bin/env python3\nimport json,sys\nsys.stdin.read()\nopen('+repr(str(argsfile))+',"w").write(json.dumps(sys.argv[1:]))\nprint(json.dumps({"type":"thread.started","thread_id":'+repr(thread)+'}))\nprint(json.dumps({"type":"turn.completed"}))\n');binary.chmod(0o700)
            with patch.dict(os.environ,{'NARU_CODEX_BIN':str(binary)}):
                result=providers.run_codex('image','',directory,'chat',lambda *_:None,threading.Event(),_image_generation=True)
                with self.assertRaises(providers.ProviderError):providers.run_codex('image','',directory,'agent',lambda *_:None,threading.Event(),_image_generation=True)
            args=json.loads(argsfile.read_text());self.assertEqual(result['thread_id'],thread);self.assertEqual(result['content'],'')
            for feature in ('code_mode_host','shell_tool','unified_exec','apps','plugins','computer_use'):
                self.assertTrue(any(args[i]=='--disable' and args[i+1]==feature for i in range(len(args)-1)))
            self.assertIn('features.code_mode.direct_only_tool_namespaces=["image_gen"]',args)
            self.assertTrue(any(args[i]=='--enable' and args[i+1]=='image_generation' for i in range(len(args)-1)))
            self.assertTrue(any(args[i]=='--sandbox' and args[i+1]=='read-only' for i in range(len(args)-1)))

    def test_codex_image_generation_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            rt=app.Runtime(Path(directory)/'data',Path(directory)/'work')
            rt.store.put('providers',{'id':'codex','name':'ChatGPT','kind':'codex','model':'','has_key':False})
            rt.store.put('sessions',{'id':'s','title':'test','provider_id':'codex','model':'','mode':'agent','created_at':app.now(),'updated_at':app.now()})
            try:
                self.assertEqual(providers.image_models({'kind':'codex'}),['__default__'])
                with patch.object(providers,'run_codex',return_value={'thread_id':str(uuid.uuid4()),'content':'','usage':{}}) as run,patch.object(providers,'codex_generated_image',return_value={'bytes':PNG,'mime':'image/png','usage':{}}):
                    rid=rt.start('s',{'content':'red circle','provider_id':'codex','mode':'agent','create_image':True,'image_provider_id':'codex','image_model':'__default__'})['run_id']
                    wait_for(lambda:not rt.controls)
                    self.assertEqual(rt.store.get('runs',rid)['status'],'completed')
                    self.assertEqual(run.call_args.args[3],'chat');self.assertTrue(run.call_args.kwargs['_image_generation'])
                    self.assertEqual(rt.artifact_bytes(rt.store.all('artifacts')[0]),PNG)
            finally:rt.store.db.close()

    def test_generation_works_when_text_model_is_not_configured(self):
        with tempfile.TemporaryDirectory() as directory:
            rt=app.Runtime(Path(directory)/'data',Path(directory)/'work')
            rt.store.put('providers',{'id':'local','name':'Local','kind':'openai','base_url':'http://127.0.0.1:1234/v1','model':'','has_key':True})
            rt.store.put('providers',{'id':'codex','name':'ChatGPT','kind':'codex','model':'','has_key':False})
            rt.store.put('sessions',{'id':'s','title':'test','provider_id':'local','model':'','mode':'chat','queue_paused':True,'created_at':app.now(),'updated_at':app.now()})
            body={'content':'make an image','provider_id':'local','model':'','create_image':True,'image_provider_id':'codex','image_model':'__default__'}
            try:
                with patch.object(rt.vault,'get',side_effect=AssertionError('unrelated text provider vault accessed')),patch.object(providers,'run_codex',return_value={'thread_id':str(uuid.uuid4()),'content':'','usage':{}}),patch.object(providers,'codex_generated_image',return_value={'bytes':PNG,'mime':'image/png','usage':{}}):
                    q=rt.enqueue('s',body)['queued'];self.assertTrue(q['create_image'])
                    rid=rt.dispatch_queue('s',resume=True)['run_id'];wait_for(lambda:not rt.controls)
                    self.assertEqual(rt.store.get('runs',rid)['status'],'completed')
                    self.assertEqual((rt.session('s')['provider_id'],rt.session('s')['model']),('local',''))
            finally:rt.store.db.close()

    def test_queue_and_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            rt=app.Runtime(Path(directory)/'data',Path(directory)/'work')
            chat={'id':'chat','name':'ChatGPT','kind':'codex','model':'text-model','has_key':False}
            router={k:v for k,v in PROVIDER.items() if k!='api_key'};router['has_key']=True
            rt.store.put('providers',chat);rt.store.put('providers',router)
            rt.store.put('sessions',{'id':'s','title':'test','provider_id':'chat','model':'text-model','mode':'chat','queue_paused':True,'created_at':app.now(),'updated_at':app.now()})
            try:
                body={'content':'make it','provider_id':'chat','create_image':True,'image_provider_id':'router','image_model':'img'}
                with patch.object(rt.vault,'get',return_value='test-key'):
                    q=rt.enqueue('s',body)['queued'];self.assertEqual((q['create_image'],q['image_model']), (True,'img'))
                    with self.assertRaises(ValueError):rt.change_queue('s',q['id'],{'content':''})
                    with self.assertRaises(ValueError):rt.enqueue('s',{**body,'images':[{'mime':'image/png','name':'x','data':DATA}]})
                    with patch.object(providers,'generate_image',return_value={'bytes':PNG,'mime':'image/png','usage':{}}):
                        run=rt.dispatch_queue('s',resume=True)['run_id'];wait_for(lambda:not rt.controls)
                    self.assertTrue(rt.store.get('runs',run)['create_image']);self.assertEqual(rt.store.get('runs',run)['status'],'completed')
                    with self.assertRaises(ValueError):rt.enqueue('s',{**body,'image_provider_id':'chat'})
            finally:rt.store.db.close()

class ImageHTTPTests(unittest.TestCase):
    def test_models_send_and_download(self):
        with tempfile.TemporaryDirectory() as directory:
            rt=app.Runtime(Path(directory)/'data',Path(directory)/'work')
            rt.store.put('providers',{'id':'chat','name':'ChatGPT','kind':'codex','model':'','has_key':False})
            rt.store.put('sessions',{'id':'s','title':'test','provider_id':'chat','model':'','mode':'chat','created_at':app.now(),'updated_at':app.now()})
            server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler);server.runtime=rt
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            def req(method,path,body=None):
                c=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=3)
                headers={'X-Naru-Token':rt.csrf,'Content-Type':'application/json'}
                c.request(method,path,None if body is None else json.dumps(body),headers);r=c.getresponse();data=r.read();status=r.status;c.close();return status,data
            try:
                status,data=req('GET','/api/providers/chat/image-models');self.assertEqual(status,200);self.assertEqual(json.loads(data)['models'],['__default__'])
                with patch.object(providers,'run_codex',return_value={'thread_id':str(uuid.uuid4()),'content':'','usage':{}}),patch.object(providers,'codex_generated_image',return_value={'bytes':PNG,'mime':'image/png','usage':{}}):
                    status,data=req('POST','/api/sessions/s/messages',{'content':'simple picture','provider_id':'chat','create_image':True,'image_provider_id':'chat','image_model':'__default__'})
                    self.assertEqual(status,200);rid=json.loads(data)['run_id'];wait_for(lambda:not rt.controls)
                status,data=req('GET','/api/sessions/s');view=json.loads(data)
                self.assertEqual(status,200);self.assertTrue(view['runs'][-1]['create_image']);self.assertEqual(view['artifacts'][0]['run_id'],rid)
                status,data=req('GET','/api/artifacts/'+view['artifacts'][0]['id']+'/download?inline=1')
                self.assertEqual((status,data),(200,PNG))
            finally:
                server.shutdown();thread.join();server.server_close();rt.store.db.close()

if __name__=='__main__':unittest.main()
