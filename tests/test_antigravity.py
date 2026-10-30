import json
import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import accounts

class AntigravityTests(unittest.TestCase):
    def invoke(self, data, code=0, plan=False):
        seen = {}
        def run(args, stdin, cwd, env, cancel, on_text, timeout=1800):
            seen.update(args=args, cwd=cwd, env=env)
            on_text(json.dumps(data))
            return code, ''
        with patch.object(accounts, 'executable', return_value='/mock/agy'), patch.object(accounts, '_help_text', return_value='--settings --disable-slash-commands --output-format'), patch.object(accounts, '_run', side_effect=run):
            result = accounts._invoke({'kind':'antigravity','model':'chosen-model'}, [{'role':'user','content':'hello'}], lambda _:None, threading.Event(), plan=plan)
        return result, seen

    def test_chat_uses_selected_model_and_restricts_cli_tools(self):
        result, seen = self.invoke({'status':'SUCCESS','response':'hello','usage':{'input_tokens':12,'output_tokens':3}})
        self.assertEqual(result['content'], 'hello')
        args=seen['args'];self.assertEqual(args[args.index('--model')+1], 'chosen-model')
        self.assertIn('--disable-slash-commands', args)
        settings=json.loads(args[args.index('--settings')+1])
        self.assertEqual(settings['toolPermission'], 'strict')
        self.assertEqual(len(settings['permissions']['deny']), 6)
        self.assertTrue(seen['env']['ANTIGRAVITY_GEMINI_DIR'].startswith(seen['cwd']))
        self.assertNotIn('--dangerously-skip-permissions', args)

    def test_non_success_response_is_not_accepted_as_an_answer(self):
        with self.assertRaises(accounts.AccountError):self.invoke({'status':'ERROR','response':'partial','error':'denied'})

    def test_agent_plan_uses_structured_output(self):
        plan={'content':'done','tool_calls':[]}
        result, seen=self.invoke({'status':'SUCCESS','structured_output':plan}, plan=True)
        self.assertEqual(result['plan'],plan);self.assertIn('--json-schema',seen['args'])

    def test_model_catalog_does_not_prove_sign_in(self):
        from types import SimpleNamespace
        result=SimpleNamespace(returncode=0, stdout=json.dumps({'status':'SUCCESS','command':{'data':{'groups':[]}}}))
        with patch.object(accounts,'executable',return_value='/mock/agy'),patch.object(accounts.subprocess,'run',return_value=result):
            self.assertFalse(accounts._account_status('antigravity')['authenticated'])

    def test_runtime_without_required_controls_is_blocked(self):
        with patch.object(accounts,'_help_text',return_value='--print'):
            self.assertIsNotNone(accounts._isolation_problem('antigravity','/mock/agy'))
