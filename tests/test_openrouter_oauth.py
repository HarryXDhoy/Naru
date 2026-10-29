"""OpenRouter PKCE request and local callback without a real account or inference."""
import base64
import hashlib
import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import app


class OpenRouterOAuthTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.rt = app.Runtime(root / 'data', root / 'work')
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        self.server.runtime = self.rt
        self.rt.port = self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.rt.store.db.close()
        self.tmp.cleanup()

    def test_callback_completes_pkce_with_state_and_rejects_replay(self):
        auth = urllib.parse.parse_qs(urllib.parse.urlsplit(self.rt.openrouter_start()['url']).query)
        callback = auth['callback_url'][0]
        parts = urllib.parse.urlsplit(callback)
        self.assertEqual(parts.hostname, '127.0.0.1')
        self.assertEqual(parts.port, self.server.server_port)
        state = urllib.parse.parse_qs(parts.query)['state'][0]
        self.assertEqual(auth['state'][0], state)
        self.assertEqual(auth['code_challenge_method'], ['S256'])
        verifier = self.rt.oauth_pending[state]['verifier']
        expected = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
        self.assertEqual(auth['code_challenge'], [expected])

        class Reply:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, *args): return b'{"key":"mock-secret"}'

        with patch.object(app, 'urlopen', return_value=Reply()) as exchange, patch.object(self.rt.vault, 'set') as save:
            with urllib.request.urlopen(callback + '&code=mock-code', timeout=5) as response:
                self.assertEqual(response.status, 200)
            req = exchange.call_args.args[0]
            self.assertEqual(req.full_url, 'https://openrouter.ai/api/v1/auth/keys')
            self.assertEqual(json.loads(req.data), {'code': 'mock-code', 'code_verifier': verifier, 'code_challenge_method': 'S256'})
            save.assert_called_once_with('openrouter', 'mock-secret')
            provider = self.rt.store.get('providers', 'openrouter')
            self.assertEqual(provider['account'], 'openrouter')
            self.assertTrue(provider['has_key'])
            with self.assertRaises(urllib.error.HTTPError) as replay:
                urllib.request.urlopen(callback + '&code=mock-code', timeout=5)
            self.assertEqual(replay.exception.code, 400)
            self.assertEqual(exchange.call_count, 1)

if __name__ == '__main__':
    unittest.main()
