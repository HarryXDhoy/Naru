import http.client
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from server import app


def wait_for(fn):
    end = time.monotonic() + 5
    while time.monotonic() < end:
        value = fn()
        if value:
            return value
        time.sleep(.01)
    raise AssertionError('timed out')


class AskUserTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.rt = app.Runtime(self.root / 'data', self.root / 'work')
        self.rt.store.put('providers', dict(id='fixture', kind='openai', name='Fixture', model='fixture', has_key=False, tools_enabled=True, base_url='http://127.0.0.1'))
        self.rt.store.put('sessions', dict(id='session', title='test', provider_id='fixture', model='fixture', mode='agent', created_at=app.now(), updated_at=app.now()))

    def tearDown(self):
        for control in list(self.rt.controls.values()): control.set()
        wait_for(lambda: not self.rt.controls)
        self.rt.store.db.close()
        self.tmp.cleanup()

    def request(self):
        return {'content':'', 'tool_calls':[{'id':'q1','name':'ask_user','arguments':{'question':'어느 폴더를 사용할까요?', 'options':['A', 'B']}}], 'usage':{}}

    def question(self, run):
        return next((a for a in self.rt.store.where('approvals','run_id',run) if a.get('kind')=='question' and a['status']=='pending'),None)

    def test_question_continues_in_agent_and_plan_with_free_text(self):
        for mode in ('agent','plan'):
            self.rt.store.patch('settings','main',access_mode='full_access')
            calls=[]
            def complete(p,ctx,tools,*args,**kwargs):
                calls.append((list(ctx),tools))
                return self.request() if len(calls)==1 else {'content':'완료', 'tool_calls':[], 'usage':{}}
            with patch.object(app.providers,'complete',side_effect=complete):
                rid=self.rt.start('session',{'content':'진행해줘','mode':mode})['run_id']
                q=wait_for(lambda:self.question(rid))
                self.assertEqual(self.rt.store.get('runs',rid)['status'],'awaiting_user')
                self.assertIn('ask_user',[tool['function']['name'] for tool in calls[0][1]])
                self.rt.answer_question(q['id'],'직접 입력한 답')
                wait_for(lambda:self.rt.store.get('runs',rid)['status']=='completed')
                result=next(m for m in calls[-1][0] if m.get('tool_call_id')=='q1')
                self.assertEqual(json.loads(result['content']),{'answer':'직접 입력한 답'})
            wait_for(lambda:not self.rt.controls)

    def test_cancel_resume_reasks_and_expired_question_cannot_answer(self):
        with patch.object(app.providers,'complete',side_effect=lambda *a,**kw:self.request()):
            rid=self.rt.start('session',{'content':'선택이 필요해'})['run_id']
            old=wait_for(lambda:self.question(rid))
            with self.assertRaises(ValueError):self.rt.delete_session('session')
            self.rt.cancel(rid)
            wait_for(lambda:self.rt.store.get('runs',rid)['status']=='cancelled')
            wait_for(lambda:not self.rt.controls)
        self.assertEqual(self.rt.store.get('approvals',old['id'])['status'],'expired')
        with self.assertRaises(ValueError):self.rt.answer_question(old['id'],'A')
        with patch.object(app.providers,'complete',return_value={'content':'완료','tool_calls':[],'usage':{}}):
            new=self.rt.start('session',{},resume=rid)['run_id']
            q=wait_for(lambda:self.question(new))
            self.rt.answer_question(q['id'],'A')
            wait_for(lambda:self.rt.store.get('runs',new)['status']=='completed')
        self.assertEqual(self.rt.store.get('approvals',q['id'])['answer'],'A')

    def test_queue_waits_for_answer_and_response_validation(self):
        responses=[self.request(),{'content':'첫 작업 완료','tool_calls':[],'usage':{}},{'content':'두 번째 완료','tool_calls':[],'usage':{}}]
        with patch.object(app.providers,'complete',side_effect=lambda *a,**kw:responses.pop(0)):
            rid=self.rt.start('session',{'content':'시작'})['run_id']
            q=wait_for(lambda:self.question(rid))
            self.rt.enqueue('session',{'content':'나중에 처리'})
            self.assertEqual(len(self.rt.store.where('queued_messages','session_id','session')),1)
            for bad in ('', ' '*2, 'x'*4001, None):
                with self.assertRaises(ValueError):self.rt.answer_question(q['id'],bad)
            self.rt.answer_question(q['id'],'B')
            with self.assertRaises(ValueError):self.rt.answer_question(q['id'],'A')
            wait_for(lambda:len(self.rt.store.where('runs','session_id','session'))==2 and self.rt.store.where('runs','session_id','session')[-1]['status']=='completed')
        self.assertFalse(self.rt.store.where('queued_messages','session_id','session'))

    def test_clarification_is_visible_and_retained_in_followup_history_and_title(self):
        self.rt.store.patch('sessions','session',auto_title=True)
        calls=[];titles=[]
        def complete(p,ctx,tools,*args,**kwargs):
            calls.append([dict(m) for m in ctx])
            if len(calls)==1:return self.request()
            return {'content':'완료', 'tool_calls':[], 'usage':{}}
        def generate(run,expected,text,answer,cancel):
            titles.append(text)
            with self.rt.lock:self.rt.title_pending.pop(run['session_id'],None)
        with patch.object(self.rt,'generate_title',side_effect=generate),patch.object(app.providers,'complete',side_effect=complete):
            rid=self.rt.start('session',{'content':'프로젝트를 만들어줘'})['run_id']
            q=wait_for(lambda:self.question(rid));self.rt.answer_question(q['id'],'B')
            with self.assertRaises(ValueError):self.rt.answer_question(q['id'],'A')
            wait_for(lambda:self.rt.store.get('runs',rid)['status']=='completed')
            wait_for(lambda:not self.rt.controls and not self.rt.title_pending)
            next_run=self.rt.start('session',{'content':'그 폴더에 저장해줘'})['run_id']
            wait_for(lambda:self.rt.store.get('runs',next_run)['status']=='completed')
        view=self.rt.session_view('session')
        pair=[m for m in view['messages'] if m.get('question_id')==q['id']]
        self.assertEqual([(m['role'],m['content']) for m in pair],[('assistant','어느 폴더를 사용할까요?'),('user','B')])
        self.assertEqual(len(pair),2)
        history=calls[-1]
        self.assertTrue(any(m['role']=='assistant' and m['content']=='어느 폴더를 사용할까요?' for m in history))
        self.assertTrue(any(m['role']=='user' and m['content']=='B' for m in history))
        self.assertEqual(titles,['프로젝트를 만들어줘'])

    def test_answer_survives_immediate_cancel_without_duplicate_messages(self):
        with patch.object(app.providers,'complete',return_value=self.request()):
            rid=self.rt.start('session',{'content':'시작'})['run_id']
            q=wait_for(lambda:self.question(rid))
            with self.rt.lock:
                self.rt.answer_question(q['id'],'B')
                self.rt.cancel(rid)
            wait_for(lambda:self.rt.store.get('runs',rid)['status']=='cancelled')
            wait_for(lambda:not self.rt.controls)
        self.assertEqual(self.rt.store.get('approvals',q['id'])['status'],'answered')
        self.assertEqual([(m['role'],m['content']) for m in self.rt.session_view('session')['messages'] if m.get('question_id')==q['id']],[('assistant','어느 폴더를 사용할까요?'),('user','B')])

    def test_restart_marks_pending_question_interrupted_and_expires_it(self):
        self.rt.store.put('runs',{'id':'old','status':'awaiting_user','session_id':'session'})
        self.rt.store.put('approvals',{'id':'old-q','run_id':'old','kind':'question','status':'pending'})
        other=app.Runtime(self.root/'data',self.root/'work')
        self.assertEqual(other.store.get('runs','old')['status'],'interrupted')
        self.assertEqual(other.store.get('approvals','old-q')['status'],'expired')
        other.store.db.close()

    def test_http_question_response_and_approval_are_separate(self):
        server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler);server.runtime=self.rt
        threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with patch.object(app.providers,'complete',side_effect=[self.request(),{'content':'완료','tool_calls':[],'usage':{}}]):
                rid=self.rt.start('session',{'content':'진행'})['run_id'];q=wait_for(lambda:self.question(rid))
                def post(path,body):
                    conn=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=5)
                    conn.request('POST',path,json.dumps(body),{'Content-Type':'application/json','X-Naru-Token':self.rt.csrf})
                    response=conn.getresponse();payload=json.loads(response.read());conn.close();return response.status,payload
                self.assertEqual(post('/api/approvals/'+q['id'],{'decision':'approve'})[0],400)
                self.assertEqual(post('/api/questions/'+q['id'],{'answer':'A'})[0],200)
                wait_for(lambda:self.rt.store.get('runs',rid)['status']=='completed')
                self.assertEqual(post('/api/questions/'+q['id'],{'answer':'B'})[0],400)
        finally:
            server.shutdown();server.server_close()

if __name__ == '__main__':unittest.main()
