import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import providers
import accounts


class CodexCancellationTests(unittest.TestCase):
    def test_cancel_when_cli_does_not_read_large_prompt(self):
        with tempfile.TemporaryDirectory() as folder:
            binary = Path(folder) / 'fake-codex'
            binary.write_text('#!/bin/sh\necho $$ > '+repr(str(Path(folder) / 'pid'))+'\nexec sleep 3\n')
            binary.chmod(0o755)
            cancel = threading.Event()
            outcome = []
            def run():
                try:
                    providers.run_codex('x' * 1_000_000, '', folder, 'chat', lambda *_: None, cancel)
                except Exception as exc:
                    outcome.append(exc)
            with patch.object(providers, '_codex_executable', return_value=str(binary)):
                worker = threading.Thread(target=run, daemon=True)
                worker.start()
                pid_file = Path(folder) / 'pid'
                deadline = time.monotonic() + 3
                while not pid_file.exists() and worker.is_alive() and time.monotonic() < deadline:
                    time.sleep(.01)
                self.assertTrue(pid_file.exists(), 'fake CLI should have started')
                cancel.set()
                worker.join(timeout=1.5)
            self.assertFalse(worker.is_alive(), 'cancel must interrupt a blocked CLI stdin write')
            self.assertEqual(len(outcome), 1)
            self.assertIsInstance(outcome[0], providers.CancelledError)
            pid = int((Path(folder) / 'pid').read_text())
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)
            self.assertFalse(any(t.name == f'naru-codex-input-{pid}' for t in threading.enumerate()), 'stdin writer should exit')


    def test_oversize_prompt_rejected_before_start(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(providers, '_codex_executable', return_value='/bin/true'), patch.object(providers.subprocess, 'Popen') as popen:
            with self.assertRaisesRegex(providers.ProviderError, '8 MB'):
                providers.run_codex('가' * (3 * 1024 * 1024), '', folder, 'chat', lambda *_: None, threading.Event())
            popen.assert_not_called()

    def test_cancel_after_stdout_closes_but_process_lives(self):
        for mode in ('codex', 'account'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as folder:
                binary = Path(folder) / 'fake-cli'
                pid_file = Path(folder) / 'pid'
                binary.write_text('#!/bin/sh\necho $$ > ' + repr(str(pid_file)) + '\nexec 1>&-\nexec sleep 3\n')
                binary.chmod(0o755)
                cancel, outcome = threading.Event(), []
                def run():
                    try:
                        if mode == 'codex':
                            with patch.object(providers, '_codex_executable', return_value=str(binary)):
                                providers.run_codex('hello', '', folder, 'chat', lambda *_: None, cancel)
                        else:
                            accounts._run([str(binary)], 'hello', folder, os.environ.copy(), cancel, lambda _: None)
                    except Exception as exc:
                        outcome.append(exc)
                worker = threading.Thread(target=run, daemon=True)
                worker.start()
                deadline = time.monotonic() + 3
                while not pid_file.exists() and worker.is_alive() and time.monotonic() < deadline:
                    time.sleep(.01)
                self.assertTrue(pid_file.exists(), 'fake CLI should have started')
                time.sleep(.15)
                cancel.set()
                worker.join(timeout=1.5)
                self.assertFalse(worker.is_alive(), 'cancellation must not wait for process exit timeout')
                self.assertEqual(len(outcome), 1)
                self.assertIsInstance(outcome[0], (providers.CancelledError, InterruptedError))
                with self.assertRaises(ProcessLookupError):
                    os.kill(int(pid_file.read_text()), 0)

if __name__ == '__main__':
    unittest.main()
