'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { packager } = require('@electron/packager');
const root = path.resolve(__dirname, '..');
for (const required of ['server/app.py', 'server/providers.py', 'public/index.html', 'public/app.js', 'desktop/icon.icns']) {
  if (!fs.existsSync(path.join(root, required))) throw new Error(`Required application file is missing: ${required}`);
}

packager({
  dir: root,
  name: 'Naru',
  platform: 'darwin',
  arch: 'arm64',
  out: path.join(root, 'dist'),
  overwrite: true,
  asar: false,
  prune: true,
  icon: path.join(root, 'desktop', 'icon.icns'),
  appBundleId: 'app.naru.personal',
  appCategoryType: 'public.app-category.productivity',
  extendInfo: { NSHumanReadableCopyright: 'Naru · Personal AI workspace', NSHighResolutionCapable: true },
  ignore: [/^\/\./, /^\/(?:_incoming|_backup[^/]*)(?:\/|$)/, /^\/(?:dist|tests|docs|workspace|data)(?:\/|$)/, /^\/node_modules(?:\/|$)/, /(?:^|\/)__pycache__(?:\/|$)/, /\.pyc$/, /\.log$/, /\.sqlite(?:-wal|-shm)?$/, /^\/desktop\/(?:icon\.iconset|security\.test\.cjs|updater\.test\.cjs)(?:\/|$)/, /^\/scripts(?:\/|$)/, /^\/(?:Launch Naru\.command|README\.md|package-lock\.json)$/]
}).then(paths => { console.log('Packaged application:\n' + paths.join('\n')); }).catch(err => { console.error(err.message); process.exitCode = 1; });
