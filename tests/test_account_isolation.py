import json
import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import accounts


class AccountIsolationTests(unittest.TestCase):
    HELP = 'Options: --admin-policy --available-tools --disable-builtin-mcps'

    def capture(self, kind, help_text=None):
        seen = {}
        def fake_run(args, stdin_text, cwd, env, cancel, on_text, timeout=1800):
            seen['args'] = args; seen['env'] = env
            policy = next((args[i + 1] for i, a in enumerate(args) if a == '--admin-policy'), None)
            if policy:
                seen['policy'] = Path(policy).read_text(encoding='utf-8')
            on_text(json.dumps({'type': 'message', 'role': 'assistant', 'content': 'hello'}) + '\n' if kind == 'gemini_cli' else 'hello')
            return 0, ''
        with patch.object(accounts, 'executable', return_value='/mock/' + kind), \
             patch.object(accounts, '_help_text', return_value=self.HELP if help_text is None else help_text), \
             patch.object(accounts.glob, 'glob', return_value=[]), \
             patch.object(accounts, '_run', side_effect=fake_run) as run:
            accounts.chat({'kind': kind}, [{'role': 'user', 'content': 'hello'}], lambda _: None, threading.Event())
        return seen, run

    def test_gemini_runs_with_every_cli_tool_denied(self):
        seen, _ = self.capture('gemini_cli')
        args = seen['args']
        self.assertIn('toolName = "*"', seen['policy'])
        self.assertIn('decision = "deny"', seen['policy'])
        self.assertEqual(args[args.index('--allowed-mcp-server-names') + 1], 'naru-none')
        self.assertEqual(args[args.index('-e') + 1], 'none')
        self.assertNotIn('--yolo', args)
        self.assertEqual(seen['env']['GEMINI_CLI_TRUST_WORKSPACE'], 'true')

    def test_copilot_runs_with_no_visible_tools(self):
        seen, _ = self.capture('copilot_cli')
        args = seen['args']
        for flag in ('--available-tools=naru_no_tools', '--disable-builtin-mcps', '--no-custom-instructions',
                     '--deny-tool=shell', '--deny-tool=write', '--deny-tool=url', '--no-ask-user'):
            self.assertIn(flag, args)
        self.assertFalse(any(a.startswith('--allow-all') for a in args))

    def test_cli_without_isolation_flags_fails_closed_before_running(self):
        for kind in ('gemini_cli', 'copilot_cli'):
            with self.subTest(kind=kind), patch.object(accounts, 'executable', return_value='/mock/cli'), \
                 patch.object(accounts, '_help_text', return_value='Options: --prompt'), \
                 patch.object(accounts, '_run') as run:
                with self.assertRaisesRegex(accounts.AccountError, '업데이트'):
                    accounts.chat({'kind': kind}, [{'role': 'user', 'content': 'hello'}], lambda _: None, threading.Event())
                run.assert_not_called()

    def test_system_gemini_policy_blocks_because_naru_policy_would_be_ignored(self):
        with patch.object(accounts, '_account_status', return_value={'available': True, 'authenticated': True, 'message': 'connected'}), \
             patch.object(accounts, 'executable', return_value='/mock/gemini'), \
             patch.object(accounts, '_help_text', return_value=self.HELP), \
             patch.object(accounts.glob, 'glob', return_value=['/Library/Application Support/GeminiCli/policies/org.toml']):
            st = accounts.status('gemini_cli')
        self.assertTrue(st['execution_blocked'])
        self.assertIn('관리자 정책', st['message'])

    def test_supported_accounts_are_not_blocked(self):
        with patch.object(accounts, '_account_status', return_value={'available': True, 'authenticated': True, 'message': 'connected'}), \
             patch.object(accounts, 'executable', return_value='/mock/cli'), \
             patch.object(accounts, '_help_text', return_value=self.HELP), \
             patch.object(accounts.glob, 'glob', return_value=[]):
            for kind in ('gemini_cli', 'copilot_cli'):
                self.assertFalse(accounts.status(kind).get('execution_blocked'))
                self.assertTrue(accounts.test({'kind': kind})['ok'])

    def test_claude_request_disables_user_customizations_and_native_tools(self):
        args = accounts._claude_args('/mock/claude', '/tmp/system.md', '', [])
        self.assertIn('--safe-mode', args)
        self.assertEqual(args[args.index('--tools') + 1], '')
        self.assertEqual(args[args.index('--disallowedTools') + 1], 'mcp__*')
        self.assertIn('--strict-mcp-config', args)

if __name__ == '__main__':
    unittest.main()
