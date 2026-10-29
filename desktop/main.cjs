'use strict';
const { app, BrowserWindow, dialog, ipcMain, shell, Menu, session, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { externalUrl, localPath, openableFile, trustedSender, validPreference } = require('./security.cjs');
const { createUpdater } = require('./updater.cjs');

app.setName('Naru');
const lock = app.requestSingleInstanceLock();
let mainWindow, backend, backendOrigin = '', quitting = false, updater, pythonExecutable;
const projectRoot = path.resolve(__dirname, '..');
const dataDir = process.env.NARU_DATA_DIR || path.join(os.homedir(), 'Desktop', 'Naru', 'data');
const preferencesPath = path.join(dataDir, 'ui-preferences.json');
let preferences = {};
const additionalPaths = ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin'), '/usr/bin', '/bin'];
const processPath = [...new Set([...(process.env.PATH || '').split(path.delimiter), ...additionalPaths])].filter(Boolean).join(path.delimiter);
const markerArg=process.argv.find(x=>x.startsWith('--naru-update-marker='));
const updateMarker=markerArg?.slice('--naru-update-marker='.length);
function markUpdate(suffix,content){
  if(!updateMarker)return;
  try{
    const dir=path.dirname(updateMarker),temp=fs.realpathSync(os.tmpdir()),real=fs.realpathSync(dir);
    if(path.basename(updateMarker)!=='startup-ready'||!path.basename(real).startsWith('naru-update-')||path.dirname(real)!==temp)return;
    const st=fs.statSync(real);if(st.uid!==process.getuid()||(st.mode&0o077)!==0)return;
    const fd=fs.openSync(path.join(real,'startup-ready'+suffix),fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
    try{fs.writeFileSync(fd,content);}finally{fs.closeSync(fd);}
  }catch{}
}
markUpdate('.pid',String(process.pid));

if (!lock) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
  });
  app.whenReady().then(start).catch(fatal);
}

function findPython() {
  const candidates = [process.env.NARU_PYTHON, '/opt/homebrew/bin/python3', '/usr/local/bin/python3', '/usr/bin/python3', 'python3'].filter(Boolean);
  for (const executable of candidates) {
    const result = spawnSync(executable, ['-c', 'import sqlite3,sys; assert sys.version_info >= (3,10)'], { env: { ...process.env, PATH: processPath }, timeout: 5000, encoding: 'utf8' });
    if (!result.error && result.status === 0) return executable;
  }
  throw new Error('Python 3.10 이상이 필요합니다. Python을 설치한 뒤 앱을 다시 열어 주세요. NARU_PYTHON 환경 변수로 실행 파일을 지정할 수도 있습니다.');
}

