import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from server import app


def wait_for(predicate):
    end=time.monotonic()+5
    while time.monotonic()<end:
        if predicate():return
        time.sleep(.01)
    raise AssertionError('Timed out')


class PlanModeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)
        self.rt=app.Runtime(self.root/'data',self.root/'workspace')
        self.rt.store.put('providers',dict(id='p',kind='openai',name='Test',model='m',base_url='http://127.0.0.1',tools_enabled=True))
        self.rt.store.put('sessions',dict(id='s',title='Example',provider_id='p',model='m',mode='chat',created_at=app.now(),updated_at=app.now()))
        (self.root/'workspace'/'example.txt').write_text('evidence')

    def tearDown(self):
        for c in list(self.rt.controls.values()):c.set()
        wait_for(lambda:not self.rt.controls and not self.rt.title_pending)
        self.rt.store.db.close()
        self.tmp.cleanup()

    def test_read_only_tools_and_malicious_write_rejected_in_full_access(self):
        self.rt.store.patch('settings','main',access_mode='full_access')
        calls=[]
        def complete(provider,ctx,tools,*args,**kwargs):
            calls.append((list(tools),list(ctx)))
            if len(calls)==1:return {'content':'','tool_calls':[{'id':'r','name':'read_file','arguments':{'path':'example.txt'}},{'id':'w','name':'write_file','arguments':{'path':'bad.txt','content':'bad'}},{'id':'x','name':'run_command','arguments':{'command':'touch bad2.txt'}}],'usage':{}}
            return {'content':'Read the evidence; here is a plan.','tool_calls':[],'usage':{}}
        with patch.object(app.providers,'complete',side_effect=complete):
            rid=self.rt.start('s',{'content':'inspect and plan','mode':'plan'})['run_id']
            wait_for(lambda:not self.rt.controls)
        run=self.rt.store.get('runs',rid)
        self.assertEqual(run['status'],'completed')
        names={t['function']['name'] for t in calls[0][0]}
        self.assertIn('read_file',names)
        self.assertTrue(names <= app.PLAN_TOOLS)
        self.assertNotIn('write_file',names)
        self.assertIn('Plan mode:',calls[0][1][0]['content'])
        results=[e['data'] for e in self.rt.store.where('events','run_id',rid) if e['type']=='tool_result']
        self.assertIn('evidence',results[0]['result']['content'])
        self.assertIn('계획 모드',results[1]['result']['error'])
        self.assertIn('계획 모드',results[2]['result']['error'])
        self.assertFalse((self.root/'workspace'/'bad.txt').exists())
        self.assertFalse((self.root/'workspace'/'bad2.txt').exists())
        self.assertEqual(self.rt.store.where('approvals','run_id',rid),[])
        with self.assertRaisesRegex(ValueError,'계획 모드'):
            self.rt.execute_tool(run,'write_file',{'path':'bad.txt','content':'bad'},threading.Event())

    def test_plan_mode_uses_account_and_codex_planners(self):
        for kind,complete in [('codex',app.providers),('claude_code',app.accounts)]:
            with self.subTest(kind=kind):
                self.rt.store.patch('providers','p',kind=kind)
                with patch.object(complete,'complete',return_value={'content':'Plan','tool_calls':[],'usage':{}}) as fn:
                    rid=self.rt.start('s',{'content':'plan','mode':'plan'})['run_id']
                    wait_for(lambda:not self.rt.controls)
                self.assertEqual(self.rt.store.get('runs',rid)['status'],'completed')
                names={t['function']['name'] for t in fn.call_args.args[2]}
                self.assertIn('read_file',names)
                self.assertNotIn('run_command',names)

    def test_queue_and_resume_preserve_plan_mode(self):
        self.rt.store.patch('sessions','s',queue_paused=True)
        q=self.rt.enqueue('s',{'content':'plan later','mode':'plan'})['queued']
        self.assertEqual(q['mode'],'plan')
        with patch.object(app.providers,'complete',return_value={'content':'Plan','tool_calls':[],'usage':{}}):
            self.rt.dispatch_queue('s',resume=True)
            wait_for(lambda:not self.rt.controls)
        run=self.rt.store.all('runs')[-1]
        self.assertEqual(run['mode'],'plan')
        self.rt.store.patch('runs',run['id'],status='interrupted',pending_calls=[{'id':'old','name':'write_file','arguments':{'path':'resume.txt','content':'bad'}}],tool_cursor=0)
        with patch.object(app.providers,'complete',return_value={'content':'Plan','tool_calls':[],'usage':{}}):
            resumed=self.rt.start('s',{},resume=run['id'])['run_id']
            wait_for(lambda:not self.rt.controls)
        self.assertEqual(self.rt.store.get('runs',resumed)['mode'],'plan')
        self.assertFalse((self.root/'workspace'/'resume.txt').exists())

    def test_sensitive_read_requires_approval(self):
        responses=[{'content':'','tool_calls':[{'id':'history','name':'search_sessions','arguments':{'query':'private'}}],'usage':{}}, {'content':'Plan','tool_calls':[],'usage':{}}]
        with patch.object(app.providers,'complete',side_effect=lambda *a,**kw:responses.pop(0)):
            rid=self.rt.start('s',{'content':'plan','mode':'plan'})['run_id']
            wait_for(lambda:bool(self.rt.store.where('approvals','run_id',rid)))
            approval=self.rt.store.where('approvals','run_id',rid)[0]
            self.assertEqual(approval['status'],'pending')
            self.assertEqual(self.rt.store.get('runs',rid)['status'],'awaiting_approval')
            self.rt.store.patch('approvals',approval['id'],status='denied')
            wait_for(lambda:not self.rt.controls)
        self.assertEqual(self.rt.store.get('runs',rid)['status'],'completed')
        result=next(e['data']['result'] for e in self.rt.store.where('events','run_id',rid) if e['type']=='tool_result')
        self.assertIn('거절',result['error'])

    def test_plan_workflow_and_image_generation_rejected(self):
        workflow=self.rt.save_workflow({'name':'Plan','prompt':'inspect','mode':'plan'})
        self.assertEqual(workflow['mode'],'plan')
        with patch.object(self.rt,'image_request',return_value={'provider_id':'p','model':'image'}):
            with self.assertRaisesRegex(ValueError,'계획 모드'):
                self.rt.start('s',{'content':'draw','mode':'plan','create_image':True})
            with self.assertRaisesRegex(ValueError,'계획 모드'):
                self.rt.enqueue('s',{'content':'draw','mode':'plan','create_image':True})
        self.assertFalse(self.rt.store.all('runs'))
        self.assertFalse(self.rt.store.all('queued_messages'))


if __name__=='__main__':unittest.main()
