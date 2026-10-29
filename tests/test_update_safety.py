import http.client, json, plistlib, stat, sys, tempfile, threading, unittest, zipfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'desktop'))
import app, update_helper

class UpdateLockTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();root=Path(self.tmp.name);self.rt=app.Runtime(root/'data',root/'work')
  self.rt.store.put('providers',dict(id='p',kind='openai',name='fixture',model='m',has_key=False,tools_enabled=True,base_url='http://127.0.0.1'))
  self.rt.store.put('sessions',dict(id='s',title='s',provider_id='p',model='m',mode='chat',created_at=app.now(),updated_at=app.now()))
 def tearDown(self):self.rt.store.db.close();self.tmp.cleanup()
 def test_block_active_prevent_new_work_and_unlock(self):
  rid=self.rt.start('s',{'content':'first'},defer=True)['run_id']
  with self.assertRaises(ValueError):self.rt.prepare_update()
  self.rt.store.patch('runs',rid,status='completed');self.rt.active.clear();self.rt.controls.clear();self.rt.live.clear()
  self.rt.store.patch('sessions','s',queue_paused=True);self.rt.enqueue('s',{'content':'waiting'})
  self.rt.prepare_update()
  for f in (lambda:self.rt.start('s',{'content':'new'}),lambda:self.rt.enqueue('s',{'content':'new'}),lambda:self.rt.dispatch_queue('s',resume=True)):
   with self.assertRaises(ValueError):f()
  self.assertEqual(len(self.rt.store.where('queued_messages','session_id','s')),1)
  self.rt.cancel_update()
  with patch.object(self.rt,'execute',return_value=None):self.assertTrue(self.rt.dispatch_queue('s',resume=True)['run_id'])
 def test_http_lock_requires_token(self):
  server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler);server.runtime=self.rt
  thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  try:
   def send(route,token=None):
    conn=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=3)
    conn.request('POST',route,'{}',{'Content-Type':'application/json',**({'X-Naru-Token':token} if token else {})})
    result=conn.getresponse();data=json.loads(result.read());status=result.status;conn.close();return status,data
   self.assertEqual(send('/api/update/prepare')[0],403);self.assertFalse(self.rt.updating)
   self.assertEqual(send('/api/update/prepare',self.rt.csrf),(200,{'ok':True}));self.assertTrue(self.rt.updating)
   self.assertEqual(send('/api/update/cancel',self.rt.csrf),(200,{'ok':True}));self.assertFalse(self.rt.updating)
  finally:server.shutdown();thread.join();server.server_close()

