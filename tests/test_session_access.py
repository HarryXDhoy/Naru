import http.client, json, sys, tempfile, threading, unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import app

class SessionAccessTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.rt = app.Runtime(Path(self.tmp.name)/'data', Path(self.tmp.name)/'work')
        self.rt.store.put('providers',dict(id='p',kind='openai',name='fixture',model='m',has_key=False,tools_enabled=True,base_url='http://127.0.0.1'))
        for sid in ('a','b'):
            self.rt.store.put('sessions',dict(id=sid,title='test',provider_id='p',model='m',mode='agent',created_at=app.now(),updated_at=app.now()))
    def tearDown(self):
        self.rt.store.db.close();self.tmp.cleanup()
    def finish(self,sid,rid,status='completed'):
        self.rt.store.patch('runs',rid,status=status)
        self.rt.controls.pop(rid,None);self.rt.live.pop(rid,None);self.rt.active.pop(sid,None)
    def test_overrides_are_per_chat_and_snapshot_is_stable(self):
        self.rt.store.patch('settings','main',access_mode='auto_approve')
        a=self.rt.start('a',{'content':'one'},defer=True)['run_id']
        self.rt.update_session('b',{'access_mode':'full_access'})
        b=self.rt.start('b',{'content':'two'},defer=True)['run_id']
        self.assertEqual(self.rt.store.get('runs',a)['settings']['access_mode'],'auto_approve')
        self.assertEqual(self.rt.store.get('runs',b)['settings']['access_mode'],'full_access')
        self.rt.update_session('b',{'access_mode':'manual'})
        self.assertEqual(self.rt.store.get('runs',b)['settings']['access_mode'],'full_access')
        self.finish('b',b,'failed')
        resumed=self.rt.start('b',{},resume=b,defer=True)['run_id']
        self.assertEqual(self.rt.store.get('runs',resumed)['settings']['access_mode'],'full_access')
        self.finish('b',resumed)
        new=self.rt.start('b',{'content':'three'},defer=True)['run_id']
        self.assertEqual(self.rt.store.get('runs',new)['settings']['access_mode'],'manual')
    def test_queue_keeps_most_restrictive_effective_access(self):
        pairs=[('manual','full_access','manual'),('full_access','manual','manual'),('auto_approve','full_access','auto_approve')]
        for before,after,expected in pairs:
            self.rt.update_session('a',{'access_mode':before})
            self.rt.store.patch('sessions','a',queue_paused=True)
            self.rt.enqueue('a',{'content':'pending'})
            self.rt.update_session('a',{'access_mode':after})
            with patch.object(self.rt,'execute',return_value=None):
                rid=self.rt.dispatch_queue('a',resume=True)['run_id']
            self.assertEqual(self.rt.store.get('runs',rid)['settings']['access_mode'],expected)
            self.finish('a',rid)
        self.rt.update_session('a',{'access_mode':'inherit'})
        self.rt.store.patch('settings','main',access_mode='full_access')
        self.rt.store.patch('sessions','a',queue_paused=True)
        self.rt.enqueue('a',{'content':'pending'})
        self.rt.store.patch('settings','main',access_mode='manual')
        with patch.object(self.rt,'execute',return_value=None):rid=self.rt.dispatch_queue('a',resume=True)['run_id']
        self.assertEqual(self.rt.store.get('runs',rid)['settings']['access_mode'],'manual')
    def test_invalid_existing_override_fails_closed_and_regenerate_uses_new_access(self):
        self.rt.store.patch('sessions','a',access_mode='unexpected')
        self.assertEqual(self.rt.session_settings(self.rt.session('a'))['access_mode'],'manual')
        self.rt.update_session('a',{'access_mode':'full_access'})
        rid=self.rt.start('a',{'content':'request'},defer=True)['run_id'];self.finish('a',rid)
        self.rt.message('a','assistant','answer')
        self.rt.update_session('a',{'access_mode':'manual'})
        with patch.object(self.rt,'execute',return_value=None):new=self.rt.regenerate('a')['run_id']
        self.assertEqual(self.rt.store.get('runs',new)['settings']['access_mode'],'manual')

class SessionAccessHTTPTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.rt=app.Runtime(Path(self.tmp.name)/'data',Path(self.tmp.name)/'work')
        self.http=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler);self.http.runtime=self.rt
        self.thread=threading.Thread(target=self.http.serve_forever,daemon=True);self.thread.start()
    def tearDown(self):
        self.http.shutdown();self.thread.join();self.http.server_close();self.rt.store.db.close();self.tmp.cleanup()
    def request(self,method,path,body):
        conn=http.client.HTTPConnection('127.0.0.1',self.http.server_port,timeout=3)
        conn.request(method,path,json.dumps(body),{'Content-Type':'application/json','X-Naru-Token':self.rt.csrf})
        response=conn.getresponse();result=json.loads(response.read());conn.close();return response.status,result
    def test_create_patch_validation_and_legacy_default(self):
        status,s=self.request('POST','/api/sessions',{'title':'new','access_mode':'full_access'})
        self.assertEqual(status,200);self.assertEqual(s['access_mode'],'full_access')
        sid=s['id'];self.assertEqual(self.request('PATCH','/api/sessions/'+sid,{'access_mode':'inherit'})[1]['access_mode'],'inherit')
        for val in ('bogus',None,[],True):
            self.assertEqual(self.request('PATCH','/api/sessions/'+sid,{'access_mode':val})[0],400)
            self.assertEqual(self.request('POST','/api/sessions',{'access_mode':val})[0],400)
        self.assertEqual(self.rt.session(sid)['access_mode'],'inherit')
        self.assertEqual(self.request('POST','/api/sessions',{})[1]['access_mode'],'inherit')

if __name__=='__main__':unittest.main()
