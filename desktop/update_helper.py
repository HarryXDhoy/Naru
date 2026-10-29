#!/usr/bin/env python3
"""Validate and unpack the release, then safely replace an exited app."""
import json, os, plistlib, posixpath, shutil, signal, stat, subprocess, sys, tempfile, time, zipfile
from pathlib import Path

MAX_BYTES = 2 * 1024 * 1024 * 1024


def extract_archive(archive, destination, version):
    dest = Path(destination)
    with zipfile.ZipFile(archive) as z:
        entries, links, seen, total = [], [], set(), 0
        infos = z.infolist()
        if len(infos) > 20000: raise ValueError('archive has too many entries')
        for i in infos:
            name = i.filename
            if name.startswith('__MACOSX/'): continue
            if '\\' in name or name.startswith('/') or '\x00' in name: raise ValueError('invalid path')
            parts = name.rstrip('/').split('/')
            if not parts or parts[0] != 'Naru.app' or any(x in ('', '.', '..') for x in parts): raise ValueError('invalid path')
            key = '/'.join(parts)
            if key in seen: raise ValueError('duplicate path')
            seen.add(key)
            mode = (i.external_attr >> 16) & 0xffff
            kind = stat.S_IFMT(mode)
            if kind not in (0, stat.S_IFREG, stat.S_IFDIR, stat.S_IFLNK): raise ValueError('invalid entry type')
            total += i.file_size
            if total > MAX_BYTES or i.file_size > 500*1024*1024 or i.flag_bits & 1: raise ValueError('invalid archive size')
            if kind == stat.S_IFLNK:
                if i.file_size > 4096: raise ValueError('invalid link')
                target = z.read(i).decode('utf-8')
                if not target or target.startswith('/') or '\\' in target or '\x00' in target: raise ValueError('invalid link')
                combined = posixpath.normpath(posixpath.join(posixpath.dirname(key), target))
                if combined != 'Naru.app' and not combined.startswith('Naru.app/'): raise ValueError('link escapes bundle')
                links.append((key, target))
            else: entries.append((i,key,mode))
        if any(key.startswith(link + '/') for link, _ in links for key in seen): raise ValueError('entry below symlink')
        for i,key,mode in entries:
            output=dest.joinpath(*key.split('/'))
            if i.is_dir(): output.mkdir(parents=True,exist_ok=True); continue
            output.parent.mkdir(parents=True,exist_ok=True)
            with z.open(i) as src, open(output,'xb') as out: shutil.copyfileobj(src,out,1024*1024)
            os.chmod(output, (mode & 0o777) or 0o644)
        for key,target in links:
            output=dest.joinpath(*key.split('/'));output.parent.mkdir(parents=True,exist_ok=True);os.symlink(target,output)
    bundle=dest/'Naru.app'
    base=bundle.resolve(strict=True)
    for key,_ in links:
        try:dest.joinpath(*key.split('/')).resolve(strict=True).relative_to(base)
        except (OSError,ValueError,RuntimeError):raise ValueError('link escapes bundle or is invalid') from None
    for relative in ('Contents/Info.plist','Contents/Resources/app/package.json','Contents/Resources/app/server/app.py','Contents/MacOS/Naru'):
        current=bundle
        for part in relative.split('/'):
            current=current/part
            if current.is_symlink():raise ValueError('required file uses symlink')
        if not current.is_file():raise ValueError('required file is missing')
    with open(bundle/'Contents/Info.plist','rb') as f: info=plistlib.load(f)
    if info.get('CFBundleIdentifier')!='app.naru.personal' or info.get('CFBundleShortVersionString')!=version: raise ValueError('wrong bundle identity or version')
    with open(bundle/'Contents/Resources/app/package.json',encoding='utf8') as f: package=json.load(f)
    if package.get('version')!=version or not (bundle/'Contents/Resources/app/server/app.py').is_file(): raise ValueError('wrong application content')
    exe=bundle/'Contents/MacOS/Naru'
    if exe.is_symlink() or not exe.is_file(): raise ValueError('wrong architecture')
    with open(exe,'rb') as f: header=f.read(8)
    if header!=b'\xcf\xfa\xed\xfe\x0c\x00\x00\x01': raise ValueError('wrong architecture')
    return bundle


