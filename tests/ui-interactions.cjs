// Loads the real public/app.js in a sandbox and checks the pure rendering helpers.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
const node = () => ({ addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, style: {}, innerHTML: '', textContent: '' });
const nodes = new Map();
const context = {
  console, URL, JSON, Date, Intl, Number, String, Map, Set, Math, TextDecoder, Error, Promise, Array, Object, RegExp, Uint16Array, Blob: class {},
  __NARU_TEST__: true, innerWidth: 1200, innerHeight: 900,
  document: { getElementById: id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); }, addEventListener() {}, documentElement: { dataset: {}, classList: { add() {} } }, querySelector() { return null; }, querySelectorAll() { return []; } },
  window: { addEventListener() {} }, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, setTimeout, clearTimeout, setInterval() {}, clearInterval() {}, navigator: {}, getComputedStyle: () => ({})
};
context.globalThis = context; context.window = Object.assign(context.window, context);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8'), context);
const ui = context.NaruUI;
assert(ui, 'test hook exposed');

const xss = ui.markdown('<img src=x onerror=alert(1)> **굵게** [링크](javascript:alert(1)) [ok](https://example.com/a?b=1&c=2)');
assert(!xss.includes('<img'), 'raw HTML is escaped');
assert(!/href="javascript:/i.test(xss), 'javascript links are never linked');
assert(xss.includes('<strong>굵게</strong>'));
assert(xss.includes('href="https://example.com/a?b=1&amp;c=2"'), 'safe links keep their query');

const code = ui.markdown('```js\nconst a = "<b>";\n```');
assert(code.includes('&lt;b&gt;') && code.includes('<div class="code">'), 'fenced code escaped');
const table = ui.markdown('| a | b |\n| --- | --- |\n| 1 | <x> |');
assert(table.includes('<table>') && table.includes('&lt;x&gt;'), 'tables render escaped cells');
const open = ui.markdown('```\nunfinished');
assert(open.includes('unfinished'), 'streaming code fence renders before it closes');

const diff = ui.lineDiff('a\nb\nc', 'a\nB\nc');
assert.equal(diff.map(l => l.k).join(','), 'same,del,add,same');

const split = ui.splitAttachments('요약해 줘\n\n다음은 사용자가 첨부한 참고 자료입니다.\n\n--- 첨부: memo.txt ---\nhi\n--- 첨부 끝 ---');
assert.equal(split.text, '요약해 줘'); assert.deepEqual([...split.files], ['memo.txt']);

assert.equal(ui.stepLabel('edit_file', { path: 'src/app.py' }).target, 'app.py');
assert.equal(ui.stepLabel('search_files', { query: 'TODO' }, { matches: [1, 2] }).note, '2곳');
const steps = ui.buildSteps([
  { id: 'e1', type: 'note', data: { text: '먼저 살펴볼게요' } },
  { id: 'e2', type: 'tool_call', data: { name: 'read_file', arguments: { path: 'a.md' }, call_id: 'c1' } },
  { id: 'e3', type: 'tool_result', data: { name: 'read_file', result: { content: 'x' }, call_id: 'c1' } },
  { id: 'e4', type: 'tool_call', data: { name: 'command_execution', id: 'k1', arguments: { command: 'ls' } } },
  { id: 'e5', type: 'tool_result', data: { name: 'command_execution', id: 'k1', output: 'ok', exit_code: 0 } }
]);
assert.equal(steps.length, 3); assert(steps[1].done && steps[2].done, 'results pair with their calls');
console.log('UI checks passed: escaping, links, code, tables, streaming fences, diff, attachments, step pairing.');
