const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { externalUrl, localPath, openableFile, trustedSender } = require('./security.cjs');

test('external opener accepts only unauthenticated web URLs', () => {
  assert.equal(externalUrl('https://example.com/path'), 'https://example.com/path');
  for (const unsafe of ['file:///etc/passwd', 'javascript:alert(1)', 'mailto:a@b.com', 'https://secret@example.com/', '', null]) assert.throws(() => externalUrl(unsafe));
});
test('reveal action requires a normalized absolute filesystem path', () => {
  assert.equal(localPath('/tmp/a/../b'), '/tmp/b');
  for (const unsafe of ['../relative', '~/.ssh', '/tmp/a\0b', null]) assert.throws(() => localPath(unsafe));
});
test('open action only hands documents to the default app, never executables', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naru-open-'));
  try {
    const doc = path.join(dir, 'report.html'); fs.writeFileSync(doc, '<p>hi</p>');
    assert.equal(openableFile(doc), fs.realpathSync(doc));
    for (const name of ['run.command', 'x.sh', 'tool.py', 'a.app', 'b.terminal', 'c.webloc', 'noext']) {
      const p = path.join(dir, name); fs.writeFileSync(p, ''); assert.throws(() => openableFile(p));
    }
    const sneaky = path.join(dir, 'looks.md'); fs.symlinkSync(path.join(dir, 'run.command'), sneaky);
    assert.throws(() => openableFile(sneaky), 'symlinks are judged by their real target');
    assert.throws(() => openableFile(dir), 'folders are not files');
    assert.throws(() => openableFile(path.join(dir, 'missing.md')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('IPC sender must match the exact ephemeral backend origin', () => {
  const origin = 'http://127.0.0.1:4317';
  const sender = url => ({ senderFrame: { url } });
  assert.equal(trustedSender(sender(origin + '/'), origin), true);
  assert.equal(trustedSender(sender('http://127.0.0.1:4318/'), origin), false);
  assert.equal(trustedSender(sender('https://example.com'), origin), false);
  assert.equal(trustedSender({}, origin), false);
});
test('persistent UI preferences accept only bounded known values', () => {
  const { validPreference } = require('./security.cjs');
  for (const [key, value] of [['theme', 'light'], ['theme', 'dark'], ['theme', 'system'], ['drawer', '1'], ['side', '0'], ['session', '0123ab-cd']]) assert.equal(validPreference(key, value), true);
  for (const [key, value] of [['theme', 'blue'], ['drawer', 'true'], ['side', '2'], ['session', '../a'], ['session', 'a'.repeat(129)], ['token', 'secret'], ['__proto__', 'x'], ['theme', {}]]) assert.equal(validPreference(key, value), false);
  assert.equal(validPreference('session', null), true);
  assert.equal(validPreference('unknown', null), false);
});
