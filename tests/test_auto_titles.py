"""Auto titles use the selected provider safely and never block or replace a rename."""
import sys, tempfile, threading, time, unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import app


def wait_for(fn):
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        if fn(): return
        time.sleep(.01)
    raise AssertionError('background title did not finish')


class AutoTitleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.rt = app.Runtime(root / 'data', root / 'work')
        self.rt.store.put('providers', {'id':'fixture','name':'Fixture','kind':'openai','base_url':'http://127.0.0.1','model':'text-model','has_key':False})
        self.rt.store.put('sessions', {'id':'s','title':'돼지 그려','auto_title':True,'provider_id':'fixture','model':'text-model','mode':'chat','created_at':app.now(),'updated_at':app.now()})
        self.rt.message('s','user','돼지 그려\n\n다음은 사용자가 첨부한 참고 자료입니다.\nsecret attachment')
        self.run = {'id':'r','session_id':'s','provider_id':'fixture','model':'text-model','title_provider_id':'fixture','title_model':'text-model','create_image':False}

    def tearDown(self):
        for cancel in list(self.rt.title_pending.values()): cancel.set()
        wait_for(lambda: not self.rt.title_pending)
        self.rt.store.db.close()
        self.tmp.cleanup()

    def test_title_uses_only_bounded_relevant_text_and_no_tools(self):
        captured = []
        def complete(provider, messages, tools, on_delta, cancel, max_tokens):
            captured.append((provider, messages, tools, max_tokens))
            return {'content':'"귀여운 돼지 그림"\nextra'}
        with patch.object(app.providers,'complete',side_effect=complete):
            self.rt.schedule_title(self.run,'돼지를 그렸어요')
            wait_for(lambda: not self.rt.title_pending)
        session=self.rt.store.get('sessions','s')
        self.assertEqual(session['title'],'귀여운 돼지 그림')
        self.assertFalse(session['auto_title'])
        provider,messages,tools,tokens=captured[0]
        self.assertEqual(provider['model'],'text-model')
        self.assertEqual(tools,[])
        self.assertEqual(tokens,64)
        self.assertNotIn('secret attachment',str(messages))
        self.assertIn('돼지 그려',str(messages))

    def test_rename_wins_even_if_model_ignores_cancellation(self):
        entered=threading.Event(); release=threading.Event()
        def complete(*args,**kwargs):
            entered.set();release.wait(2);return {'content':'generated'}
        with patch.object(app.providers,'complete',side_effect=complete):
            self.rt.schedule_title(self.run,'answer')
            self.assertTrue(entered.wait(2))
            self.rt.update_session('s',{'title':'내 제목'})
            release.set();wait_for(lambda:not self.rt.title_pending)
        self.assertEqual(self.rt.store.get('sessions','s')['title'],'내 제목')

    def test_delete_during_generation_never_recreates_session(self):
        entered=threading.Event();release=threading.Event()
        def complete(*args,**kwargs):
            entered.set();release.wait(2);return {'content':'generated'}
        with patch.object(app.providers,'complete',side_effect=complete):
            self.rt.schedule_title(self.run,'answer');self.assertTrue(entered.wait(2))
            self.rt.delete_session('s');release.set();wait_for(lambda:not self.rt.title_pending)
        self.assertIsNone(self.rt.store.get('sessions','s'))

    def test_one_attempt_and_failure_preserves_title(self):
        with patch.object(app.providers,'complete',side_effect=ValueError('failed')) as complete:
            self.rt.schedule_title(self.run,'answer');wait_for(lambda:not self.rt.title_pending)
            self.rt.schedule_title(self.run,'answer');wait_for(lambda:not self.rt.title_pending)
        self.assertEqual(complete.call_count,1)
        self.assertEqual(self.rt.store.get('sessions','s')['title'],'돼지 그려')

    def test_image_only_uses_text_model_on_same_provider(self):
        run={**self.run,'create_image':True,'provider_id':'image-provider','model':'image-model'}
        with patch.object(app.providers,'complete',return_value={'content':'돼지 그림'}) as complete:
            self.rt.schedule_title(run,'이미지를 만들었어요.')
            self.assertFalse(complete.called)
            run['provider_id']='fixture'
            self.rt.schedule_title(run,'이미지를 만들었어요.');wait_for(lambda:not self.rt.title_pending)
        self.assertEqual(complete.call_args.args[0]['model'],'text-model')
        self.assertNotIn('이미지를 만들었어요',str(complete.call_args.args[1]))
        self.assertEqual(self.rt.store.get('sessions','s')['title'],'돼지 그림')

    def test_non_opt_in_legacy_or_manually_titled_conversation_untouched(self):
        self.rt.store.patch('sessions','s',auto_title=False)
        with patch.object(app.providers,'complete') as complete:
            self.rt.schedule_title(self.run,'answer')
            self.assertFalse(complete.called)
        self.assertEqual(self.rt.store.get('sessions','s')['title'],'돼지 그려')

    def test_account_and_codex_use_tool_free_chat_paths(self):
        for kind in ('claude_code','codex'):
            with self.subTest(kind=kind):
                self.rt.store.patch('sessions','s',auto_title=True,auto_title_attempted=False,title='돼지 그려')
                self.rt.store.patch('providers','fixture',kind=kind)
                with patch.object(app.accounts,'chat',return_value={'content':'돼지 그림'}) as account, patch.object(app.providers,'run_codex',return_value={'content':'돼지 그림'}) as codex:
                    self.rt.schedule_title(self.run,'answer');wait_for(lambda:not self.rt.title_pending)
                self.assertEqual(self.rt.store.get('sessions','s')['title'],'돼지 그림')
                if kind=='claude_code':
                    self.assertEqual(account.call_count,1)
                    self.assertEqual(account.call_args.kwargs['max_tokens'],64)
                    self.assertFalse(codex.called)
                else:
                    self.assertEqual(codex.call_count,1)
                    self.assertEqual(codex.call_args.args[3],'chat')
                    self.assertFalse(account.called)

    def test_expired_request_cannot_update_title(self):
        class ImmediateTimer:
            def __init__(self,seconds,fn):self.fn=fn;self.daemon=False
            def start(self):self.fn()
            def cancel(self):pass
        with patch.object(app.threading,'Timer',ImmediateTimer), patch.object(app.providers,'complete',return_value={'content':'late title'}):
            self.rt.schedule_title(self.run,'answer');wait_for(lambda:not self.rt.title_pending)
        self.assertEqual(self.rt.store.get('sessions','s')['title'],'돼지 그려')

    def test_explicit_default_name_is_not_changed_by_next_message(self):
        self.rt.update_session('s',{'title':'새 대화'})
        with patch.object(app.providers,'complete',return_value={'content':'응답'}):
            result=self.rt.start('s',{'content':'다음 메시지'},defer=True)
            self.rt.execute(result['run_id'],self.rt.controls[result['run_id']])
        self.assertEqual(self.rt.store.get('sessions','s')['title'],'새 대화')

    def test_no_text_model_output_does_not_become_fake_title(self):
        with patch.object(app.providers,'complete',return_value={'content':None}):
            self.rt.schedule_title(self.run,'answer');wait_for(lambda:not self.rt.title_pending)
        self.assertEqual(self.rt.store.get('sessions','s')['title'],'돼지 그려')

    def test_successful_run_finishes_while_title_is_pending(self):
        entered=threading.Event();release=threading.Event()
        def complete(provider,messages,tools,on_delta,cancel,max_tokens):
            if messages[0]['content'].startswith('Summarize the user request'):
                entered.set();release.wait(2);return {'content':'돼지 그리기'}
            return {'content':'완료'}
        with patch.object(app.providers,'complete',side_effect=complete):
            result=self.rt.start('s',{'content':'다시 그려'},defer=True)
            self.rt.execute(result['run_id'],self.rt.controls[result['run_id']])
            self.assertTrue(entered.wait(2))
            self.assertEqual(self.rt.store.get('runs',result['run_id'])['status'],'completed')
            self.assertIn('s',self.rt.title_pending)
            release.set();wait_for(lambda:not self.rt.title_pending)
        self.assertEqual(self.rt.store.get('sessions','s')['title'],'돼지 그리기')

if __name__ == '__main__': unittest.main()
