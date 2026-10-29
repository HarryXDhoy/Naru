"""Regressions for Naru 0.2 capabilities: editing, search, allow-all, regenerate, live text, accounts."""
import json, os, sys, tempfile, threading, time, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import app, accounts


def wait_until(fn, timeout=6):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        value = fn()
        if value:
            return value
        time.sleep(.02)
    raise AssertionError('timeout waiting for expected state')


class FeatureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name).resolve()
        self.rt = app.Runtime(self.root / 'data', self.root / 'work')
        self.rt.store.patch('settings', 'main', report_directory=str(self.root / 'reports'))
        self.rt.store.put('providers', dict(id='fixture', kind='openai', name='Fixture', model='fixture', has_key=False, tools_enabled=True, base_url='http://127.0.0.1'))
        self.rt.store.put('sessions', dict(id='s', title='새 대화', provider_id='fixture', model='fixture', mode='agent', created_at=app.now(), updated_at=app.now()))
        self.run = {'settings': self.rt.settings(), 'session_id': 's', 'id': 'r'}

    def tearDown(self):
        for c in self.rt.controls.values():
            c.set()
        wait_until(lambda: not self.rt.controls)
        self.rt.store.db.close(); self.tmp.cleanup()

    def tool(self, name, **args):
        return self.rt.execute_tool(self.run, name, args, threading.Event())

    def test_edit_file_replaces_one_exact_match_atomically(self):
        p = self.root / 'work' / 'notes.md'; p.write_text('제목: 초안\n상태: 작성 중\n', encoding='utf-8'); p.chmod(0o640)
        result = self.tool('edit_file', path='notes.md', old_text='상태: 작성 중', new_text='상태: 완료')
        self.assertEqual(result['replaced'], 1)
        self.assertEqual(p.read_text(encoding='utf-8'), '제목: 초안\n상태: 완료\n')
        self.assertEqual(p.stat().st_mode & 0o777, 0o640)
        self.assertEqual(len(self.rt.store.all('artifacts')), 1)
        with self.assertRaisesRegex(ValueError, '찾지 못'):
            self.tool('edit_file', path='notes.md', old_text='없는 문장', new_text='x')
        p.write_text('a\na\n', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, '2곳'):
            self.tool('edit_file', path='notes.md', old_text='a', new_text='b')
        with self.assertRaises(ValueError):
            self.tool('edit_file', path='../outside.md', old_text='a', new_text='b')
        self.assertEqual([f.name for f in (self.root / 'work').iterdir()], ['notes.md'])

    def test_write_file_overwrite_only_when_asked(self):
        p = self.root / 'work' / 'r.txt'; p.write_text('old')
        with self.assertRaises(ValueError):
            self.tool('write_file', path='r.txt', content='new')
        self.tool('write_file', path='r.txt', content='new', overwrite=True)
        self.assertEqual(p.read_text(), 'new')

    def test_search_files_skips_hidden_and_reports_lines(self):
        (self.root / 'work' / 'a.txt').write_text('one\nTODO fix\n')
        (self.root / 'work' / '.git').mkdir(); (self.root / 'work' / '.git' / 'x').write_text('TODO hidden')
        (self.root / 'work' / 'node_modules').mkdir(); (self.root / 'work' / 'node_modules' / 'y').write_text('TODO dep')
        result = self.tool('search_files', query='todo')
        self.assertEqual(result['matches'], [{'path': 'a.txt', 'line': 2, 'text': 'TODO fix'}])

    def test_search_files_skips_fifo_and_outside_symlink(self):
        work = self.root / 'work'; (work / 'ok.txt').write_text('needle')
        os.mkfifo(work / 'pipe')
        outside = self.root / 'outside.txt'; outside.write_text('needle secret')
        (work / 'link').symlink_to(outside)
        result = []; errors = []
        def run_search():
            try: result.append(self.tool('search_files', query='needle'))
            except Exception as exc: errors.append(exc)
        worker = threading.Thread(target=run_search, daemon=True); worker.start(); worker.join(2)
        self.assertFalse(worker.is_alive(), 'search must not block on a FIFO')
        self.assertEqual(errors, [])
        self.assertEqual([m['path'] for m in result[0]['matches']], ['ok.txt'])

    def test_approve_all_skips_later_prompts_in_same_run(self):
        calls = [dict(content='', tool_calls=[dict(id='1', name='write_file', arguments={'path': 'a.txt', 'content': 'a'})], usage={}),
                 dict(content='', tool_calls=[dict(id='2', name='write_file', arguments={'path': 'b.txt', 'content': 'b'})], usage={}),
                 dict(content='done', tool_calls=[], usage={})]
        with patch.object(app.providers, 'complete', side_effect=lambda *a, **k: calls.pop(0)):
            run_id = self.rt.start('s', {'content': 'two files'})['run_id']
            approval = wait_until(lambda: next((a for a in self.rt.store.all('approvals') if a['status'] == 'pending'), None))
            run = self.rt.store.get('runs', run_id)
            self.rt.store.patch('runs', run_id, auto_approve=sorted(set(run.get('auto_approve') or []) | {'write_file'}))
            self.rt.store.patch('approvals', approval['id'], status='approved')
            wait_until(lambda: self.rt.store.get('runs', run_id)['status'] == 'completed')
        self.assertEqual(len(self.rt.store.all('approvals')), 1)
        self.assertTrue((self.root / 'work' / 'b.txt').exists())
        auto = [e for e in self.rt.store.all('events') if e['type'] == 'tool_call' and e['data'].get('auto')]
        self.assertEqual(len(auto), 1)

    def test_regenerate_replaces_last_answer_without_new_user_message(self):
        with patch.object(app.providers, 'complete', return_value={'content': 'first', 'tool_calls': [], 'usage': {}}):
            rid = self.rt.start('s', {'content': 'hello', 'mode': 'chat'})['run_id']
            wait_until(lambda: self.rt.store.get('runs', rid)['status'] == 'completed')
        with patch.object(app.providers, 'complete', return_value={'content': 'second', 'tool_calls': [], 'usage': {}}):
            rid = self.rt.regenerate('s')['run_id']
            wait_until(lambda: self.rt.store.get('runs', rid)['status'] == 'completed')
        messages = self.rt.store.where('messages', 'session_id', 's')
        self.assertEqual([(m['role'], m['content']) for m in messages], [('user', 'hello'), ('assistant', 'second')])

    def test_regenerate_preserves_existing_answer_when_start_or_inference_fails(self):
        self.rt.message('s', 'user', 'hello')
        self.rt.message('s', 'assistant', 'original')
        with self.assertRaises(ValueError):
            self.rt.regenerate('s', {'provider_id': 'missing'})
        self.assertEqual(self.rt.store.where('messages','session_id','s')[-1]['content'], 'original')
        with patch.object(app.providers, 'complete', side_effect=RuntimeError('connection failed')):
            rid=self.rt.regenerate('s')['run_id']
            wait_until(lambda: self.rt.store.get('runs',rid)['status']=='failed')
            wait_until(lambda: not self.rt.controls)
        self.assertEqual(self.rt.store.where('messages','session_id','s')[-1]['content'], 'original')
        with patch.object(app.providers, 'complete', return_value={'content':'replacement','tool_calls':[], 'usage':{}}):
            new=self.rt.start('s',{},resume=rid)['run_id']
            wait_until(lambda: self.rt.store.get('runs',new)['status']=='completed')
        messages=self.rt.store.where('messages','session_id','s')
        self.assertEqual([(m['role'],m['content']) for m in messages],[('user','hello'),('assistant','replacement')])

    def test_live_text_is_buffered_not_one_row_per_token(self):
        gate = threading.Event()
        def complete(provider, messages, tools, on_delta, cancel, max_tokens=4096):
            for _ in range(300):
                on_delta('가')
            gate.wait(3)
            return {'content': '가' * 300, 'tool_calls': [], 'usage': {}}
        with patch.object(app.providers, 'complete', side_effect=complete):
            rid = self.rt.start('s', {'content': 'stream', 'mode': 'chat'})['run_id']
            live = wait_until(lambda: (lambda v: v if len(v['text']) == 300 else None)(self.rt.live_view('s')))
            self.assertEqual(live['run_id'], rid)
            view = self.rt.session_view('s')
            self.assertEqual(view['live']['text'], '가' * 300)
            self.assertFalse(any(e['type'] == 'delta' for e in view['events']))
            gate.set()
            wait_until(lambda: self.rt.store.get('runs', rid)['status'] == 'completed')
        deltas = [e for e in self.rt.store.all('events') if e['type'] == 'delta']
        self.assertLess(len(deltas), 5)
        self.assertEqual(''.join(e['data']['text'] for e in deltas), '가' * 300)
        self.assertIsNone(self.rt.live_view('s')['run_id'])

    def test_search_finds_titles_and_message_text(self):
        self.rt.message('s', 'user', '분기 매출 보고서를 정리해 줘')
        found = self.rt.search('매출')['results']
        self.assertEqual(found[0]['session_id'], 's'); self.assertIn('매출', found[0]['snippet'])
        self.assertEqual(self.rt.search('')['results'], [])

    def test_where_queries_use_json_index(self):
        self.assertTrue(self.rt.store.json)
        plan = self.rt.store.db.execute("EXPLAIN QUERY PLAN SELECT data FROM messages WHERE json_extract(data,'$.session_id')=?", ('s',)).fetchall()
        self.assertIn('idx_messages_session_id', ' '.join(str(r) for r in plan))

    def test_account_planner_validates_tool_requests(self):
        provider = {'kind': 'claude_code', 'model': ''}
        tools = [t for t in app.TOOLS if t['function']['name'] in ('read_file', 'write_file')]
        good = {'plan': {'content': '읽어볼게요', 'tool_calls': [{'id': 'a', 'name': 'read_file', 'arguments_json': '{"path": "x.md"}'}]}, 'usage': {}}
        with patch.object(accounts, '_invoke', return_value=good):
            result = accounts.complete(provider, [], tools, lambda t: None, threading.Event())
        self.assertEqual(result['tool_calls'], [{'id': 'a', 'name': 'read_file', 'arguments': {'path': 'x.md'}}])
        bad = {'plan': {'content': '', 'tool_calls': [{'id': 'a', 'name': 'run_command', 'arguments_json': '{}'}]}, 'usage': {}}
        with patch.object(accounts, '_invoke', return_value=bad), self.assertRaises(accounts.AccountError):
            accounts.complete(provider, [], tools, lambda t: None, threading.Event())
        self.assertEqual(accounts._extract_json('설명\n```json\n{"content":"x","tool_calls":[]}\n```'), {'content': 'x', 'tool_calls': []})
        self.assertIsNone(accounts._extract_json('no json here'))

    def test_claude_chat_disables_cli_tools(self):
        seen = {}
        def fake_run(args, stdin_text, cwd, env, cancel, on_text, timeout=1800):
            seen['args'] = args; seen['cwd'] = cwd; seen['env'] = env
            on_text(json.dumps({'type': 'stream_event', 'event': {'type': 'content_block_delta', 'delta': {'type': 'text_delta', 'text': '안녕'}}}) + '\n')
            on_text(json.dumps({'type': 'result', 'is_error': False, 'result': '안녕', 'usage': {'input_tokens': 3, 'output_tokens': 1}}) + '\n')
            return 0, ''
        with patch.object(accounts, 'executable', return_value='/usr/bin/true'), patch.object(accounts, '_run', side_effect=fake_run), patch.dict('os.environ', {'ANTHROPIC_API_KEY': 'sk-test'}):
            out = []
            result = accounts.chat({'kind': 'claude_code', 'model': 'sonnet'}, [{'role': 'system', 'content': 'sys'}, {'role': 'user', 'content': 'hi'}], out.append, threading.Event())
        args = seen['args']
        self.assertEqual(args[args.index('--tools') + 1], '')
        self.assertIn('--strict-mcp-config', args); self.assertIn('--no-session-persistence', args)
        self.assertEqual(args[args.index('--model') + 1], 'sonnet')
        self.assertNotIn('ANTHROPIC_API_KEY', seen['env'])
        self.assertNotEqual(Path(seen['cwd']).resolve(), (self.root / 'work').resolve())
        self.assertEqual(result, {'content': '안녕', 'usage': {'input_tokens': 3, 'output_tokens': 1}}); self.assertEqual(out, ['안녕'])

    def test_openrouter_callback_requires_matching_state(self):
        with self.assertRaisesRegex(ValueError, '만료'):
            self.rt.openrouter_finish('code', 'unknown-state')
        self.rt.port = 4999
        start = self.rt.openrouter_start()
        self.assertIn('code_challenge_method=S256', start['url'])
        self.assertIn('callback_url=http%3A%2F%2F127.0.0.1%3A4999%2Foauth%2Fopenrouter%2Fcallback%3Fstate%3D', start['url'])


if __name__ == '__main__':
    unittest.main()
