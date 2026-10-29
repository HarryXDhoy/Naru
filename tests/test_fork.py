import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from server import app


class ForkTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name).resolve()
        self.rt=app.Runtime(self.root/'data',self.root/'workspace')
        self.rt.store.put('sessions',dict(id='s',title='Original',provider_id='codex',model='gpt-6-astra',mode='plan',access_mode='full_access',reasoning_effort='high',created_at=app.now(),updated_at=app.now()))
        self.first=self.rt.message('s','user','Look',images=[{'name':'input.png','mime':'image/png','data':'dGVzdA=='}])
        self.generated=self.rt.message('s','assistant','이미지를 만들었어요.',run_id='image-run',create_image=True)
        self.rt.message('s','user','Later message')
        self.image=self.root/'data'/'generated'/'naru-test.png'
        self.image.parent.mkdir()
        self.image.write_bytes(b'fixture image')
        self.rt.store.put('runs',dict(id='image-run',session_id='s',status='completed',started_at=app.now()))
        self.rt.store.put('artifacts',dict(id='image',session_id='s',run_id='image-run',image_generated=True,name=self.image.name,path=str(self.image),parent=str(self.image.parent),size=self.image.stat().st_size,created_at=app.now()))
        self.rt.store.put('queued_messages',dict(id='q',session_id='s',content='queued'))
        self.rt.store.put('approvals',dict(id='a',run_id='image-run',status='denied'))

    def tearDown(self):
        self.rt.store.db.close()
        self.tmp.cleanup()

    def test_selected_history_only_and_independent_images_after_original_deleted(self):
        branch=self.rt.fork_session('s',self.generated['id'])['session']
        self.assertEqual((branch['title'],branch['provider_id'],branch['model'],branch['mode'],branch['access_mode'],branch['reasoning_effort']),('Original · 분기','codex','gpt-6-astra','plan','full_access','high'))
        view=self.rt.session_view(branch['id'])
        self.assertEqual([m['content'] for m in view['messages']],['Look','이미지를 만들었어요.'])
        self.assertEqual(view['messages'][0]['images'],self.first['images'])
        self.assertTrue(all(m['session_id']==branch['id'] for m in view['messages']))
        self.assertNotEqual(view['messages'][0]['id'],self.first['id'])
        self.assertEqual(view['runs'],[])
        self.assertEqual(view['approvals'],[])
        self.assertEqual(view['queue'],[])
        self.assertEqual(len(view['artifacts']),1)
        self.assertEqual(view['artifacts'][0]['message_id'],view['messages'][1]['id'])
        self.assertNotIn('run_id',view['artifacts'][0])
        self.assertEqual(self.rt.artifact_bytes(view['artifacts'][0]),b'fixture image')
        self.rt.delete_session('s')
        self.assertEqual(self.rt.artifact_bytes(self.rt.session_view(branch['id'])['artifacts'][0]),b'fixture image')
        second=self.rt.fork_session(branch['id'],view['messages'][1]['id'])['session']
        self.assertEqual(len(self.rt.session_view(second['id'])['artifacts']),1)

    def test_wrong_message_id_and_oversized_fork_make_no_changes(self):
        before=len(self.rt.store.all('sessions'))
        with self.assertRaises(ValueError):self.rt.fork_session('s','wrong')
        self.assertEqual(len(self.rt.store.all('sessions')),before)
        with patch.object(app.json,'dumps',return_value='x'*(32*1024*1024+1)):
            with self.assertRaisesRegex(ValueError,'너무 깁니다'):self.rt.fork_session('s',self.first['id'])
        self.assertEqual(len(self.rt.store.all('sessions')),before)

    def test_active_original_remains_running_and_queue_stays_there(self):
        self.rt.store.patch('runs','image-run',status='running')
        self.rt.active['s']='image-run'
        branch=self.rt.fork_session('s',self.first['id'])['session']
        self.assertEqual(self.rt.store.get('runs','image-run')['status'],'running')
        self.assertEqual(self.rt.active['s'],'image-run')
        self.assertEqual(self.rt.session_view(branch['id'])['queue'],[])
        self.assertEqual(self.rt.session_view(branch['id'])['artifacts'],[])

    def test_http_fork_endpoint(self):
        server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler);server.runtime=self.rt
        threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            c=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=5)
            c.request('POST','/api/sessions/s/fork',json.dumps({'message_id':self.first['id']}),{'Content-Type':'application/json','X-Naru-Token':self.rt.csrf})
            response=c.getresponse();payload=json.loads(response.read());c.close()
            self.assertEqual(response.status,200)
            self.assertEqual(len(self.rt.session_view(payload['session']['id'])['messages']),1)
        finally:server.shutdown();server.server_close()


if __name__=='__main__':unittest.main()
