"""Focused local regressions for Naru execution boundaries and restart safety."""
import copy
import http.client
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from server import app


class SafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='naru-safety-')
        self.root = Path(self.temp.name).resolve()
        self.workspace = self.root / 'workspace'
        self.rt = app.Runtime(self.root / 'data', self.workspace)
        self.rt.store.patch('settings','main',report_directory=str(self.root/'reports'))
        self.sid='session-test'
        self.rt.store.put('sessions',dict(id=self.sid,title='Test',provider_id='codex',model='',mode='agent',created_at=app.now(),updated_at=app.now()))
        self.http=None

    def tearDown(self):
        if self.http:
            self.http.shutdown();self.http.server_close()
        for cancel in self.rt.controls.values():cancel.set()
        self.rt.store.db.close()
        self.temp.cleanup()

    def run_record(self, id='run-test', status='running', pending=None, cursor=0):
        run=dict(id=id,session_id=self.sid,provider_id='codex',model='',mode='agent',status=status,started_at=app.now(),finished_at=None,error=None,usage={},context=[{'role':'user','content':'Make a file'}],pending_calls=pending or [],tool_cursor=cursor,settings=copy.deepcopy(self.rt.settings()),skill_ids=[])
        return self.rt.store.put('runs',run)

    def start_http(self):
        self.http=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        self.http.runtime=self.rt
        self.http.daemon_threads=True
        threading.Thread(target=self.http.serve_forever,daemon=True).start()
        return self.http.server_port

    def request(self,method,path,body=None,headers=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.http.server_port,timeout=4)
        data=json.dumps(body).encode() if body is not None else None
        supplied={'Content-Type':'application/json'}
        supplied.update(headers or {})
        conn.request(method,path,body=data,headers=supplied)
        response=conn.getresponse();code=response.status;raw=response.read();conn.close()
        return code,json.loads(raw)

    def test_cancelled_tool_never_creates_file(self):
        run=self.run_record();cancel=threading.Event();cancel.set()
        with self.assertRaises(InterruptedError):self.rt.execute_tool(run,'write_file',{'path':'should-not-exist.txt','content':'hello'},cancel)
        self.assertFalse((self.workspace/'should-not-exist.txt').exists())

    def test_stop_between_approval_and_action_does_not_write(self):
        pending=[{'id':'call-1','name':'write_file','arguments':{'path':'after-approval.txt','content':'hello'}}]
        run=self.run_record(pending=pending);cancel=threading.Event()
        def approve(*args):cancel.set();return True
        with patch.object(self.rt,'approve',side_effect=approve),patch.object(self.rt,'execute_tool',wraps=self.rt.execute_tool) as execute:
            self.rt.execute(run['id'],cancel)
            execute.assert_not_called()
        self.assertEqual(self.rt.store.get('runs',run['id'])['status'],'cancelled')
        self.assertFalse((self.workspace/'after-approval.txt').exists())

    def test_resume_preserves_workspace_and_completed_tool_cursor(self):
        calls=[{'id':'call-1','name':'write_file','arguments':{'path':'first.txt','content':'one'}},{'id':'call-2','name':'write_file','arguments':{'path':'second.txt','content':'two'}}]
        old=self.run_record(status='interrupted',pending=calls,cursor=1)
        self.rt.store.patch('settings','main',workspace=str(self.root/'different-workspace'))
        with patch.object(threading.Thread,'start'):
            result=self.rt.start(self.sid,{},resume=old['id'])
        new=self.rt.store.get('runs',result['run_id'])
        self.assertEqual(new['settings'],old['settings'])
        self.assertEqual(new['tool_cursor'],1)
        self.assertEqual(new['pending_calls'],calls)
        events=[e for e in self.rt.store.all('events') if e['run_id']==new['id']]
        self.assertTrue(any('이미 일부 실행' in e['data'].get('text','') for e in events))

    def test_resume_old_run_rejected_after_newer_turn(self):
        old=self.run_record(id='old',status='failed')
        self.run_record(id='new',status='completed')
        with self.assertRaisesRegex(ValueError,'최근 실행'):self.rt.start(self.sid,{},resume=old['id'])
        self.assertEqual(len(self.rt.store.all('runs')),2)

    def test_restart_interrupts_runs_and_expires_approval(self):
        self.run_record(status='awaiting_approval')
        self.rt.store.put('approvals',{'id':'approval-1','run_id':'run-test','status':'pending','tool':'write_file','arguments':{},'created_at':app.now()})
        self.rt.store.db.close()
        self.rt=app.Runtime(self.root/'data',self.workspace)
        self.assertEqual(self.rt.store.get('runs','run-test')['status'],'interrupted')
        self.assertEqual(self.rt.store.get('approvals','approval-1')['status'],'expired')

    def test_regular_read_rejects_fifo_symlink_and_oversize(self):
        large=self.workspace/'large.txt';large.write_bytes(b'a'*11)
        with self.assertRaises(ValueError):self.rt.read_regular(large,10)
        fifo=self.workspace/'fifo';os.mkfifo(fifo)
        started=time.monotonic()
        with self.assertRaises(ValueError):self.rt.read_regular(fifo,10)
        self.assertLess(time.monotonic()-started,.5)
        symlink=self.workspace/'link';symlink.symlink_to(large)
        with self.assertRaises(OSError):self.rt.read_regular(symlink,100)
        outside=self.root/'secret.txt';outside.write_text('outside')
        symlink.unlink();symlink.symlink_to(outside)
        with self.assertRaises(ValueError):self.rt.resolve('link',self.rt.settings())

    def test_artifact_rejects_file_and_parent_symlink_swaps(self):
        folder=self.workspace/'artifacts';folder.mkdir()
        target=folder/'report.html';target.write_text('safe')
        a=self.rt.register_artifact(self.sid,target)
        self.assertEqual(self.rt.artifact_bytes(a),b'safe')
        outside=self.root/'outside';outside.mkdir();(outside/'report.html').write_text('secret')
        target.unlink();target.symlink_to(outside/'report.html')
        with self.assertRaises(ValueError):self.rt.artifact_bytes(a)
        target.unlink();folder.rmdir();folder.symlink_to(outside,target_is_directory=True)
        with self.assertRaises(ValueError):self.rt.artifact_bytes(a)

    def test_subprocess_output_cap_stops_noisy_command(self):
        code='import os,time; os.write(1,b"x"*1500000); time.sleep(4)'
        started=time.monotonic()
        with self.assertRaisesRegex(ValueError,'1 MB'):self.rt.process([sys.executable,'-c',code],None,threading.Event(),10)
        self.assertLess(time.monotonic()-started,3)

    def test_http_rejects_foreign_host_origin_and_missing_csrf(self):
        port=self.start_http()
        self.assertEqual(self.request('GET','/api/health')[0],200)
        self.assertEqual(self.request('GET','/api/health',headers={'Host':'attacker.example'})[0],403)
        self.assertEqual(self.request('GET','/api/health',headers={'Origin':'https://attacker.example'})[0],403)
        self.assertEqual(self.request('POST','/api/memories',{'content':'must not save'})[0],403)
        self.assertEqual(self.rt.store.all('memories'),[])
        code,data=self.request('POST','/api/memories',{'content':'explicit note'},{'X-Naru-Token':self.rt.csrf,'Origin':f'http://127.0.0.1:{port}'})
        self.assertEqual(code,200);self.assertEqual(data['content'],'explicit note')

    def test_approval_decision_is_atomic_and_expired_run_is_rejected(self):
        self.start_http();self.run_record(status='awaiting_approval')
        self.rt.store.put('approvals',{'id':'approval-1','run_id':'run-test','status':'pending','tool':'write_file','arguments':{},'created_at':app.now()})
        codes=[];barrier=threading.Barrier(3)
        def decide(decision):
            barrier.wait()
            codes.append(self.request('POST','/api/approvals/approval-1',{'decision':decision},{'X-Naru-Token':self.rt.csrf})[0])
        threads=[threading.Thread(target=decide,args=(d,)) for d in ('approve','deny')]
        for t in threads:t.start()
        barrier.wait()
        for t in threads:t.join(timeout=5)
        self.assertEqual(sorted(codes),[200,400])
        self.rt.store.patch('approvals','approval-1',status='pending')
        self.rt.store.patch('runs','run-test',status='cancelled')
        self.assertEqual(self.request('POST','/api/approvals/approval-1',{'decision':'approve'},{'X-Naru-Token':self.rt.csrf})[0],400)


if __name__=='__main__':unittest.main()
