import http.client
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from server import app


def wait_for(fn):
    end = time.monotonic() + 5
    while time.monotonic() < end:
        result = fn()
        if result:
            return result
        time.sleep(.02)
    raise AssertionError('Timed out waiting for run')


class AccessModesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.rt = app.Runtime(self.root / 'data', self.root / 'work')
        self.rt.store.patch('settings', 'main', report_directory=str(self.root / 'reports'))
        self.rt.store.put('providers', dict(id='test', kind='openai', name='test', model='test', tools_enabled=True, base_url='http://127.0.0.1'))
        self.rt.store.put('sessions', dict(id='session', title='test', provider_id='test', model='test', mode='agent', created_at=app.now(), updated_at=app.now()))

    def tearDown(self):
        for control in self.rt.controls.values():
            control.set()
        wait_for(lambda: not self.rt.controls)
        self.rt.store.db.close()
        self.tmp.cleanup()

    def run_call(self, name, args):
        responses = [dict(content='', tool_calls=[dict(id='call', name=name, arguments=args)], usage={}), dict(content='done', tool_calls=[], usage={})]
        return patch.object(app.providers, 'complete', side_effect=lambda *a, **kw: responses.pop(0))

    def test_auto_approve_executes_and_keeps_external_file_boundary(self):
        self.assertEqual(self.rt.settings()['access_mode'], 'manual')
        self.rt.store.patch('settings', 'main', access_mode='auto_approve')
        with self.run_call('write_file', {'path': 'out.txt', 'content': 'ok'}):
            rid = self.rt.start('session', {'content': 'write'})['run_id']
            wait_for(lambda: self.rt.store.get('runs', rid)['status'] == 'completed')
        self.assertEqual((self.root / 'work' / 'out.txt').read_text(), 'ok')
        self.assertEqual(self.rt.store.all('approvals'), [])
        event = next(e for e in self.rt.store.where('events', 'run_id', rid) if e['type'] == 'tool_call')
        self.assertTrue(event['data']['auto'])
        with self.assertRaises(ValueError):
            self.rt.resolve('../external', self.rt.settings(), True)

    def test_full_access_write_and_search_outside_workspace(self):
        self.rt.store.patch('settings', 'main', access_mode='full_access')
        outside = self.root / 'external.txt'
        with self.run_call('write_file', {'path': str(outside), 'content': 'outside text'}):
            rid = self.rt.start('session', {'content': 'write outside'})['run_id']
            wait_for(lambda: self.rt.store.get('runs', rid)['status'] == 'completed')
        self.assertEqual(outside.read_text(), 'outside text')
        result = self.rt.execute_tool(self.rt.store.get('runs', rid), 'search_files', {'path': str(self.root), 'query': 'outside text'}, threading.Event())
        self.assertTrue(any(m['path'] == str(outside) for m in result['matches']))

    def test_sensitive_history_requires_manual_approval_except_in_full_access(self):
        self.rt.store.patch('settings', 'main', access_mode='auto_approve')
        with self.run_call('search_sessions', {'query': 'private'}):
            rid = self.rt.start('session', {'content': 'recall'})['run_id']
            approval = wait_for(lambda: next((a for a in self.rt.store.where('approvals', 'run_id', rid) if a['status'] == 'pending'), None))
            self.rt.store.patch('approvals', approval['id'], status='denied')
            wait_for(lambda: self.rt.store.get('runs', rid)['status'] == 'completed')
        self.rt.store.patch('settings', 'main', access_mode='full_access')
        with self.run_call('search_sessions', {'query': 'private'}):
            rid = self.rt.start('session', {'content': 'recall again'})['run_id']
            wait_for(lambda: self.rt.store.get('runs', rid)['status'] == 'completed')
        self.assertEqual(self.rt.store.where('approvals', 'run_id', rid), [])
        event = next(e for e in self.rt.store.where('events', 'run_id', rid) if e['type'] == 'tool_call')
        self.assertTrue(event['data']['auto'])

    def test_mode_snapshot_and_resume_reviews_pending_action(self):
        self.rt.store.patch('settings', 'main', access_mode='manual')
        with self.run_call('write_file', {'path': 'pending.txt', 'content': 'ok'}):
            rid = self.rt.start('session', {'content': 'write'})['run_id']
            wait_for(lambda: self.rt.store.get('runs', rid)['status'] == 'awaiting_approval')
            self.rt.store.patch('settings', 'main', access_mode='full_access')
            self.rt.cancel(rid)
            wait_for(lambda: self.rt.store.get('runs', rid)['status'] == 'cancelled')
        with patch.object(app.providers, 'complete', return_value={'content':'done', 'tool_calls':[], 'usage':{}}):
            resumed = self.rt.start('session', {}, resume=rid)['run_id']
            approval = wait_for(lambda: next((a for a in self.rt.store.where('approvals', 'run_id', resumed) if a['status'] == 'pending'), None))
            self.assertEqual(self.rt.store.get('runs', resumed)['settings']['access_mode'], 'manual')
            self.assertFalse((self.root / 'work' / 'pending.txt').exists())
            self.rt.store.patch('approvals', approval['id'], status='approved')
            wait_for(lambda: self.rt.store.get('runs', resumed)['status'] == 'completed')

    def test_full_access_resume_requires_review_of_interrupted_pending_action(self):
        self.rt.store.patch('settings', 'main', access_mode='full_access')
        old = dict(id='interrupted', session_id='session', provider_id='test', model='test', mode='agent', status='interrupted', context=[{'role':'user','content':'write'}], pending_calls=[dict(id='oldcall', name='write_file', arguments={'path':'resumed.txt','content':'ok'})], tool_cursor=0, settings=self.rt.settings(), skill_ids=[])
        self.rt.store.put('runs', old)
        self.rt.store.patch('settings', 'main', access_mode='manual')
        with patch.object(app.providers, 'complete', return_value={'content':'done', 'tool_calls':[], 'usage':{}}):
            resumed = self.rt.start('session', {}, resume='interrupted')['run_id']
            approval = wait_for(lambda: next((a for a in self.rt.store.where('approvals', 'run_id', resumed) if a['status'] == 'pending'), None))
            self.assertEqual(self.rt.store.get('runs', resumed)['settings']['access_mode'], 'full_access')
            self.assertFalse((self.root / 'work' / 'resumed.txt').exists())
            self.rt.store.patch('approvals', approval['id'], status='approved')
            wait_for(lambda: self.rt.store.get('runs', resumed)['status'] == 'completed')
        self.assertEqual((self.root / 'work' / 'resumed.txt').read_text(), 'ok')

    def test_settings_validation(self):
        server = app.ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        server.runtime = self.rt
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            for mode, status in [('auto_approve', 200), ('invalid', 400)]:
                conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=4)
                conn.request('POST', '/api/settings', json.dumps({'access_mode':mode}), {'Content-Type':'application/json', 'X-Naru-Token':self.rt.csrf})
                response = conn.getresponse()
                self.assertEqual(response.status, status)
                response.read()
                conn.close()
            self.assertEqual(self.rt.settings()['access_mode'], 'auto_approve')
        finally:
            server.shutdown()
            server.server_close()

if __name__ == '__main__':
    unittest.main()
