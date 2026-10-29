"""Project guidance stays within the chosen workspace and agent mode."""
import os, sys, tempfile, time, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import app

class ProjectContextTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name).resolve()
        self.work=self.root/'work';self.work.mkdir();self.rt=app.Runtime(self.root/'data',self.work)
        self.rt.store.put('providers',dict(id='fixture',kind='openai',name='Fixture',model='fixture',has_key=False,tools_enabled=True,base_url='http://127.0.0.1'))
        self.rt.store.put('sessions',dict(id='s',title='새 대화',provider_id='fixture',model='fixture',mode='agent',created_at=app.now(),updated_at=app.now()))
    def tearDown(self):
        for e in list(self.rt.controls.values()):e.set()
        end=time.monotonic()+5
        while self.rt.controls and time.monotonic()<end:time.sleep(.02)
        self.rt.store.db.close();self.tmp.cleanup()
    def test_fixed_files_only_no_links_fifos_invalid_or_oversize(self):
        (self.work/'AGENTS.md').write_text('Follow project conventions')
        (self.work/'.hermes.md').write_text('h'*8193)
        (self.work/'CLAUDE.md').symlink_to(self.root/'secret')
        (self.root/'secret').write_text('private outside workspace')
        os.mkfifo(self.work/'.cursorrules')
        (self.work/'NOTES.md').write_text('not eligible')
        nested=self.work/'child';nested.mkdir();(nested/'AGENTS.md').write_text('nested not automatic')
        self.assertEqual(self.rt.project_context(self.work),[('AGENTS.md','Follow project conventions')])
    def test_agent_sends_guidance_as_untrusted_and_records_file_names(self):
        (self.work/'AGENTS.md').write_text('Use 2-space indentation.')
        calls=[]
        def complete(p,ctx,*args,**kw):calls.append(ctx);return {'content':'ok','tool_calls':[],'usage':{}}
        with patch.object(app.providers,'complete',side_effect=complete):
            rid=self.rt.start('s',{'content':'please help','mode':'agent'})['run_id'];end=time.monotonic()+5
            while self.rt.store.get('runs',rid)['status'] in app.ACTIVE and time.monotonic()<end:time.sleep(.02)
        self.assertEqual(self.rt.store.get('runs',rid)['status'],'completed')
        self.assertEqual(calls[0][1]['role'],'user');self.assertIn('untrusted data',calls[0][1]['content']);self.assertIn('Use 2-space indentation.',calls[0][1]['content'])
        self.assertIn('higher-priority',calls[0][0]['content'])
        events=self.rt.store.where('events','run_id',rid)
        self.assertTrue(any('AGENTS.md' in x['data'].get('text','') for x in events))
    def test_chat_does_not_read_guidance(self):
        (self.work/'AGENTS.md').write_text('PROJECT_GUIDANCE_SECRET')
        calls=[]
        def complete(p,ctx,*args,**kw):calls.append(ctx);return {'content':'ok','tool_calls':[],'usage':{}}
        with patch.object(app.providers,'complete',side_effect=complete),patch.object(self.rt,'project_context',side_effect=AssertionError('chat must not read')):
            rid=self.rt.start('s',{'content':'hello','mode':'chat'})['run_id'];end=time.monotonic()+5
            while self.rt.store.get('runs',rid)['status'] in app.ACTIVE and time.monotonic()<end:time.sleep(.02)
        self.assertEqual(self.rt.store.get('runs',rid)['status'],'completed');self.assertNotIn('PROJECT_GUIDANCE_SECRET',str(calls))

if __name__=='__main__':unittest.main()
