"""Account CLIs installed with old nvm versions use a compatible Node runtime."""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import accounts


class CopilotNodeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.old = root / 'old'
        self.current = root / 'current'
        for folder, version in ((self.old, '20.3.1'), (self.current, '24.22.1')):
            folder.mkdir()
            node = folder / 'node'
            result = 'GitHub Copilot CLI requires Node.js v24 or higher.' if folder == self.old else '--available-tools --disable-builtin-mcps'
            node.write_text(f'#!/bin/sh\nif [ "$1" = "--version" ]; then echo v{version}; else echo "{result}"; fi\n')
            node.chmod(0o700)
        self.cli = self.old / 'copilot'
        self.cli.write_text('#!/usr/bin/env node\n')
        self.cli.chmod(0o700)
        self.patch_env = patch.dict(os.environ, {'PATH': str(self.old)}, clear=True)
        self.patch_env.start()
        self.addCleanup(self.patch_env.stop)
        self.patch_dirs = patch.object(accounts, 'NODE_BIN_DIRS', (str(self.current),))
        self.patch_dirs.start()
        self.addCleanup(self.patch_dirs.stop)
        probe = accounts._node_major
        self.patch_probe = patch.object(accounts, '_node_major', side_effect=lambda binary, stamp:
            probe(binary, stamp) if Path(binary).parent in (self.old, self.current) else 0)
        self.patch_probe.start()
        self.addCleanup(self.patch_probe.stop)

    def test_old_cli_install_does_not_pin_node_version(self):
        env = accounts._env(str(self.cli), 'copilot_cli')
        version = subprocess.check_output(['node', '--version'], env=env, text=True).strip()
        self.assertEqual(version, 'v24.22.1')
        self.assertIn(str(self.old), env['PATH'].split(os.pathsep))

    def test_help_checks_use_the_same_runtime_as_chat(self):
        self.assertIsNone(accounts._isolation_problem('copilot_cli', str(self.cli)))

    def test_login_exports_the_selected_runtime(self):
        login_dir = Path(self.tmp.name) / 'login'
        login_dir.mkdir()
        env = accounts._env(str(self.cli), 'copilot_cli')
        with patch.object(accounts, 'executable', return_value=str(self.cli)), \
             patch.object(accounts, '_env', return_value=env), \
             patch.object(accounts.sys, 'platform', 'darwin'), \
             patch.object(accounts.tempfile, 'mkdtemp', return_value=str(login_dir)), \
             patch.object(accounts.subprocess, 'Popen'):
            accounts.start_login('copilot_cli')
        script = (login_dir / 'copilot-login.command').read_text()
        self.assertIn('export PATH=' + str(self.current) + os.pathsep, script)

    def test_missing_runtime_reports_node_instead_of_obsolete_cli(self):
        with patch.object(accounts, 'NODE_BIN_DIRS', ()):
            problem = accounts._isolation_problem('copilot_cli', str(self.cli))
        self.assertIn('Node.js 24', problem)


if __name__ == '__main__':
    unittest.main()
