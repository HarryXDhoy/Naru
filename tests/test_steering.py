import tempfile
import http.client
import json
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from server import app


def wait_for(fn):
    until=time.monotonic()+6
    while time.monotonic()<until:
        value=fn()
        if value:return value
        time.sleep(.01)
    raise AssertionError('timed out')


class SteeringTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name).resolve()
        self.rt=app.Runtime(self.root/'data',self.root/'workspace')
        self.rt.store.put('providers',dict(id='p',kind='openai',name='Test',model='m',base_url='http://127.0.0.1',tools_enabled=True))
        self.rt.store.put('sessions',dict(id='s',title='test',provider_id='p',model='m',mode='agent',access_mode='full_access',created_at=app.now(),updated_at=app.now()))
        self.gate=threading.Event();self.enter=threading.Event()

    def tearDown(self):
        self.gate.set()
        for control in list(self.rt.controls.values()):control.set()
        wait_for(lambda:not self.rt.controls and not self.rt.title_pending)
        self.rt.store.db.close();self.tmp.cleanup()

    def test_mid_model_instruction_skips_pending_writes_and_is_applied(self):
        calls=[]
        def complete(p,ctx,tools,*a,**kw):
            calls.append([dict(x) for x in ctx])
            if len(calls)==1:
                self.enter.set();self.gate.wait(5)
                return {'content':'','tool_calls':[{'id':'x','name':'write_file','arguments':{'path':'bad.txt','content':'bad'}},{'id':'y','name':'run_command','arguments':{'command':'touch bad2.txt'}}],'usage':{}}
            return {'content':'Updated plan','tool_calls':[],'usage':{}}
        with patch.object(app.providers,'complete',side_effect=complete):
            rid=self.rt.start('s',{'content':'perform a task','mode':'agent'})['run_id']
            self.assertTrue(self.enter.wait(3))
            item=self.rt.steer(rid,'Please do not write files')['steering']
            self.assertEqual(item['status'],'pending')
            self.gate.set();wait_for(lambda:not self.rt.controls)
        self.assertFalse((self.root/'workspace'/'bad.txt').exists())
        self.assertFalse((self.root/'workspace'/'bad2.txt').exists())
        self.assertEqual(self.rt.store.get('steering',item['id'])['status'],'applied')
        results=[m for m in calls[1] if m['role']=='tool']
        self.assertEqual([m['tool_call_id'] for m in results],['x','y'])
        self.assertTrue(all('실행하지 않았습니다' in m['content'] for m in results))
        self.assertEqual(calls[1][-1]['content'],'Please do not write files')
        msg=next(m for m in self.rt.store.where('messages','session_id','s') if m.get('steering_id')==item['id'])
        self.assertEqual(msg['content'],'Please do not write files')

    def test_instruction_during_last_response_triggers_another_request(self):
        calls=[]
        def complete(p,ctx,tools,*a,**kw):
            calls.append([dict(x) for x in ctx])
            if len(calls)==1:self.enter.set();self.gate.wait(5);return {'content':'old answer','tool_calls':[],'usage':{}}
            return {'content':'new answer','tool_calls':[],'usage':{}}
        with patch.object(app.providers,'complete',side_effect=complete):
            rid=self.rt.start('s',{'content':'task','mode':'plan'})['run_id'];self.assertTrue(self.enter.wait(3))
            item=self.rt.steer(rid,'change direction')['steering'];self.gate.set();wait_for(lambda:not self.rt.controls)
        self.assertEqual(len(calls),2)
        self.assertEqual([m['role'] for m in calls[1][-2:]],['assistant','user'])
        self.assertEqual(self.rt.store.get('steering',item['id'])['status'],'applied')
        self.assertEqual(self.rt.store.get('runs',rid)['status'],'completed')
        with self.assertRaises(ValueError):self.rt.steer(rid,'too late')

    def test_current_tool_finishes_remaining_tools_are_skipped(self):
        tools=[{'id':'x','name':'write_file','arguments':{'path':'first.txt','content':'first'}},{'id':'y','name':'write_file','arguments':{'path':'second.txt','content':'second'}}]
        calls=[];original=self.rt.execute_tool
        def complete(p,ctx,t,*a,**kw):
            calls.append([dict(x) for x in ctx]);return {'content':'','tool_calls':tools,'usage':{}} if len(calls)==1 else {'content':'done','tool_calls':[],'usage':{}}
        def execute(run,name,args,cancel):
            if args.get('path')=='first.txt':self.enter.set();self.gate.wait(5)
            return original(run,name,args,cancel)
        with patch.object(app.providers,'complete',side_effect=complete),patch.object(self.rt,'execute_tool',side_effect=execute):
            rid=self.rt.start('s',{'content':'write','mode':'agent'})['run_id'];self.assertTrue(self.enter.wait(3))
            self.rt.steer(rid,'Stop writing further files');self.gate.set();wait_for(lambda:not self.rt.controls)
        self.assertTrue((self.root/'workspace'/'first.txt').exists())
        self.assertFalse((self.root/'workspace'/'second.txt').exists())
        self.assertEqual([x['tool_call_id'] for x in calls[1] if x['role']=='tool'],['x','y'])

    def test_cancel_preserves_instruction_and_resume_transfers_it(self):
        def blocked(*a,**kw):self.enter.set();self.gate.wait(5);return {'content':'old','tool_calls':[],'usage':{}}
        with patch.object(app.providers,'complete',side_effect=blocked):
            rid=self.rt.start('s',{'content':'task','mode':'agent'})['run_id'];self.assertTrue(self.enter.wait(3))
            item=self.rt.steer(rid,'Do this later')['steering'];self.rt.cancel(rid);self.gate.set();wait_for(lambda:not self.rt.controls)
        self.assertEqual(self.rt.store.get('runs',rid)['status'],'cancelled')
        self.assertEqual(self.rt.store.get('steering',item['id'])['status'],'pending')
        with patch.object(app.providers,'complete',return_value={'content':'done','tool_calls':[],'usage':{}}) as complete:
            resumed=self.rt.start('s',{},resume=rid)['run_id'];wait_for(lambda:not self.rt.controls)
        item=self.rt.store.get('steering',item['id'])
        self.assertEqual((item['run_id'],item['status']),(resumed,'applied'))
        self.assertEqual(sum(m.get('content')=='Do this later' for m in complete.call_args.args[1]),1)

    def test_reject_unsupported_and_preserve_queue(self):
        def blocked(*a,**kw):self.enter.set();self.gate.wait(5);return {'content':'done','tool_calls':[],'usage':{}}
        with patch.object(app.providers,'complete',side_effect=blocked):
            rid=self.rt.start('s',{'content':'task','mode':'agent'})['run_id'];self.assertTrue(self.enter.wait(3))
            self.rt.enqueue('s',{'content':'queued','mode':'chat'})
            for status in ('awaiting_approval','awaiting_user'):
                self.rt.store.patch('runs',rid,status=status)
                with self.assertRaises(ValueError):self.rt.steer(rid,'keep draft')
            self.rt.store.patch('runs',rid,status='running')
            self.assertEqual(len(self.rt.store.where('queued_messages','session_id','s')),1)
            self.gate.set();wait_for(lambda:not self.rt.controls)
        self.assertEqual(self.rt.store.where('steering','session_id','s'),[])

    def test_idempotent_retry_even_after_completion(self):
        def blocked(*a,**kw):self.enter.set();self.gate.wait(5);return {'content':'ok','tool_calls':[],'usage':{}}
        with patch.object(app.providers,'complete',side_effect=blocked):
            rid=self.rt.start('s',{'content':'task','mode':'agent'})['run_id'];self.assertTrue(self.enter.wait(3))
            first=self.rt.steer(rid,'one instruction','retry-key')['steering']
            again=self.rt.steer(rid,'one instruction','retry-key')['steering']
            self.assertEqual(first['id'],again['id'])
            with self.assertRaises(ValueError):self.rt.steer(rid,'different instruction','retry-key')
            self.gate.set();wait_for(lambda:not self.rt.controls)
        self.assertEqual(self.rt.steer(rid,'one instruction','retry-key')['steering']['id'],first['id'])
        self.assertEqual(len(self.rt.store.where('steering','session_id','s')),1)

    def test_transaction_failure_does_not_duplicate_context(self):
        rid=self.rt.start('s',{'content':'task','mode':'agent'},defer=True)['run_id']
        item=self.rt.steer(rid,'extra')['steering'];ctx=list(self.rt.store.get('runs',rid)['context']);before=list(ctx)
        original=self.rt.store.patch
        def fail(table,id,**changes):
            if table=='steering' and changes.get('status')=='in_context':raise RuntimeError('simulated failure')
            return original(table,id,**changes)
        with patch.object(self.rt.store,'patch',side_effect=fail):
            with self.assertRaises(RuntimeError):self.rt.prepare_steering(rid,ctx)
        self.assertEqual(ctx,before)
        self.assertEqual(self.rt.store.get('steering',item['id'])['status'],'pending')
        self.rt.prepare_steering(rid,ctx)
        self.assertEqual(sum(m.get('content')=='extra' for m in ctx),1)
        self.rt.controls.pop(rid);self.rt.active.pop('s',None)

    def test_arrival_before_approval_or_question_does_not_block(self):
        for name,args in [('write_file',{'path':'bad.txt','content':'bad'}),('ask_user',{'question':'choose?'})]:
            with self.subTest(tool=name):
                self.rt.store.patch('sessions','s',access_mode='manual')
                self.enter.clear();self.gate.clear();calls=[]
                original=self.rt.approve if name=='write_file' else self.rt.ask_user
                def gated(*a,**kw):self.enter.set();self.gate.wait(5);return original(*a,**kw)
                def complete(p,ctx,tools,*a,**kw):
                    calls.append([dict(x) for x in ctx]);return {'content':'','tool_calls':[{'id':'x','name':name,'arguments':args}],'usage':{}} if len(calls)==1 else {'content':'done','tool_calls':[],'usage':{}}
                target='approve' if name=='write_file' else 'ask_user'
                with patch.object(app.providers,'complete',side_effect=complete),patch.object(self.rt,target,side_effect=gated):
                    rid=self.rt.start('s',{'content':'task','mode':'agent'})['run_id'];self.assertTrue(self.enter.wait(3))
                    self.rt.steer(rid,'do something else');self.gate.set();wait_for(lambda:not self.rt.controls)
                self.assertEqual(self.rt.store.get('runs',rid)['status'],'completed')
                self.assertEqual(self.rt.store.where('approvals','run_id',rid),[])
                result=next(x for x in calls[1] if x['role']=='tool')
                self.assertIn('실행하지 않았습니다',result['content'])
                self.assertFalse((self.root/'workspace'/'bad.txt').exists())

    def test_in_context_is_not_duplicated_on_resume_after_provider_error(self):
        calls=[]
        def complete(p,ctx,t,*a,**kw):
            calls.append([dict(x) for x in ctx])
            if len(calls)==1:self.enter.set();self.gate.wait(5);return {'content':'old','tool_calls':[],'usage':{}}
            raise RuntimeError('offline')
        with patch.object(app.providers,'complete',side_effect=complete):
            rid=self.rt.start('s',{'content':'task','mode':'agent'})['run_id'];self.assertTrue(self.enter.wait(3))
            item=self.rt.steer(rid,'extra')['steering'];self.gate.set();wait_for(lambda:not self.rt.controls)
        self.assertEqual(self.rt.store.get('steering',item['id'])['status'],'in_context')
        with patch.object(app.providers,'complete',return_value={'content':'done','tool_calls':[],'usage':{}}) as completion:
            resumed=self.rt.start('s',{},resume=rid)['run_id'];wait_for(lambda:not self.rt.controls)
        self.assertEqual(self.rt.store.get('steering',item['id'])['run_id'],resumed)
        self.assertEqual(sum(m.get('content')=='extra' for m in completion.call_args.args[1]),1)
        self.assertEqual(self.rt.store.get('steering',item['id'])['status'],'applied')

    def test_restart_preserves_unapplied_and_resume(self):
        rid=self.rt.start('s',{'content':'task','mode':'plan'},defer=True)['run_id']
        item=self.rt.steer(rid,'continue after restart')['steering']
        reopened=app.Runtime(self.root/'data',self.root/'workspace')
        try:
            self.assertEqual(reopened.store.get('runs',rid)['status'],'interrupted')
            self.assertEqual(reopened.store.get('steering',item['id'])['status'],'pending')
            with patch.object(app.providers,'complete',return_value={'content':'done','tool_calls':[],'usage':{}}) as complete:
                resumed=reopened.start('s',{},resume=rid)['run_id'];wait_for(lambda:not reopened.controls)
            self.assertEqual(reopened.store.get('steering',item['id'])['run_id'],resumed)
            self.assertEqual(sum(m.get('content')=='continue after restart' for m in complete.call_args.args[1]),1)
        finally:reopened.store.db.close();self.rt.controls.pop(rid);self.rt.active.pop('s',None)

    def test_http_steer_and_mode_validation(self):
        rid=self.rt.start('s',{'content':'task','mode':'agent'},defer=True)['run_id']
        server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler);server.runtime=self.rt
        threading.Thread(target=server.serve_forever,daemon=True).start()
        def request(path,body,token=True,method='POST'):
            c=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=5);h={'Content-Type':'application/json'}
            if token:h['X-Naru-Token']=self.rt.csrf
            c.request(method,path,json.dumps(body),h);res=c.getresponse();payload=json.loads(res.read());code=res.status;c.close();return code,payload
        try:
            path='/api/runs/'+rid+'/steer';body={'content':'extra','request_id':'abc'}
            self.assertEqual(request(path,body,token=False)[0],403)
            code,payload=request(path,body);self.assertEqual(code,200)
            self.assertEqual(request(path,body)[1]['steering']['id'],payload['steering']['id'])
            self.assertEqual(request('/api/sessions/s',{'mode':'invalid'},method='PATCH')[0],400)
        finally:
            server.shutdown();server.server_close();self.rt.controls.pop(rid);self.rt.active.pop('s',None)

    def test_cancellation_after_approval_prevents_tool_claim(self):
        self.rt.store.patch('sessions','s',access_mode='manual')
        call={'id':'write','name':'write_file','arguments':{'path':'blocked.txt','content':'bad'}}
        def approve(*args):self.enter.set();self.gate.wait(5);return True
        with patch.object(app.providers,'complete',return_value={'content':'','tool_calls':[call],'usage':{}}),patch.object(self.rt,'approve',side_effect=approve),patch.object(self.rt,'execute_tool',wraps=self.rt.execute_tool) as execute:
            rid=self.rt.start('s',{'content':'task','mode':'agent'})['run_id'];self.assertTrue(self.enter.wait(3))
            self.rt.cancel(rid);self.gate.set();wait_for(lambda:not self.rt.controls)
        execute.assert_not_called()
        self.assertEqual(self.rt.store.get('runs',rid)['status'],'cancelled')
        self.assertFalse((self.root/'workspace'/'blocked.txt').exists())

    def test_mode_patch_rejects_invalid(self):
        with self.assertRaises(ValueError):self.rt.update_session('s',{'mode':'bogus'})
        self.assertEqual(self.rt.update_session('s',{'mode':'plan'})['mode'],'plan')


if __name__=='__main__':unittest.main()
