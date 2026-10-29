import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from server import context_refs as refs


class ContextRefsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.workspace = self.root / 'workspace'
        self.workspace.mkdir()
        (self.workspace / 'src').mkdir()
        (self.workspace / 'src' / 'hello.py').write_text('print("안녕")\n', encoding='utf-8')
        (self.workspace / '.env').write_text('secret')
        (self.workspace / '.hidden').mkdir()
        (self.workspace / '.hidden' / 'hidden.py').write_text('hidden')
        (self.workspace / 'node_modules').mkdir()
        (self.workspace / 'node_modules' / 'library.py').write_text('hidden')
        (self.root / 'outside.py').write_text('private')
        (self.workspace / 'outside.py').symlink_to(self.root / 'outside.py')
        (self.workspace / 'outside-dir').symlink_to(self.root, target_is_directory=True)

    def tearDown(self):
        self.tmp.cleanup()

    def test_search_returns_only_eligible_paths_without_opening_files(self):
        original_open = os.open
        def directories_only(path, flags, *args, **kwargs):
            if not flags & os.O_DIRECTORY:
                raise AssertionError('Search must not open file contents')
            return original_open(path, flags, *args, **kwargs)
        with patch.object(refs.os, 'open', side_effect=directories_only):
            self.assertEqual(refs.search(self.workspace, 'HELLO')['files'], ['src/hello.py'])
            self.assertEqual(refs.search(self.workspace, 'outside')['files'], [])
            self.assertEqual(refs.search(self.workspace, 'hidden')['files'], [])
            self.assertEqual(refs.search(self.workspace, 'library')['files'], [])
            self.assertEqual(refs.search(self.workspace, '')['files'], [])

    def test_snapshot_is_stable_text_with_relative_name(self):
        result = refs.snapshot(self.workspace, 'src/hello.py')
        self.assertEqual(result, {'path':'src/hello.py','name':'src/hello.py','text':'print("안녕")\n','size':len('print("안녕")\n'.encode())})
        (self.workspace/'src'/'hello.py').write_text('changed')
        self.assertEqual(result['text'], 'print("안녕")\n')

    def test_rejects_outside_hidden_symlinks_and_special_files(self):
        os.mkfifo(self.workspace / 'fifo.py')
        for path in ('../outside.py','/etc/passwd','outside.py','outside-dir/outside.py','.env','.hidden/hidden.py','node_modules/library.py','fifo.py','src/hello.py\n'):
            with self.subTest(path=path), self.assertRaises((OSError, ValueError)):
                refs.snapshot(self.workspace, path)
        with self.assertRaises(ValueError): refs.snapshot(self.workspace, 'src/hi.pdf')
        with self.assertRaises((OSError, ValueError)): refs.snapshot(self.workspace, 'src/none.py')
        with self.assertRaises(ValueError): refs.search(self.workspace, 'x\n')

    def test_parent_symlink_swap_during_open_is_rejected(self):
        original_open = os.open
        swapped = []
        def replace_parent(path, flags, *args, **kwargs):
            if path == 'src' and kwargs.get('dir_fd') is not None and not swapped:
                (self.workspace/'src').rename(self.workspace/'src-old')
                (self.workspace/'src').symlink_to(self.root, target_is_directory=True)
                swapped.append(True)
            return original_open(path, flags, *args, **kwargs)
        with patch.object(refs.os, 'open', side_effect=replace_parent), self.assertRaises(OSError):
            refs.snapshot(self.workspace, 'src/outside.py')
        self.assertTrue(swapped)

    def test_rejects_invalid_utf8_null_and_size_limits(self):
        path = self.workspace / 'data.txt'
        for contents in (b'\xff', b'valid\0binary', b'x' * (refs.MAX_CHARS + 1), b'x' * (refs.MAX_BYTES + 1)):
            path.write_bytes(contents)
            with self.assertRaises(ValueError):refs.snapshot(self.workspace, 'data.txt')
        path.write_bytes(b'x' * refs.MAX_CHARS)
        self.assertEqual(len(refs.snapshot(self.workspace, 'data.txt')['text']),refs.MAX_CHARS)

    def test_rejects_changes_during_read(self):
        original = os.fstat
        seen = []
        def changed(fd):
            value = original(fd)
            seen.append(value)
            if len(seen) == 2:
                return SimpleNamespace(st_mode=value.st_mode,st_dev=value.st_dev,st_ino=value.st_ino,st_size=value.st_size,st_mtime_ns=value.st_mtime_ns+1,st_ctime_ns=value.st_ctime_ns)
            return value
        with patch.object(refs.os, 'fstat', side_effect=changed), self.assertRaisesRegex(ValueError,'바뀌었습니다'):
            refs.snapshot(self.workspace, 'src/hello.py')

    def test_scan_and_result_limits_are_explicit(self):
        (self.workspace/'a.py').write_text('a')
        (self.workspace/'b.py').write_text('b')
        with patch.object(refs, 'MAX_ENTRIES', 1):
            self.assertTrue(refs.search(self.workspace,'.py')['truncated'])
        with patch.object(refs, 'MAX_RESULTS', 1):
            result=refs.search(self.workspace,'.py')
            self.assertEqual(len(result['files']),1)
            self.assertTrue(result['truncated'])

if __name__ == '__main__':
    unittest.main()
