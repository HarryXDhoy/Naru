import sys, tempfile, threading, time, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import app

class RecallTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); root=Path(self.temp.name)
        self.rt=app.Runtime(root/'data',root/'workspace')
        self.rt.store.put('providers',{'id':'fixture','name':'Fixture','kind':'openai','model':'fixture','has_key':False,'tools_enabled':True})
        for sid in ['current','previous']:
            self.rt.store.put('sessions',{'id':sid,'title':sid,'provider_id':'fixture','model':'fixture','mode':'agent','created_at':app.now(),'updated_at':app.now()})
        self.rt.message('previous','user','My favorite project is the blue bicycle.')
        self.rt.message('current','user','blue in current chat')
    def tearDown(self):
        for c in list(self.rt.controls.values()):c.set()
        deadline=time.monotonic()+5
        while self.rt.controls and time.monotonic()<deadline:time.sleep(.01)
        self.rt.store.db.close();self.temp.cleanup()
    def wait(self,fn):
        deadline=time.monotonic()+5
        while time.monotonic()<deadline:
            x=fn()
            if x:return x
            time.sleep(.02)
        self.fail('timed out')
    def test_todo_list_is_validated_and_persisted(self):
        run={'id':'todo-run','session_id':'current','settings':self.rt.settings(),'status':'running'}
        self.rt.store.put('runs',run)
        items=[{'text':'Inspect files','status':'in_progress'},{'text':'Test changes','status':'pending'}]
        self.assertEqual(self.rt.execute_tool(run,'todo',{'action':'set','items':items},threading.Event())['items'],items)
        self.assertEqual(self.rt.execute_tool(run,'todo',{'action':'list'},threading.Event())['items'],items)
        for bad in [[{'text':'','status':'pending'}],[{'text':'test','status':'unknown'}],[{'text':'x','status':'pending'}]*51]:
            with self.assertRaises(ValueError):self.rt.execute_tool(run,'todo',{'action':'set','items':bad},threading.Event())
        self.assertEqual(self.rt.store.get('runs','todo-run')['todos'],items)
    def test_recall_finds_prior_chat_and_bounds_results(self):
        r=self.rt.execute_tool({'settings':self.rt.settings(),'session_id':'current'},'search_sessions',{'query':'BLUE'},threading.Event())
        self.assertEqual(len(r['matches']),1);self.assertEqual(r['matches'][0]['session_id'],'previous')
        self.assertIn('blue bicycle',r['matches'][0]['excerpt']);self.assertTrue(r['untrusted'])
        for query in ('', 'x'*201):
            with self.assertRaises(ValueError):self.rt.execute_tool({'settings':self.rt.settings(),'session_id':'current'},'search_sessions',{'query':query},threading.Event())
    def test_recall_needs_approval_before_reaching_model(self):
        captured=[]
        def complete(p,ctx,*args,**kwargs):
            captured.append(list(ctx))
            if len(captured)==1:return {'content':'','tool_calls':[{'id':'recall','name':'search_sessions','arguments':{'query':'blue'}}],'usage':{}}
            return {'content':'found','tool_calls':[],'usage':{}}
        with patch.object(app.providers,'complete',side_effect=complete):
            rid=self.rt.start('current',{'content':'remember the bicycle','mode':'agent'})['run_id']
            approval=self.wait(lambda:next((x for x in self.rt.store.all('approvals') if x['run_id']==rid and x['status']=='pending'),None))
            self.assertEqual(approval['tool'],'search_sessions');self.assertEqual(len(captured),1)
            self.rt.store.patch('approvals',approval['id'],status='approved')
            self.wait(lambda:self.rt.store.get('runs',rid)['status']=='completed')
        self.assertIn('blue bicycle',captured[1][-1]['content'])
    def test_denied_recall_never_reveals_previous_content(self):
        captured=[]
        def complete(p,ctx,*args,**kwargs):
            captured.append(list(ctx))
            if len(captured)==1:return {'content':'','tool_calls':[{'id':'recall','name':'search_sessions','arguments':{'query':'blue'}}],'usage':{}}
            return {'content':'denied','tool_calls':[],'usage':{}}
        with patch.object(app.providers,'complete',side_effect=complete):
            rid=self.rt.start('current',{'content':'remember','mode':'agent'})['run_id']
            approval=self.wait(lambda:next((x for x in self.rt.store.all('approvals') if x['run_id']==rid and x['status']=='pending'),None))
            self.rt.store.patch('approvals',approval['id'],status='denied');self.wait(lambda:self.rt.store.get('runs',rid)['status']=='completed')
        self.assertNotIn('blue bicycle',str(captured[1]));self.assertIn('error',captured[1][-1]['content'])

if __name__=='__main__':unittest.main()