def stop_started_app(target,marker):
    """Stop only the processes started by this update, and wait before swapping."""
    pid_file=Path(str(marker)+'.pid');backend_file=Path(str(marker)+'.backend')
    if not pid_file.is_file():return False
    def readpid(p):
        try:return int(p.read_text())
        except (OSError,ValueError):return 0
    app_pid,backend_pid=readpid(pid_file),readpid(backend_file)
    def command(pid):
        if pid<=1:return ''
        try:return subprocess.run(['/bin/ps','-p',str(pid),'-o','command='],capture_output=True,text=True,timeout=3).stdout.strip()
        except (OSError,subprocess.SubprocessError):return ''
    app_prefix=str(target/'Contents/MacOS/Naru')
    backend_path=str(target/'Contents/Resources/app/server/app.py')
    def is_app():return command(app_pid).startswith(app_prefix)
    def is_backend():return backend_path in command(backend_pid)
    def any_backend():
        try:
            result=subprocess.run(['/bin/ps','ax','-o','command='],capture_output=True,text=True,timeout=3)
            if result.returncode!=0:return None
            return any(backend_path in line for line in result.stdout.splitlines())
        except (OSError,subprocess.SubprocessError):return None
    if is_app():
        try:os.kill(app_pid,signal.SIGTERM)
        except ProcessLookupError:pass
    if is_backend():
        try:os.kill(backend_pid,signal.SIGTERM)
        except ProcessLookupError:pass
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        if not is_app() and not is_backend() and any_backend() is False:return True
        time.sleep(.2)
    return not is_app() and not is_backend() and any_backend() is False


def processes_using_bundle(target):
    try:
        result=subprocess.run(['/bin/ps','ax','-o','command='],capture_output=True,text=True,timeout=3)
        if result.returncode!=0:return None
        exe=str(target/'Contents/MacOS/Naru');backend=str(target/'Contents/Resources/app/server/app.py')
        return any(line.strip().startswith(exe) or backend in line for line in result.stdout.splitlines())
    except (OSError,subprocess.SubprocessError):return None


def launch(target,marker=None,user_data_dir=''):
    args=[str(target/'Contents/MacOS/Naru')]
    if user_data_dir:args.append('--user-data-dir='+user_data_dir)
    if marker:args.append('--naru-update-marker='+str(marker))
    return subprocess.Popen(args,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)


def record_error(error_file,message):
    if not error_file:return
    temp=None
    try:
        directory=Path(error_file).parent
        fd,temp=tempfile.mkstemp(prefix='.naru-update-error-',dir=directory)
        with os.fdopen(fd,'w',encoding='utf8') as f:json.dump({'message':message},f,ensure_ascii=False)
        os.replace(temp,error_file);temp=None
    except OSError:pass
    finally:
        if temp:
            try:os.unlink(temp)
            except OSError:pass


def install(target, update_dir, parent_pid, marker, error_file=None,user_data_dir=''):
    target, update_dir, marker = Path(target), Path(update_dir), Path(marker)
    backup=update_dir/'previous.app'; candidate=update_dir/'Naru.app'
    try:
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            try: os.kill(parent_pid,0);parent_alive=True
            except ProcessLookupError: parent_alive=False
            if not parent_alive and processes_using_bundle(target) is False:break
            time.sleep(.1)
        else: raise RuntimeError('previous application did not quit')
        os.replace(target,backup)
        try: os.replace(candidate,target)
        except BaseException: os.replace(backup,target); raise
        may_rollback=True
        try:
            launch(target,marker,user_data_dir)
            deadline=time.monotonic()+45
            while time.monotonic()<deadline:
                if marker.is_file() and marker.read_text()=='ready':
                    try:shutil.rmtree(backup)
                    except OSError:pass
                    return
                time.sleep(.2)
            # Never swap a bundle while either its Electron or backend process remains alive.
            may_rollback=stop_started_app(target,marker)
            raise RuntimeError('new version failed to start; previous version restored')
        except BaseException:
            if backup.exists() and may_rollback:
                if target.exists():os.replace(target,candidate)
                os.replace(backup,target)
                record_error(error_file,'업데이트를 시작하지 못해 이전 버전을 복원했어요.')
                try:launch(target,user_data_dir=user_data_dir)
                except OSError:pass
            elif backup.exists():record_error(error_file,'업데이트를 완료하지 못했어요. 이전 앱 백업이 보관되어 있습니다.')
            raise
    finally:
        if not backup.exists():
            shutil.rmtree(update_dir,ignore_errors=True)
            shutil.rmtree(marker.parent,ignore_errors=True)


if __name__=='__main__':
    try:
        if sys.argv[1]=='extract': extract_archive(sys.argv[2],sys.argv[3],sys.argv[4])
        elif sys.argv[1]=='stage': shutil.copytree(sys.argv[2],Path(sys.argv[3])/'Naru.app',symlinks=True)
        elif sys.argv[1]=='install': install(sys.argv[2],sys.argv[3],int(sys.argv[4]),sys.argv[5],sys.argv[6],sys.argv[7])
        else: raise ValueError('unknown operation')
    except Exception as e:
        if len(sys.argv)>6 and sys.argv[1]=='install':
            error_file=Path(sys.argv[6])
            if not error_file.exists():
                record_error(error_file,'업데이트를 완료하지 못했어요. 앱을 다시 열어 주세요.')
                target=Path(sys.argv[2]);backup=Path(sys.argv[3])/'previous.app'
                if target.exists() and not backup.exists():
                    try:launch(target,user_data_dir=sys.argv[7] if len(sys.argv)>7 else '')
                    except OSError:pass
        print(str(e),file=sys.stderr);sys.exit(1)
