import sys, tempfile, threading, time, unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import app


def wait_for(predicate):
    until = time.monotonic() + 5
    while time.monotonic() < until:
        if predicate(): return
        time.sleep(.01)
    raise AssertionError('timed out')


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.rt = app.Runtime(self.root / 'data', self.root / 'work')
        self.rt.store.put('providers', dict(id='p', kind='openai', name='Fixture', model='m', has_key=False, tools_enabled=True, base_url='http://127.0.0.1'))
        self.rt.store.put('sessions', dict(id='s', title='새 대화', provider_id='p', model='m', mode='chat', created_at=app.now(), updated_at=app.now()))
        self.gate = threading.Event()

    def tearDown(self):
        self.gate.set()
        for event in list(self.rt.controls.values()): event.set()
        wait_for(lambda: not self.rt.controls)
        self.rt.store.db.close()
        self.tmp.cleanup()

    def enqueue(self, text, **kwargs):
        return self.rt.enqueue('s', dict(content=text, provider_id='p', model='m', mode='chat', **kwargs))['queued']

    def blocked(self, *args, **kwargs):
        self.gate.wait(5)
        return {'content':'done', 'tool_calls':[], 'usage':{}}

    def test_fifo_messages_are_not_added_to_history_until_dispatched(self):
        with patch.object(app.providers, 'complete', side_effect=self.blocked):
            self.rt.start('s', {'content':'first'})
            self.enqueue('second'); self.enqueue('third')
            self.assertEqual([m['content'] for m in self.rt.store.all('messages')], ['first'])
            self.gate.set()
            wait_for(lambda: len(self.rt.store.all('runs')) == 3 and not self.rt.controls)
        self.assertEqual([m['content'] for m in self.rt.store.all('messages') if m['role']=='user'], ['first','second','third'])
        self.assertEqual(self.rt.session_view('s')['queue'], [])

    def test_failure_pauses_and_manual_resume_preserves_queue(self):
        def failure(*args, **kwargs):
            self.gate.wait(5)
            raise RuntimeError('offline')
        with patch.object(app.providers, 'complete', side_effect=failure):
            self.rt.start('s', {'content':'first'})
            q=self.enqueue('second'); self.gate.set()
            wait_for(lambda: not self.rt.controls)
        self.assertTrue(self.rt.session_view('s')['queue_paused'])
        self.assertEqual(self.rt.session_view('s')['queue'][0]['id'], q['id'])
        self.enqueue('third')
        self.assertEqual(len(self.rt.store.all('runs')), 1)
        with patch.object(app.providers, 'complete', return_value={'content':'done','tool_calls':[],'usage':{}}):
            self.rt.dispatch_queue('s', resume=True)
            wait_for(lambda: len(self.rt.store.all('runs')) == 3 and not self.rt.controls)
        self.assertEqual([m['content'] for m in self.rt.store.all('messages') if m['role']=='user'], ['first','second','third'])

    def test_restriction_is_never_relaxed_at_dispatch(self):
        for submitted, current, expected in [('manual','full_access','manual'), ('full_access','manual','manual')]:
            self.rt.store.patch('settings','main',access_mode=submitted)
            self.rt.store.patch('sessions','s',queue_paused=True)
            self.enqueue(submitted)
            self.rt.store.patch('settings','main',access_mode=current)
            with patch.object(app.providers, 'complete', return_value={'content':'done','tool_calls':[],'usage':{}}):
                self.rt.dispatch_queue('s', resume=True)
                wait_for(lambda: not self.rt.controls)
            self.assertEqual(self.rt.store.all('runs')[-1]['settings']['access_mode'], expected)

    def test_restart_requires_explicit_resume(self):
        self.rt.store.patch('sessions','s',queue_paused=True)
        self.enqueue('queued')
        reopened=app.Runtime(self.root/'data',self.root/'work')
        try:
            self.assertTrue(reopened.session_view('s')['queue_paused'])
            self.assertEqual(reopened.store.all('runs'), [])
            self.assertEqual(reopened.session_view('s')['queue'][0]['content'], 'queued')
        finally: reopened.store.db.close()

    def test_transaction_failure_retains_queue_and_no_user_message(self):
        self.rt.store.patch('sessions','s',queue_paused=True)
        self.enqueue('queued')
        original=self.rt.store.delete
        def fail(table, id):
            if table=='queued_messages': raise RuntimeError('disk error')
            return original(table,id)
        with patch.object(self.rt.store, 'delete', side_effect=fail):
            with self.assertRaises(ValueError): self.rt.dispatch_queue('s',resume=True)
        view=self.rt.session_view('s')
        self.assertTrue(view['queue_paused']); self.assertEqual(len(view['queue']),1)
        self.assertEqual(view['messages'],[]); self.assertEqual(view['runs'],[])

    def test_missing_provider_and_skill_do_not_discard_queue(self):
        self.rt.store.patch('sessions','s',queue_paused=True)
        self.enqueue('queued',skill_ids=['research'])
        self.rt.store.delete('skills','research')
        with self.assertRaises(ValueError): self.rt.dispatch_queue('s',resume=True)
        self.assertEqual(len(self.rt.session_view('s')['queue']),1)
        self.assertTrue(self.rt.session_view('s')['queue_error'])
        self.rt.store.put('skills',dict(id='research',enabled=True,name='Research',instructions=''))
        self.rt.store.delete('providers','p')
        with self.assertRaises(ValueError): self.rt.dispatch_queue('s',resume=True)
        self.assertEqual(len(self.rt.session_view('s')['queue']),1)

    def test_edit_delete_and_delete_session(self):
        self.rt.store.patch('sessions','s',queue_paused=True)
        q=self.enqueue('before')
        self.rt.change_queue('s',q['id'],{'content':'after'})
        self.assertEqual(self.rt.session_view('s')['queue'][0]['content'],'after')
        self.rt.change_queue('s',q['id'],delete=True)
        self.assertFalse(self.rt.session_view('s')['queue_paused'])
        self.rt.store.patch('sessions','s',queue_paused=True)
        self.enqueue('another')
        self.rt.delete_session('s')
        self.assertEqual(self.rt.store.all('queued_messages'),[])

    def test_enqueue_in_completion_window_does_not_overtake_finalizer(self):
        with patch.object(app.providers,'complete',side_effect=self.blocked):
            rid=self.rt.start('s',{'content':'first'})['run_id']
            with self.rt.lock:
                self.rt.store.patch('runs',rid,status='completed')
                self.enqueue('second')
                self.assertEqual(len(self.rt.store.all('runs')),1)
                self.assertEqual(len(self.rt.session_view('s')['queue']),1)
            self.gate.set()
            wait_for(lambda:len(self.rt.store.all('runs'))==2 and not self.rt.controls)

    def test_cancellation_pauses_only_its_session(self):
        self.rt.store.put('sessions', dict(id='other', title='새 대화', provider_id='p', model='m', mode='chat', created_at=app.now(), updated_at=app.now()))
        with patch.object(app.providers,'complete',side_effect=self.blocked):
            first=self.rt.start('s',{'content':'first'})['run_id']
            self.rt.start('other',{'content':'other'})
            self.enqueue('waiting')
            self.rt.enqueue('other',{'content':'other waiting'})
            self.rt.cancel(first);self.gate.set()
            wait_for(lambda:not self.rt.controls)
        self.assertTrue(self.rt.session_view('s')['queue_paused'])
        self.assertEqual([q['content'] for q in self.rt.session_view('s')['queue']],['waiting'])
        self.assertFalse(self.rt.session_view('other')['queue'])
        self.assertEqual([m['content'] for m in self.rt.store.where('messages','session_id','other') if m['role']=='user'],['other','other waiting'])

if __name__ == '__main__': unittest.main()
