import http.client, json, sys, tempfile, threading, unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import app


class WorkflowAPITests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.rt = app.Runtime(self.root / 'data', self.root / 'workspace')
        self.http = app.ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        self.http.runtime = self.rt
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.accounts = patch.object(self.rt, 'accounts_cached', return_value={})
        self.accounts.start()

    def tearDown(self):
        self.accounts.stop()
        self.http.shutdown(); self.thread.join(); self.http.server_close()
        self.rt.store.db.close(); self.tmp.cleanup()

    def request(self, method, path, body=None, auth=True):
        conn = http.client.HTTPConnection('127.0.0.1', self.http.server_port, timeout=3)
        headers = {'Content-Type': 'application/json'}
        if auth: headers['X-Naru-Token'] = self.rt.csrf
        conn.request(method, path, None if body is None else json.dumps(body), headers)
        response = conn.getresponse()
        payload = json.loads(response.read())
        conn.close()
        return response.status, payload

    def test_create_update_restart_and_delete_without_executing(self):
        status, created = self.request('POST', '/api/workflows', {'name':' 보고서 ', 'prompt':' 자료를 조사해 정리해 줘. ', 'mode':'agent'})
        self.assertEqual(status, 200)
        self.assertEqual((created['name'], created['prompt'], created['mode']), ('보고서', '자료를 조사해 정리해 줘.', 'agent'))
        self.assertEqual(set(created), {'id', 'name', 'prompt', 'mode'})
        status, changed = self.request('PATCH', '/api/workflows/' + created['id'], {'name':'요약', 'mode':'chat', 'id':'ignored', 'access_mode':'full_access'})
        self.assertEqual(status, 200)
        self.assertEqual(changed, {'id':created['id'], 'name':'요약', 'prompt':created['prompt'], 'mode':'chat'})
        self.assertEqual(self.request('GET', '/api/state')[1]['workflows'], [changed])
        self.assertEqual(self.rt.store.all('runs'), [])
        reopened = app.Store(self.root/'data')
        try: self.assertEqual(reopened.all('workflows'), [changed])
        finally: reopened.db.close()
        self.assertEqual(self.request('DELETE', '/api/workflows/' + created['id']), (200, {'ok':True}))
        self.assertEqual(self.request('GET', '/api/state')[1]['workflows'], [])

    def test_validation_and_existing_record_survive_rejected_edits(self):
        for body in ({}, {'name':'x','prompt':''}, {'name':'x'*101,'prompt':'p'}, {'name':'x','prompt':'p'*20001}, {'name':'x','prompt':'p','mode':'shell'}, {'name':[], 'prompt':'p'}, {'name':'x', 'prompt':None}):
            self.assertEqual(self.request('POST', '/api/workflows', body)[0], 400)
        _, item = self.request('POST', '/api/workflows', {'name':'ok','prompt':'p'})
        self.assertEqual(item['mode'], 'agent')
        self.assertEqual(self.request('PATCH', '/api/workflows/' + item['id'], {'mode':'bad'})[0], 400)
        self.assertEqual(self.request('GET', '/api/state')[1]['workflows'], [item])
        self.assertEqual(self.request('PATCH', '/api/workflows/missing', {'name':'x'})[0], 400)
        self.assertEqual(self.request('DELETE', '/api/workflows/missing')[0], 400)

    def test_csrf_token_required_for_writes(self):
        self.assertEqual(self.request('POST', '/api/workflows', {'name':'x','prompt':'p'}, auth=False)[0], 403)
        self.assertEqual(self.rt.store.all('workflows'), [])


if __name__ == '__main__': unittest.main()
