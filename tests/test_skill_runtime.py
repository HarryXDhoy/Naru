import http.client
import json
import os
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from server import app


def wait_for(fn):
    deadline=time.monotonic()+6
    while time.monotonic()<deadline:
        value=fn()
        if value:return value
        time.sleep(.02)
    raise AssertionError('Timed out')


class SkillRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name).resolve()
        self.rt=app.Runtime(self.root/'data',self.root/'work')
        self.rt.store.put('providers',dict(id='test',kind='openai',name='test',model='test',base_url='http://127.0.0.1',tools_enabled=True,has_key=False))
        self.rt.store.put('sessions',dict(id='s',title='test',provider_id='test',model='test',mode='agent',created_at=app.now(),updated_at=app.now()))
        self.skill_dir=self.root/'installed'/'example';self.skill_dir.mkdir(parents=True)
        (self.skill_dir/'SKILL.md').write_text('---\nname: example\ndescription: >\n  First line\n  second line\n---\nRead references/guide.md',encoding='utf-8')
        (self.skill_dir/'references').mkdir();(self.skill_dir/'references'/'guide.md').write_text('REFERENCE VALUE')
        self.skill=self.rt.import_skill(str(self.skill_dir))
    def tearDown(self):
        for event in list(self.rt.controls.values()):event.set()
        wait_for(lambda:not self.rt.controls)
        self.rt.store.db.close();self.tmp.cleanup()
    def test_import_canonicalizes_selected_symlink_and_preserves_existing_edits(self):
        link=self.root/'linked';link.symlink_to(self.skill_dir,target_is_directory=True)
        self.assertEqual(self.skill['description'],'First line second line')
        self.assertEqual(self.rt.import_skill(str(link))['id'],self.skill['id'])
        self.rt.store.patch('skills',self.skill['id'],instructions='edited')
        self.assertEqual(self.rt.import_skill(str(link))['instructions'],'edited')
    def test_discovery_returns_metadata_without_instructions(self):
        with patch.object(app.Path,'home',return_value=self.root):
            base=self.root/'.agents'/'skills';base.mkdir(parents=True)
            (base/'linked').symlink_to(self.skill_dir,target_is_directory=True)
            found=self.rt.discover_skills()['skills']
        self.assertEqual(len(found),1);self.assertEqual(found[0]['name'],'example');self.assertTrue(found[0]['registered'])
        self.assertNotIn('instructions',found[0]);self.assertEqual(found[0]['path'],str(self.skill_dir))
    def test_only_selected_skill_can_read_nested_references_without_traversal_or_links(self):
        run={'settings':dict(self.rt.settings(),skill_roots={self.skill['id']:str(self.skill_dir)})}
        call=lambda path:self.rt.execute_tool(run,'read_skill_file',{'skill_id':self.skill['id'],'path':path},threading.Event())
        self.assertEqual(call('references/guide.md')['content'],'REFERENCE VALUE')
        with self.assertRaises(ValueError):call('../secret')
        outside=self.root/'outside';outside.write_text('SECRET')
        (self.skill_dir/'escape').symlink_to(outside)
        with self.assertRaises(OSError):call('escape')
        (self.skill_dir/'outside-dir').symlink_to(self.root,target_is_directory=True)
        with self.assertRaises(OSError):call('outside-dir/outside')
        fifo=self.skill_dir/'fifo';os.mkfifo(fifo)
        with self.assertRaises(ValueError):call('fifo')
        with self.assertRaises(ValueError):self.rt.execute_tool(run,'read_skill_file',{'skill_id':'other','path':'references/guide.md'},threading.Event())
    def test_selected_skill_context_includes_its_directory_only(self):
        other=self.root/'installed'/'other';other.mkdir();(other/'SKILL.md').write_text('---\nname: other\n---\nPRIVATE OTHER INSTRUCTIONS')
        self.rt.import_skill(str(other))
        selected=self.rt.system([self.skill['id']],self.rt.settings())
        self.assertIn('Base directory: '+str(self.skill_dir),selected)
        self.assertIn('read_skill_file',selected)
        self.assertNotIn(str(other),selected)
        self.assertNotIn('PRIVATE OTHER INSTRUCTIONS',selected)
        self.assertNotIn(str(self.skill_dir),self.rt.system([],self.rt.settings()))

    def test_auto_mode_asks_to_load_skill_and_snapshots_selected_root(self):
        self.rt.store.patch('settings','main',access_mode='auto_approve')
        responses=[{'content':'','tool_calls':[{'id':'c1','name':'load_skill','arguments':{'skill_id':self.skill['id']}}],'usage':{}},{'content':'done','tool_calls':[],'usage':{}}]
        with patch.object(app.providers,'complete',side_effect=lambda *a,**k:responses.pop(0)):
            rid=self.rt.start('s',{'content':'Use example skill','skill_ids':[]})['run_id']
            approval=wait_for(lambda:next((a for a in self.rt.store.where('approvals','run_id',rid) if a['status']=='pending'),None))
            before=self.rt.store.get('runs',rid);self.assertNotIn('skill_roots',self.rt.public_run(before));self.assertNotIn('loadable_skills',self.rt.public_run(before))
            self.assertNotIn('Read references/guide.md',before['context'][0]['content'])
            self.rt.store.patch('skills',self.skill['id'],source_dir=str(self.root/'changed'),instructions='changed')
            self.rt.store.patch('approvals',approval['id'],status='approved')
            done=wait_for(lambda:(r if (r:=self.rt.store.get('runs',rid))['status']=='completed' else None))
        self.assertEqual(done['settings']['skill_roots'][self.skill['id']],str(self.skill_dir))
        result=next(e['data']['result'] for e in self.rt.store.where('events','run_id',rid) if e['type']=='tool_result')
        self.assertIn('Read references/guide.md',result['instructions'])
        self.assertTrue(any(e['type']=='tool_call' and e['data']['name']=='load_skill' for e in self.rt.store.where('events','run_id',rid)))
    def test_full_access_auto_loads_only_enabled_snapshot(self):
        self.rt.store.patch('settings','main',access_mode='full_access')
        responses=[{'content':'','tool_calls':[{'id':'c1','name':'load_skill','arguments':{'skill_id':self.skill['id']}}],'usage':{}},{'content':'done','tool_calls':[],'usage':{}}]
        with patch.object(app.providers,'complete',side_effect=lambda *a,**k:responses.pop(0)):
            rid=self.rt.start('s',{'content':'Use example skill','skill_ids':[]})['run_id']
            done=wait_for(lambda:(r if (r:=self.rt.store.get('runs',rid))['status']=='completed' else None))
        self.assertEqual(self.rt.store.where('approvals','run_id',rid),[])
        event=next(e for e in self.rt.store.where('events','run_id',rid) if e['type']=='tool_call')
        self.assertTrue(event['data']['auto'])
        result=self.rt.execute_tool(done,'read_skill_file',{'skill_id':self.skill['id'],'path':'references/guide.md'},threading.Event())
        self.assertEqual(result['content'],'REFERENCE VALUE')
        with self.assertRaises(ValueError):self.rt.execute_tool(done,'load_skill',{'skill_id':'not-registered'},threading.Event())

    def test_agent_loads_skill_reads_reference_and_executes_approved_command(self):
        responses = [
            {'content':'','tool_calls':[{'id':'c1','name':'load_skill','arguments':{'skill_id':self.skill['id']}}],'usage':{}},
            {'content':'','tool_calls':[{'id':'c2','name':'read_skill_file','arguments':{'skill_id':self.skill['id'],'path':'references/guide.md'}}],'usage':{}},
            {'content':'','tool_calls':[{'id':'c3','name':'run_command','arguments':{'command':"printf 'helper output'"}}],'usage':{}},
            {'content':'done','tool_calls':[],'usage':{}},
        ]
        with patch.object(app.providers,'complete',side_effect=lambda *a,**k:responses.pop(0)):
            rid=self.rt.start('s',{'content':'Use the example skill','skill_ids':[]})['run_id']
            for tool_name in ('load_skill','run_command'):
                approval=wait_for(lambda:next((a for a in self.rt.store.where('approvals','run_id',rid) if a['status']=='pending' and a['tool']==tool_name),None))
                self.rt.store.patch('approvals',approval['id'],status='approved')
            done=wait_for(lambda:(r if (r:=self.rt.store.get('runs',rid))['status']=='completed' else None))
        results={e['data']['name']:e['data']['result'] for e in self.rt.store.where('events','run_id',rid) if e['type']=='tool_result'}
        self.assertIn('Read references/guide.md',results['load_skill']['instructions'])
        self.assertEqual(results['read_skill_file']['content'],'REFERENCE VALUE')
        self.assertEqual(results['run_command']['output'],'helper output')
        self.assertEqual(done['status'],'completed')

    def test_resuming_interrupted_skill_load_requires_new_approval(self):
        old=dict(id='old',session_id='s',provider_id='test',model='test',mode='agent',status='interrupted',
                 context=[{'role':'user','content':'Use skill'}],pending_calls=[dict(id='c1',name='load_skill',arguments={'skill_id':self.skill['id']})],
                 tool_cursor=0,settings=dict(self.rt.settings(),access_mode='full_access'),skill_ids=[],loadable_skills={self.skill['id']:self.skill})
        self.rt.store.put('runs',old)
        with patch.object(app.providers,'complete',return_value={'content':'done','tool_calls':[],'usage':{}}):
            rid=self.rt.start('s',{},resume='old')['run_id']
            approval=wait_for(lambda:next((a for a in self.rt.store.where('approvals','run_id',rid) if a['status']=='pending'),None))
            self.rt.store.patch('approvals',approval['id'],status='denied')
            done=wait_for(lambda:(r if (r:=self.rt.store.get('runs',rid))['status']=='completed' else None))
        self.assertNotIn(self.skill['id'],done['settings'].get('skill_roots',{}))

    def test_skill_update_keeps_source_but_rejects_client_replacement(self):
        server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler);server.runtime=self.rt
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            body={'id':self.skill['id'],'name':'edited','description':'','instructions':'updated','enabled':False,'source_dir':str(self.root)}
            c=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=4)
            c.request('POST','/api/skills',json.dumps(body),{'Content-Type':'application/json','X-Naru-Token':self.rt.csrf})
            response=c.getresponse();self.assertEqual(response.status,200);result=json.loads(response.read());c.close()
            self.assertEqual(result['source_dir'],str(self.skill_dir));self.assertFalse(result['enabled'])
        finally:server.shutdown();server.server_close();thread.join()
    def test_successful_command_stderr_and_truncation_are_visible(self):
        run={'settings':self.rt.settings()}
        result=self.rt.execute_tool(run,'run_command',{'command':"printf 'skill result' >&2"},threading.Event())
        self.assertEqual(result['output'],'skill result')
        result=self.rt.execute_tool(run,'run_command',{'command':"printf 'stdout'; printf 'skill result' >&2"},threading.Event())
        self.assertIn('stdout',result['output']);self.assertIn('[stderr]',result['output']);self.assertIn('skill result',result['output'])
        result=self.rt.execute_tool(run,'run_command',{'command':"python3 -c \"print('x'*25000)\""},threading.Event())
        self.assertIn('앞부분 생략',result['output'])

if __name__=='__main__':unittest.main()
