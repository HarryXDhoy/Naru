import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import accounts


class AccountIsolationTests(unittest.TestCase):
    def test_unverified_cli_connectors_fail_closed_before_invocation(self):
        for kind in ('gemini_cli', 'copilot_cli'):
            with self.subTest(kind=kind), patch.object(accounts, 'executable') as executable:
                with self.assertRaisesRegex(accounts.AccountError, '일시 중지'):
                    accounts.chat({'kind': kind}, [{'role': 'user', 'content': 'hello'}], lambda _: None, threading.Event())
                executable.assert_not_called()

    def test_status_explains_block_even_when_account_authenticated(self):
        with patch.object(accounts, '_account_status', return_value={'available': True, 'authenticated': True, 'message': 'connected'}):
            for kind in ('gemini_cli', 'copilot_cli'):
                self.assertTrue(accounts.status(kind)['execution_blocked'])
                self.assertIn('일시 중지', accounts.status(kind)['message'])
                self.assertFalse(accounts.test({'kind': kind})['ok'])

    def test_claude_request_disables_user_customizations_and_native_tools(self):
        args = accounts._claude_args('/mock/claude', '/tmp/system.md', '', [])
        self.assertIn('--safe-mode', args)
        self.assertEqual(args[args.index('--tools') + 1], '')
        self.assertEqual(args[args.index('--disallowedTools') + 1], 'mcp__*')
        self.assertIn('--strict-mcp-config', args)

if __name__ == '__main__':
    unittest.main()
