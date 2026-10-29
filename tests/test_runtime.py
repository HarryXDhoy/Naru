import json,sys,tempfile,threading,time,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import app

def wait_until(fn,timeout=5):
    end=time.monotonic()+timeout
    while time.monotonic()<end:
        value=fn()
        if value:return value
        time.sleep(.02)
    raise AssertionError('timeout waiting for expected state')

class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name).resolve()
        self.rt=app.Runtime(self.root/'data',self.root/'work')
        self.rt.store.patch('settings','main',report_directory=str(self.root/'reports'))
        self.rt.store.put('providers',dict(id='fixture',kind='openai',name='Fixture',model='fixture',has_key=False,tools_enabled=True,base_url='http://127.0.0.1'))
        self.session=self.rt.store.put('sessions',dict(id='session',title='새 대화',provider_id='fixture',model='fixture',mode='agent',created_at=app.now(),updated_at=app.now()))
    def tearDown(self):
        for c in self.rt.controls.values():c.set()
        wait_until(lambda:not self.rt.controls)
        self.rt.store.db.close();self.tmp.cleanup()
    def test_path_boundary_and_symlink(self):
        outside=self.root/'secret';outside.write_text('private')
        (self.root/'work'/'alias').symlink_to(outside)
        for path in ('../secret','alias',str(outside)):
            with self.assertRaises(ValueError):self.rt.resolve(path,self.rt.settings())
        self.assertEqual(self.rt.resolve('ok.txt',self.rt.settings()),self.root/'work'/'ok.txt')
    def test_write_approval_durable_output_and_usage(self):
        answers=[dict(content='',tool_calls=[dict(id='call1',name='write_file',arguments={'path':'report.html','content':'<h1>Hello</h1>'})],usage={'input_tokens':3}),dict(content='Saved report.html',tool_calls=[],usage={'output_tokens':4})]
        with patch.object(app.providers,'complete',side_effect=lambda *a,**k:answers.pop(0)):
            id=self.rt.start('session',{'content':'Create report'})['run_id']
            approval=wait_until(lambda:next((a for a in self.rt.store.all('approvals') if a['status']=='pending'),None))
            self.assertFalse((self.root/'work'/'report.html').exists())
            self.rt.store.patch('approvals',approval['id'],status='approved')
            wait_until(lambda:self.rt.store.get('runs',id)['status']=='completed')
        self.assertEqual((self.root/'work'/'report.html').read_text(),'<h1>Hello</h1>')
        self.assertEqual(len(self.rt.store.all('artifacts')),1)
        self.assertEqual(self.rt.store.get('runs',id)['usage'],{'input_tokens':3,'output_tokens':4})
        self.assertEqual(self.rt.store.all('messages')[-1]['content'],'Saved report.html')
        again=app.Store(self.root/'data');self.assertEqual(again.all('messages')[-1]['content'],'Saved report.html');again.db.close()
    def test_cancel_approval_then_resume_requires_fresh_approval(self):
        first=dict(content='',tool_calls=[dict(id='call1',name='write_file',arguments={'path':'result.txt','content':'one'})],usage={})
        with patch.object(app.providers,'complete',return_value=first):
            id=self.rt.start('session',{'content':'write'})['run_id']
            wait_until(lambda:self.rt.store.get('runs',id)['status']=='awaiting_approval')
            self.rt.cancel(id);wait_until(lambda:self.rt.store.get('runs',id)['status']=='cancelled')
        self.assertFalse((self.root/'work'/'result.txt').exists())
        with patch.object(app.providers,'complete',return_value={'content':'done','tool_calls':[],'usage':{}}):
            resumed=self.rt.start('session',{},resume=id)['run_id']
            approval=wait_until(lambda:next((a for a in self.rt.store.all('approvals') if a['run_id']==resumed and a['status']=='pending'),None))
            self.rt.store.patch('approvals',approval['id'],status='approved');wait_until(lambda:self.rt.store.get('runs',resumed)['status']=='completed')
        self.assertEqual((self.root/'work'/'result.txt').read_text(),'one')
        self.assertEqual(len([e for e in self.rt.store.all('events') if e['type']=='tool_result']),1)
    def test_chat_does_not_execute_tools(self):
        calls=[{'content':'','tool_calls':[{'id':'bad','name':'write_file','arguments':{'path':'bad','content':'bad'}}],'usage':{}},{'content':'No action','tool_calls':[],'usage':{}}]
        with patch.object(app.providers,'complete',side_effect=lambda *a,**kw:calls.pop(0)):
            id=self.rt.start('session',{'content':'hello','mode':'chat'})['run_id'];wait_until(lambda:self.rt.store.get('runs',id)['status']=='completed')
        self.assertFalse((self.root/'work'/'bad').exists());self.assertEqual(self.rt.store.all('approvals'),[])
    def test_existing_artifact_never_overwritten(self):
        p=self.root/'work'/'existing.txt';p.write_text('original')
        with self.assertRaises(ValueError):self.rt.execute_tool({'settings':self.rt.settings(),'session_id':'session'},'write_file',{'path':'existing.txt','content':'changed'},threading.Event())
        self.assertEqual(p.read_text(),'original')
    def test_restart_marks_active_interrupted(self):
        self.rt.store.put('runs',{'id':'old','status':'running','session_id':'session'})
        resumed=app.Runtime(self.root/'data',self.root/'work');self.assertEqual(resumed.store.get('runs','old')['status'],'interrupted');resumed.store.db.close()
    def test_private_web_addresses_rejected(self):
        for url in ['file:///etc/passwd','http://127.0.0.1:4317/api/state','http://localhost:4317']:
            with self.assertRaises(ValueError):app.public_url(url)
    def test_completed_tool_not_replayed_on_resume(self):
        answers=[{'content':'','tool_calls':[{'id':'one','name':'list_files','arguments':{'path':'.'}}],'usage':{}},RuntimeError('network down')]
        def complete(*a,**kw):
            answer=answers.pop(0)
            if isinstance(answer,Exception):raise answer
            return answer
        with patch.object(app.providers,'complete',side_effect=complete):
            id=self.rt.start('session',{'content':'list'})['run_id'];wait_until(lambda:self.rt.store.get('runs',id)['status']=='failed')
        with patch.object(app.providers,'complete',return_value={'content':'done','tool_calls':[],'usage':{}}):
            new=self.rt.start('session',{},resume=id)['run_id'];wait_until(lambda:self.rt.store.get('runs',new)['status']=='completed')
        self.assertEqual(len([e for e in self.rt.store.all('events') if e['type']=='tool_result']),1)

if __name__=='__main__':unittest.main()
