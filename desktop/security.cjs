'use strict';
const path = require('node:path');
const fs = require('node:fs');

function externalUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) throw new Error('올바른 웹 주소가 필요합니다.');
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('HTTP 또는 HTTPS 주소만 열 수 있습니다.');
  return url.href;
}

function localPath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0') || value.length > 4096) throw new Error('절대 파일 경로가 필요합니다.');
  return path.normalize(value);
}

// Documents and media the agent writes. Anything that could execute when "opened"
// (scripts, apps, installers, shortcuts, .command files) is deliberately absent.
const OPENABLE = new Set(['md', 'markdown', 'txt', 'csv', 'tsv', 'json', 'log', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'html', 'htm', 'rtf', 'docx', 'xlsx', 'pptx', 'pages', 'numbers', 'key', 'mp3', 'wav', 'm4a', 'mp4', 'mov']);

function openableFile(value) {
  const target = fs.realpathSync(localPath(value));
  const stat = fs.statSync(target);
  if (!stat.isFile()) throw new Error('파일만 열 수 있습니다.');
  const ext = path.extname(target).slice(1).toLowerCase();
  if (!OPENABLE.has(ext)) throw new Error('이 형식은 바로 열 수 없습니다. Finder에서 확인해 주세요.');
  return target;
}

function trustedSender(event, expectedOrigin) {
  try { return Boolean(event.senderFrame && new URL(event.senderFrame.url).origin === expectedOrigin); }
  catch { return false; }
}

function validPreference(key, value) {
  if (value === null) return ['theme', 'side', 'drawer', 'session'].includes(key);
  if (typeof value !== 'string') return false;
  if (key === 'theme') return ['light', 'dark', 'system'].includes(value);
  if (key === 'side' || key === 'drawer') return value === '0' || value === '1';
  if (key === 'session') return /^[a-zA-Z0-9_-]{1,128}$/.test(value);
  return false;
}

module.exports = { externalUrl, localPath, openableFile, trustedSender, validPreference };