class ArchiveTest(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
 def tearDown(self):self.tmp.cleanup()
 def archive(self,extra=()):
  p=self.root/'a.zip';main={'Naru.app/Contents/Info.plist':plistlib.dumps({'CFBundleIdentifier':'app.naru.personal','CFBundleShortVersionString':'1.2.3'}),'Naru.app/Contents/Resources/app/package.json':b'{"version":"1.2.3"}','Naru.app/Contents/Resources/app/server/app.py':b'pass','Naru.app/Contents/MacOS/Naru':b'\xcf\xfa\xed\xfe\x0c\x00\x00\x01'}
  with zipfile.ZipFile(p,'w') as z:
   for name,data in main.items():z.writestr(name,data)
   for item,data in extra:z.writestr(item,data)
  return p
 def test_valid_bundle_and_internal_symlink(self):
  link=zipfile.ZipInfo('Naru.app/Contents/Frameworks/link');link.create_system=3;link.external_attr=(stat.S_IFLNK|0o777)<<16
  p=self.archive([(link,'../Resources')]);d=self.root/'out';d.mkdir();update_helper.extract_archive(p,d,'1.2.3');self.assertTrue((d/'Naru.app/Contents/Frameworks/link').is_symlink())
 def test_reject_escape_link_and_traversal(self):
  for name,value in [('Naru.app/evil','../../../etc/passwd'),('../evil','x')]:
   link=zipfile.ZipInfo(name);link.create_system=3;link.external_attr=(stat.S_IFLNK|0o777)<<16
   p=self.archive([(link,value)]);d=self.root/('out'+str(len(list(self.root.iterdir()))));d.mkdir()
   with self.assertRaises(ValueError):update_helper.extract_archive(p,d,'1.2.3')
 def test_reject_entry_below_symlink(self):
  link=zipfile.ZipInfo('Naru.app/Contents/link');link.create_system=3;link.external_attr=(stat.S_IFLNK|0o777)<<16
  p=self.archive([(link,'Resources'),('Naru.app/Contents/link/evil','x')]);d=self.root/'out';d.mkdir()
  with self.assertRaises(ValueError):update_helper.extract_archive(p,d,'1.2.3')
 def test_reject_symlink_chain_escaping_bundle(self):
  a=zipfile.ZipInfo('Naru.app/Contents/a');a.create_system=3;a.external_attr=(stat.S_IFLNK|0o777)<<16
  b=zipfile.ZipInfo('Naru.app/Contents/b');b.create_system=3;b.external_attr=(stat.S_IFLNK|0o777)<<16
  p=self.archive([(a,'..'),(b,'a/../../outside')]);d=self.root/'out';d.mkdir();(d/'outside').write_text('x')
  with self.assertRaises(ValueError):update_helper.extract_archive(p,d,'1.2.3')
 def test_reject_wrong_version(self):
  p=self.archive();d=self.root/'out';d.mkdir()
  with self.assertRaises(ValueError):update_helper.extract_archive(p,d,'1.2.4')

class InstallTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.target=self.root/'Naru.app';self.target.mkdir();(self.target/'old').write_text('old')
  self.update=self.root/'.naru-update-test';self.update.mkdir();(self.update/'Naru.app').mkdir();(self.update/'Naru.app'/'new').write_text('new')
  self.stage=self.root/'stage';self.stage.mkdir();self.marker=self.stage/'startup-ready'
 def tearDown(self):self.tmp.cleanup()
 def test_switch_only_after_new_app_ready(self):
  def opened(*args,**kwargs):self.marker.write_text('ready')
  with patch.object(update_helper.os,'kill',side_effect=ProcessLookupError),patch.object(update_helper,'processes_using_bundle',return_value=False),patch.object(update_helper,'launch',side_effect=opened):update_helper.install(self.target,self.update,123,self.marker)
  self.assertTrue((self.target/'new').exists());self.assertFalse((self.target/'old').exists());self.assertFalse(self.update.exists())
 def test_launch_failure_restores_previous_bundle(self):
  results=[OSError('failed'),None]
  with patch.object(update_helper.os,'kill',side_effect=ProcessLookupError),patch.object(update_helper,'processes_using_bundle',return_value=False),patch.object(update_helper,'launch',side_effect=results):
   with self.assertRaises(OSError):update_helper.install(self.target,self.update,123,self.marker)
  self.assertTrue((self.target/'old').exists());self.assertFalse((self.target/'new').exists())
 def test_does_not_swap_while_new_process_cannot_be_stopped(self):
  with patch.object(update_helper.os,'kill',side_effect=ProcessLookupError),patch.object(update_helper,'processes_using_bundle',return_value=False),patch.object(update_helper,'launch'),patch.object(update_helper.time,'monotonic',side_effect=[0,1,2,48]),patch.object(update_helper,'stop_started_app',return_value=False):
   with self.assertRaises(RuntimeError):update_helper.install(self.target,self.update,123,self.marker)
  self.assertTrue((self.target/'new').exists());self.assertTrue((self.update/'previous.app'/'old').exists())
 def test_old_backend_running_blocks_bundle_swap(self):
  with patch.object(update_helper.os,'kill',side_effect=ProcessLookupError),patch.object(update_helper,'processes_using_bundle',return_value=True),patch.object(update_helper.time,'monotonic',side_effect=[0,1,31]),patch.object(update_helper.time,'sleep'):
   with self.assertRaises(RuntimeError):update_helper.install(self.target,self.update,123,self.marker)
  self.assertTrue((self.target/'old').exists());self.assertFalse((self.target/'new').exists())
 def test_launch_inherits_environment_without_shell(self):
  with patch.object(update_helper.subprocess,'Popen') as p:
   update_helper.launch(self.target,self.marker,'/tmp/custom user data')
  args,kwargs=p.call_args
  self.assertEqual(args[0][0],str(self.target/'Contents/MacOS/Naru'));self.assertIn('--user-data-dir=/tmp/custom user data',args[0]);self.assertNotIn('env',kwargs);self.assertFalse(kwargs.get('shell',False))
