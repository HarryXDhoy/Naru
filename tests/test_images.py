import base64, json, os, sys, tempfile, threading, time, unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import app, providers, accounts

PNG = b'\x89PNG\r\n\x1a\nfixture'
IMAGE = {'name':'test.png', 'mime':'image/png', 'data':base64.b64encode(PNG).decode()}

def wait_for(fn):
    end = time.monotonic() + 5
    while not fn():
        if time.monotonic() > end: raise AssertionError('run timed out')
        time.sleep(.01)

class ImageTests(unittest.TestCase):
    def test_validation_rejects_spoof_invalid_and_limits(self):
        self.assertEqual(providers.validate_images([IMAGE]), [IMAGE])
        for imgs in ([dict(IMAGE, mime='image/jpeg')], [dict(IMAGE, data='%%%')], [IMAGE]*5, [dict(IMAGE, data=base64.b64encode(b'\x89PNG\r\n\x1a\n'+b'x'*(4*1024*1024)).decode())], [{'mime':'image/svg+xml','data':'AAAA'}]):
            with self.assertRaises(ValueError): providers.validate_images(imgs)

    def test_provider_payloads(self):
        history = [{'role':'system','content':'system'}, {'role':'user','content':'first','images':[IMAGE]}, {'role':'assistant','content':'answer'}, {'role':'user','content':'second'}]
        events = {'openai':[{'choices':[{'index':0,'delta':{'content':'ok'},'finish_reason':'stop'}]}], 'responses':[{'type':'response.completed','response':{'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':'ok'}]}]}}], 'anthropic':[{'type':'content_block_start','index':0,'content_block':{'type':'text','text':'ok'}},{'type':'message_stop'}], 'gemini':[{'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'ok'}]}}]}], 'ollama':[{'message':{'content':'ok'},'done':True}]}
        for kind in events:
            with self.subTest(kind=kind):
                sent=[]
                def stream(_provider, path, payload, cancel):
                    sent.append(payload)
                    return iter(events[kind])
                with patch.object(providers, '_stream_request', side_effect=stream):
                    result=providers.complete({'kind':kind,'model':'fixture','base_url':'http://127.0.0.1'},history,[],lambda x:None,threading.Event())
                self.assertEqual(result['content'],'ok')
                payload=sent[0]
                if kind=='openai': self.assertEqual(payload['messages'][1]['content'][1]['image_url']['url'], 'data:image/png;base64,'+IMAGE['data'])
                elif kind=='responses': self.assertEqual(payload['input'][0]['content'][1]['image_url'], 'data:image/png;base64,'+IMAGE['data'])
                elif kind=='anthropic': self.assertEqual(payload['messages'][0]['content'][1]['source'], {'type':'base64','media_type':'image/png','data':IMAGE['data']})
                elif kind=='gemini': self.assertEqual(payload['contents'][0]['parts'][1]['inlineData'], {'mimeType':'image/png','data':IMAGE['data']})
                else: self.assertEqual(payload['messages'][1]['images'],[IMAGE['data']])

    def test_codex_temporary_files_and_planner(self):
        messages=[{'role':'user','content':'describe','images':[IMAGE]}]
        paths=[]
        def run(prompt, model, workspace, mode, event, cancel, **kwargs):
            self.assertNotIn(IMAGE['data'], prompt)
            self.assertIn('test.png',prompt)
            paths.extend(kwargs['images'])
            self.assertEqual(Path(paths[0]).read_bytes(),PNG)
            self.assertEqual(os.stat(paths[0]).st_mode & 0o777,0o600)
            return {'content':'{"content":"ok","tool_calls":[]}', 'usage':{}}
        with patch.object(providers,'run_codex',side_effect=run):
            self.assertEqual(providers._codex_complete({'model':''}, messages, [], lambda x:None, threading.Event(), 4096)['content'],'ok')
        self.assertFalse(Path(paths[0]).exists())

    def test_codex_chat_passes_images_and_followup_history(self):
        with tempfile.TemporaryDirectory() as folder:
            rt=app.Runtime(Path(folder)/'data',Path(folder)/'work')
            rt.store.put('sessions',dict(id='s',title='새 대화',provider_id='codex',model='',mode='chat',created_at=app.now(),updated_at=app.now()))
            calls=[];paths=[]
            def run(prompt, model, workspace, mode, event, cancel, **kwargs):
                calls.append(prompt); paths.extend(kwargs['images'])
                self.assertNotIn(IMAGE['data'],prompt)
                self.assertIn('#1: test.png',prompt)
                self.assertEqual(Path(kwargs['images'][0]).read_bytes(),PNG)
                return {'content':'ok','usage':{}}
            try:
                with patch.object(app.providers,'run_codex',side_effect=run):
                    rt.start('s',{'content':'','images':[IMAGE]});wait_for(lambda:not rt.controls)
                    rt.start('s',{'content':'다시 설명해 줘'});wait_for(lambda:not rt.controls)
                self.assertEqual(len(calls),2)
                self.assertTrue(all(not Path(path).exists() for path in paths))
            finally:rt.store.db.close()

    def test_codex_cli_image_args_preserve_order(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);binary=root/'codex';argsfile=root/'args.txt'
            binary.write_text('#!/usr/bin/env python3\nimport json,sys\nsys.stdin.read()\nopen('+repr(str(argsfile))+',"w").write(json.dumps(sys.argv[1:]))\nprint(json.dumps({"type":"item.completed","item":{"type":"agent_message","text":"ok"}}))\nprint(json.dumps({"type":"turn.completed"}))\n');binary.chmod(0o700)
            with patch.dict(os.environ,{'NARU_CODEX_BIN':str(binary)}):
                providers.run_codex('test','',folder,'chat',lambda *_:None,threading.Event(),images=['/tmp/a.png','/tmp/b.png'])
            import json
            args=json.loads(argsfile.read_text())
            self.assertEqual([args[i+1] for i,x in enumerate(args) if x=='--image'],['/tmp/a.png','/tmp/b.png'])

    def test_claude_account_stream_input_for_chat_and_planner(self):
        messages=[{'role':'system','content':'system'}, {'role':'user','content':'describe','images':[IMAGE]}, {'role':'assistant','content':'prior'}, {'role':'user','content':'continue'}]
        received=[]
        def run(args, stdin, cwd, env, cancel, callback, timeout=1800):
            received.append((args,json.loads(stdin)))
            if '--json-schema' in args:
                event={'type':'result','is_error':False,'structured_output':{'content':'done','tool_calls':[]},'usage':{}}
            else:event={'type':'result','is_error':False,'result':'done','usage':{}}
            callback(json.dumps(event)+'\n');return 0,''
        with patch.object(accounts,'executable',return_value='/usr/bin/true'),patch.object(accounts,'_run',side_effect=run):
            provider={'kind':'claude_code','model':''}
            self.assertEqual(accounts.chat(provider,messages,lambda *_:None,threading.Event())['content'],'done')
            tools=[{'function':{'name':'read_file'}}]
            self.assertEqual(accounts.complete(provider,messages,tools,lambda *_:None,threading.Event())['content'],'done')
        for args, input_obj in received:
            self.assertEqual(args[args.index('--input-format')+1],'stream-json')
            self.assertEqual(args[args.index('--output-format')+1],'stream-json')
            self.assertEqual(args[args.index('--tools')+1],'')
            self.assertEqual(args[args.index('--disallowedTools')+1],'mcp__*')
            for option in ('--safe-mode','--strict-mcp-config','--no-session-persistence'):self.assertIn(option,args)
            blocks=input_obj['message']['content']
            self.assertIn('#1: test.png',blocks[0]['text'])
            self.assertNotIn(IMAGE['data'],blocks[0]['text'])
            self.assertEqual(blocks[1],{'type':'image','source':{'type':'base64','media_type':'image/png','data':IMAGE['data']}})

    def test_message_queue_followup_and_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            rt=app.Runtime(Path(folder)/'data',Path(folder)/'work')
            rt.store.put('providers',dict(id='p',kind='openai',name='test',model='m',has_key=False,tools_enabled=True,base_url='http://127.0.0.1'))
            rt.store.put('sessions',dict(id='s',title='새 대화',provider_id='p',model='m',mode='chat',created_at=app.now(),updated_at=app.now()))
            seen=[]; gate=threading.Event()
            def complete(p,ctx,*args,**kwargs):
                seen.append(ctx);gate.wait(3);return {'content':'ok','tool_calls':[],'usage':{}}
            try:
                with patch.object(app.providers,'complete',side_effect=complete):
                    rt.start('s',{'content':'','images':[IMAGE]})
                    rt.enqueue('s',{'content':'later','images':[IMAGE]})
                    q=rt.session_view('s')['queue'][0]
                    rt.change_queue('s',q['id'],{'content':''})
                    self.assertEqual(rt.session_view('s')['queue'][0]['images'],[IMAGE])
                    gate.set();wait_for(lambda:len(rt.store.all('runs'))==2 and not rt.controls)
                    self.assertEqual(seen[0][-1]['images'],[IMAGE])
                    self.assertEqual([m['images'] for m in seen[1] if m.get('images')],[[IMAGE],[IMAGE]])
                reopened=app.Store(Path(folder)/'data')
                try:self.assertEqual([m['images'] for m in reopened.all('messages') if m.get('images')],[[IMAGE],[IMAGE]])
                finally:reopened.db.close()
            finally:rt.store.db.close()

    def test_account_cli_does_not_silently_drop_images(self):
        with tempfile.TemporaryDirectory() as folder:
            rt=app.Runtime(Path(folder)/'data',Path(folder)/'work')
            rt.store.put('providers',dict(id='gemini',kind='gemini_cli',name='Gemini',model='',has_key=False,tools_enabled=True))
            rt.store.put('sessions',dict(id='s',title='s',provider_id='gemini',model='',mode='chat',created_at=app.now(),updated_at=app.now()))
            try:
                with patch.object(app.accounts,'chat') as chat, patch.object(app.accounts,'complete') as complete:
                    result=rt.start('s',{'content':'','images':[IMAGE]})
                    wait_for(lambda:not rt.controls)
                    run=rt.store.get('runs',result['run_id'])
                    self.assertEqual(run['status'],'failed')
                    self.assertIn('이미지 입력을 지원하지 않습니다',run['error'])
                    chat.assert_not_called();complete.assert_not_called()
            finally:rt.store.db.close()

if __name__=='__main__':unittest.main()