async function startBackend() {
  const workspace = process.env.NARU_WORKSPACE || path.join(os.homedir(), 'Desktop', 'Naru', 'workspace');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(workspace, { recursive: true });
  const python = findPython();pythonExecutable=python;
  return new Promise((resolve, reject) => {
    let stdout = '', stderr = '', settled = false;
    const timeout = setTimeout(() => { if (!settled) { settled = true; backend?.kill('SIGTERM'); reject(new Error('로컬 서버를 시작하지 못했습니다. 다시 실행해 주세요.')); } }, 25000);
    backend = spawn(python, [path.join(projectRoot, 'server', 'app.py'), '--port', '0', '--data-dir', dataDir, '--workspace', workspace], {
      cwd: projectRoot,
      env: { ...process.env, PATH: processPath, PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    if(backend.pid)markUpdate('.backend',String(backend.pid));
    backend.stdout.setEncoding('utf8'); backend.stderr.setEncoding('utf8');
    backend.stdout.on('data', chunk => {
      stdout = (stdout + chunk).slice(-10000);
      const match = stdout.match(/NARU_READY (http:\/\/127\.0\.0\.1:\d+)/);
      if (match && !settled) { settled = true; clearTimeout(timeout); resolve(match[1]); }
    });
    backend.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
    backend.on('error', err => { clearTimeout(timeout); if (!settled) { settled = true; reject(err); } });
    backend.on('exit', code => {
      clearTimeout(timeout);
      if (!settled) { settled = true; reject(new Error(`서버가 시작 중 종료되었습니다 (${code}).\n${stderr}`)); }
      else if (!quitting) fatal(new Error('로컬 서버 연결이 종료되었습니다. 저장된 대화는 유지됩니다. 앱을 다시 실행해 주세요.'));
    });
  });
}

function requireTrusted(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !trustedSender(event, backendOrigin)) throw new Error('허용되지 않은 요청입니다.');
}

function installBridge() {
  try {
    const fd = fs.openSync(preferencesPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    let saved;
    try {
      const info = fs.fstatSync(fd);
      if (!info.isFile() || info.size > 4096) throw new RangeError('Invalid UI preferences');
      saved = JSON.parse(fs.readFileSync(fd, 'utf8'));
    } finally { fs.closeSync(fd); }
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const [key, value] of Object.entries(saved)) if (validPreference(key, value) && value !== null) preferences[key] = value;
    }
  } catch (error) {
    if (!['ENOENT', 'ELOOP'].includes(error.code) && !(error instanceof SyntaxError) && !(error instanceof RangeError)) throw error;
  }
  ipcMain.on('naru:get-preference', (event, key) => {
    try { requireTrusted(event); event.returnValue = validPreference(key, null) ? (preferences[key] ?? null) : null; }
    catch { event.returnValue = null; }
  });
  ipcMain.on('naru:set-preference', (event, key, value) => {
    let temp, ownsTemp = false;
    try {
      requireTrusted(event);
      if (!validPreference(key, value)) throw new Error('Invalid preference');
      const next = { ...preferences };
      if (value === null) delete next[key]; else next[key] = value;
      temp = path.join(dataDir, `.ui-preferences-${process.pid}-${require('node:crypto').randomUUID()}.tmp`);
      const fd = fs.openSync(temp, 'wx', 0o600); ownsTemp = true;
      try { fs.writeFileSync(fd, JSON.stringify(next)); } finally { fs.closeSync(fd); }
      fs.renameSync(temp, preferencesPath);
      preferences = next;
      event.returnValue = true;
    } catch {
      if (ownsTemp) { try { fs.unlinkSync(temp); } catch {} }
      event.returnValue = false;
    }
  });
  ipcMain.handle('naru:choose-directory', async event => {
    requireTrusted(event);
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Naru에서 사용할 폴더 선택', properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('naru:reveal-path', (event, value) => {
    requireTrusted(event);
    const target = localPath(value);
    if (!fs.existsSync(target)) throw new Error('파일이나 폴더를 찾을 수 없습니다.');
    shell.showItemInFolder(target);
    return true;
  });
  ipcMain.handle('naru:open-path', async (event, value) => {
    requireTrusted(event);
    const failure = await shell.openPath(openableFile(value));
    if (failure) throw new Error(failure);
    return true;
  });
  ipcMain.handle('naru:set-theme', (event, value) => {
    requireTrusted(event);
    nativeTheme.themeSource = ['light', 'dark'].includes(value) ? value : 'system';
    return nativeTheme.themeSource;
  });
  ipcMain.handle('naru:open-external', async (event, value) => { requireTrusted(event); await shell.openExternal(externalUrl(value)); return true; });
  ipcMain.handle('naru:version', event => { requireTrusted(event); return app.getVersion(); });
  ipcMain.handle('naru:update-state', event => { requireTrusted(event); return updater.state(); });
  ipcMain.handle('naru:update-check', event => { requireTrusted(event); return updater.check(); });
  ipcMain.handle('naru:update-install', event => { requireTrusted(event); return updater.install(); });
  ipcMain.handle('naru:update-boot-ready', async (event,version) => {
    requireTrusted(event);
    if(!updateMarker||version!==app.getVersion())return false;
    const health=await updater.health();
    if(health.ok!==true||health.version!==version)return false;
    markUpdate('','ready');return true;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 950, minWidth: 840, minHeight: 620,
    title: 'Naru',
    ...(process.platform === 'darwin' ? { vibrancy: 'sidebar', visualEffectState: 'followWindow', backgroundColor: '#00000000' } : { backgroundColor: '#f7f7f7' }),
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 },
    icon: path.join(projectRoot, 'desktop', 'icon.png'),
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false, spellcheck: true }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try { const valid = externalUrl(url); if (new URL(valid).origin !== backendOrigin) shell.openExternal(valid).catch(() => {}); }
    catch {}
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== backendOrigin) { event.preventDefault(); try { shell.openExternal(externalUrl(url)).catch(() => {}); } catch {} }
  });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (!quitting) fatal(new Error(`앱 화면이 종료되었습니다 (${details.reason}). 저장된 작업은 유지됩니다. Naru를 다시 열어 주세요.`));
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(backendOrigin).catch(error => { if (!quitting) fatal(error); });
}

async function start() {
  backendOrigin = await startBackend();
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const owned = mainWindow && webContents === mainWindow.webContents;
    callback(Boolean(owned && ['clipboard-sanitized-write', 'notifications'].includes(permission)));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    return Boolean(mainWindow && webContents === mainWindow.webContents && ['clipboard-sanitized-write', 'notifications'].includes(permission) && requestingOrigin === backendOrigin);
  });
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    if (details.url.startsWith(backendOrigin + '/')) {
      headers['Content-Security-Policy'] = ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'"];
    }
    callback({ responseHeaders: headers });
  });
  installBridge();
  updater=createUpdater({app,python:pythonExecutable,backendOrigin,dataDir,onState:value=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('naru:update-state',value);}});
  if(updater.enabled){if(!updater.recovered)setTimeout(()=>updater.check(),8000);setInterval(()=>updater.check(),6*60*60*1000);}
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Naru', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: '편집', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '보기', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: '윈도우', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] }
  ]));
  createWindow();
}

function fatal(error) {
  if (quitting) return;
  quitting = true;
  dialog.showErrorBox('Naru를 실행할 수 없습니다', String(error?.message || error));
  backend?.kill('SIGTERM');
  app.quit();
}

app.on('activate', () => { if (!mainWindow && backendOrigin && !quitting) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { quitting = true; backend?.kill('SIGTERM'); });
process.on('SIGTERM', () => { quitting=true;backend?.kill('SIGTERM');app.quit(); });
