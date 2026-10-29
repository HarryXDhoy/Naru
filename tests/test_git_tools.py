"""Read-only repository inspection tools operate within the workspace boundary."""
import os, subprocess, sys, tempfile, threading, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import app
from unittest.mock import patch
import time

class GitToolsTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name).resolve()
        self.work=self.root/'work';self.work.mkdir()
        self.rt=app.Runtime(self.root/'data',self.work)
        self.run={'settings':self.rt.settings(),'session_id':'test'}
        self.git('init','-q')
        self.git('config','user.name','Naru Test');self.git('config','user.email','test@example.invalid')
        (self.work/'a.txt').write_text('before\n')
        self.git('add','a.txt');self.git('commit','-qm','initial')
    def tearDown(self):
        for cancel in list(self.rt.controls.values()):cancel.set()
        end=time.monotonic()+5
        while self.rt.controls and time.monotonic()<end:time.sleep(.02)
        self.rt.store.db.close();self.temp.cleanup()
    def git(self,*args):return subprocess.run(['git',*args],cwd=self.work,check=True,capture_output=True,text=True).stdout
    def tool(self,name,**args):return self.rt.execute_tool(self.run,name,args,threading.Event())
    def test_status_and_unstaged_and_staged_diff_are_read_only(self):
        (self.work/'a.txt').write_text('after\n');(self.work/'new.txt').write_text('new\n')
        status=self.tool('git_status');self.assertIn(' M a.txt',status['output']);self.assertIn('?? new.txt',status['output']);self.assertTrue(status['untrusted'])
        diff=self.tool('git_diff');self.assertIn('-before',diff['output']);self.assertIn('+after',diff['output']);self.assertEqual(self.tool('git_diff',staged=True)['output'],'')
        self.git('add','a.txt');self.assertIn('+after',self.tool('git_diff',staged=True)['output']);self.assertEqual((self.work/'a.txt').read_text(),'after\n')
    def test_parent_repository_does_not_expand_workspace_boundary(self):
        child=self.work/'child';child.mkdir();self.run['settings']=dict(self.run['settings'],workspace=str(child))
        with self.assertRaisesRegex(ValueError,'루트'):self.tool('git_status')
    def test_diff_type_and_large_output(self):
        with self.assertRaises(ValueError):self.tool('git_diff',staged='true')
        (self.work/'a.txt').write_text('x'*30000+'\n')
        self.assertIn('출력 제한',self.tool('git_diff')['output'])
    def test_git_config_fsmonitor_command_is_not_executed(self):
        marker=self.root/'ran';self.git('config','core.fsmonitor',f'!touch {marker}')
        self.tool('git_status');self.assertFalse(marker.exists())
    def test_diff_requires_fresh_approval_before_reaching_model(self):
        (self.work/'a.txt').write_text('private change\n')
        sid='s';self.rt.store.put('sessions',dict(id=sid,title='test',provider_id='fixture',model='test',mode='agent',created_at=app.now(),updated_at=app.now()))
        self.rt.store.put('providers',dict(id='fixture',kind='openai',name='fixture',model='test',has_key=False,tools_enabled=True,base_url='http://127.0.0.1'))
        captured=[]
        def complete(p,ctx,*args,**kwargs):
            captured.append(list(ctx))
            if len(captured)==1:return {'content':'','tool_calls':[{'id':'d','name':'git_diff','arguments':{}}],'usage':{}}
            return {'content':'done','tool_calls':[],'usage':{}}
        with patch.object(app.providers,'complete',side_effect=complete):
            rid=self.rt.start(sid,{'content':'review changes','mode':'agent'})['run_id']
            end=time.monotonic()+5;approval=None
            while time.monotonic()<end and not approval:
                approval=next((a for a in self.rt.store.all('approvals') if a['run_id']==rid and a['status']=='pending'),None);time.sleep(.02)
            self.assertIsNotNone(approval);self.assertEqual(approval['tool'],'git_diff');self.assertEqual(len(captured),1)
            self.rt.store.patch('approvals',approval['id'],status='denied')
            while time.monotonic()<end and self.rt.store.get('runs',rid)['status'] in app.ACTIVE:time.sleep(.02)
        self.assertEqual(self.rt.store.get('runs',rid)['status'],'completed')
        self.assertNotIn('private change',str(captured))
    def test_pre_cancel_never_executes(self):
        cancel=threading.Event();cancel.set()
        with self.assertRaises(InterruptedError):self.rt.execute_tool(self.run,'git_status',{},cancel)

if __name__=='__main__':unittest.main()
