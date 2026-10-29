"""Explicit, bounded references to text files inside a selected workspace.

Search reads names only. Snapshot is a separate operation for a file the user
has chosen; callers are responsible for showing the attachment before sending.
"""
import os
import re
import stat
from pathlib import Path

TEXT_EXT = re.compile(r'\.(txt|md|markdown|csv|tsv|json|jsonl|py|js|mjs|cjs|ts|tsx|jsx|html?|css|scss|ya?ml|xml|log|sh|zsh|sql|toml|ini|cfg|env\.example|swift|kt|go|rs|java|c|h|cc|cpp|hpp|rb|php|lua|r|tex)$', re.I)
SKIP_DIRS = {'node_modules', 'venv', '__pycache__', 'dist', 'build'}
MAX_BYTES = 600 * 1024
MAX_CHARS = 90000
MAX_DEPTH = 8
MAX_ENTRIES = 4000
MAX_RESULTS = 50


def _component(name):
    # Hidden entries and cache/build directories are excluded from both search
    # and direct snapshots; users can still attach them via the file picker.
    if not name or name in ('.', '..') or name.startswith('.') or any(ord(c) < 32 or ord(c) == 127 for c in name):
        return False
    try:
        name.encode('utf-8')
    except UnicodeEncodeError:
        return False
    return True


def _root_fd(workspace):
    if not isinstance(workspace, (str, os.PathLike)):
        raise ValueError('작업 폴더를 확인해 주세요.')
    root = Path(workspace)
    if not root.is_absolute() or root == Path('/') or '..' in root.parts:
        raise ValueError('올바른 작업 폴더가 필요합니다.')
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in root.parts[1:]:
            nextfd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = nextfd
        return fd
    except BaseException:
        os.close(fd)
        raise


def search(workspace, query):
    """Search eligible relative paths, without opening or reading file contents."""
    if not isinstance(query, str) or len(query) > 200 or any(ord(c) < 32 for c in query):
        raise ValueError('검색어는 200자 이하의 텍스트여야 합니다.')
    needle = query.strip().casefold()
    if not needle:
        return {'files': [], 'truncated': False}
    rootfd = _root_fd(workspace)
    files = []
    scanned = 0
    truncated = False

    def walk(fd, prefix, depth):
        nonlocal scanned, truncated
        with os.scandir(fd) as entries:
            for entry in entries:
                scanned += 1
                if scanned > MAX_ENTRIES:
                    truncated = True
                    return
                name = entry.name
                if not _component(name):
                    continue
                rel = prefix + name
                try:
                    if entry.is_dir(follow_symlinks=False):
                        if name in SKIP_DIRS:
                            continue
                        if depth >= MAX_DEPTH:
                            truncated = True
                            continue
                        try:
                            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                        except OSError:
                            continue
                        try:
                            walk(child, rel + '/', depth + 1)
                        finally:
                            os.close(child)
                        if scanned > MAX_ENTRIES:
                            return
                    elif entry.is_file(follow_symlinks=False) and TEXT_EXT.search(name) and needle in rel.casefold():
                        if len(files) >= MAX_RESULTS:
                            truncated = True
                            return
                        files.append(rel)
                except OSError:
                    continue

    try:
        walk(rootfd, '', 0)
    finally:
        os.close(rootfd)
    return {'files': sorted(files, key=str.casefold), 'truncated': truncated}


def snapshot(workspace, relative_path):
    """Read a chosen workspace text file once; reject changed or unsafe paths."""
    if not isinstance(relative_path, str) or not relative_path or len(relative_path) > 1024 or '\x00' in relative_path:
        raise ValueError('작업 폴더 안의 파일을 선택해 주세요.')
    path = Path(relative_path)
    parts = path.parts
    if path.is_absolute() or not parts or any(not _component(part) for part in parts) or any(part in SKIP_DIRS for part in parts[:-1]) or not TEXT_EXT.search(parts[-1]):
        raise ValueError('작업 폴더 안의 지원되는 텍스트 파일만 선택할 수 있습니다.')
    fd = _root_fd(workspace)
    try:
        for part in parts[:-1]:
            nextfd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = nextfd
        filefd = os.open(parts[-1], os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW, dir_fd=fd)
        try:
            before = os.fstat(filefd)
            if not stat.S_ISREG(before.st_mode):
                raise ValueError('일반 텍스트 파일만 선택할 수 있습니다.')
            if before.st_size > MAX_BYTES:
                raise ValueError('파일은 600 KiB 이하여야 합니다.')
            with os.fdopen(filefd, 'rb', closefd=False) as f:
                data = f.read(MAX_BYTES + 1)
            after = os.fstat(filefd)
            if len(data) > MAX_BYTES:
                raise ValueError('파일은 600 KiB 이하여야 합니다.')
            if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                raise ValueError('파일을 읽는 동안 내용이 바뀌었습니다. 다시 선택해 주세요.')
            try:
                text = data.decode('utf-8')
            except UnicodeDecodeError as exc:
                raise ValueError('UTF-8 텍스트 파일만 첨부할 수 있습니다.') from exc
            if '\x00' in text:
                raise ValueError('텍스트 파일만 첨부할 수 있습니다.')
            if len(text) > MAX_CHARS:
                raise ValueError('첨부 내용은 90,000자 이하여야 합니다.')
            return {'path': '/'.join(parts), 'name': '/'.join(parts), 'text': text, 'size': len(data)}
        finally:
            os.close(filefd)
    finally:
        os.close(fd)
