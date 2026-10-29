import sys, tempfile, threading, time, unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import app, providers


def wait_for(predicate):
    deadline=time.monotonic()+5
    while time.monotonic()<deadline:
        if predicate():return
        time.sleep(.01)
    raise AssertionError('timed out')


class ReasoningTests(unittest.TestCase):
    def test_capabilities_read_model_catalog_and_default(self):
        catalog=[{'model':'m1','isDefault':True,'defaultReasoningEffort':'medium','supportedReasoningEfforts':[{'reasoningEffort':'low'},{'reasoningEffort':'ultra'}]}, {'model':'m2','supportedReasoningEfforts':[{'reasoningEffort':'medium'}]}]
        with patch.object(providers,'codex_models',return_value=catalog):
            self.assertEqual(providers.reasoning_capabilities({'kind':'codex'},'')['levels'],['low','ultra'])
            self.assertEqual(providers.reasoning_capabilities({'kind':'codex'},'m2')['levels'],['medium'])
            self.assertEqual(providers.reasoning_capabilities({'kind':'codex'},'missing')['levels'],[])
        p={'kind':'openai','base_url':'https://openrouter.ai/api/v1'}
        data={'data':[{'id':'a','reasoning':{'supported_efforts':['high','low'],'default_effort':'low'}},{'id':'b','reasoning':{'supported_efforts':None}},{'id':'c'}]}
        with patch.object(providers,'_json_request',return_value=data):
            self.assertEqual(providers.reasoning_capabilities(p,'a')['levels'],['low','high'])
            self.assertEqual(providers.reasoning_capabilities(p,'b')['levels'],list(providers.OPENROUTER_REASONING_LEVELS))
            self.assertEqual(providers.reasoning_capabilities(p,'c')['levels'],[])

    def test_provider_body_uses_reasoning_and_requires_parameter_support(self):
        p={'kind':'openai','model':'openai/test','base_url':'https://openrouter.ai/api/v1','reasoning_effort':'high'}
        event={'choices':[{'delta':{'content':'ok'},'finish_reason':'stop'}]}
        with patch.object(providers,'_stream_request',return_value=iter([event])) as req:
            providers.complete(p,[{'role':'user','content':'hello'}],[],lambda x:None,threading.Event())
        payload=req.call_args.args[2]
        self.assertEqual(payload['reasoning'],{'effort':'high'})
        self.assertEqual(payload['provider'],{'require_parameters':True})
        p['reasoning_effort']='default'
        with patch.object(providers,'_stream_request',return_value=iter([event])) as req:
            providers.complete(p,[{'role':'user','content':'hello'}],[],lambda x:None,threading.Event())
        self.assertNotIn('reasoning',req.call_args.args[2])

    def test_reject_unsupported_providers_and_bad_values(self):
        for p in [{'kind':'ollama'},{'kind':'claude_code'},{'kind':'openai','base_url':'http://127.0.0.1:1234'}]:
            with self.assertRaises(providers.ProviderError):providers.validate_reasoning(p,'high')
            self.assertEqual(providers.validate_reasoning(p,'default'),'default')
        with self.assertRaises(providers.ProviderError):providers.validate_reasoning({'kind':'codex'},'bad')
        with self.assertRaises(providers.ProviderError):providers.validate_reasoning({'kind':'codex'},'high',image=True)
        with self.assertRaises(providers.ProviderError):providers.validate_reasoning({'kind':'openai','base_url':'https://openrouter.ai/api/v1'},'ultra')

    def test_queue_snapshot_and_resume_preserve_effort(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);rt=app.Runtime(root/'data',root/'work')
            rt.store.put('sessions',dict(id='s',title='test',provider_id='codex',model='m',mode='chat',created_at=app.now(),updated_at=app.now()))
            gate=threading.Event();seen=[]
            def answer(prompt,model,workspace,mode,on_event,cancel,**kwargs):
                seen.append(kwargs.get('reasoning_effort','default'));gate.wait(3)
                return {'content':'ok','usage':{}}
            try:
                with patch.object(providers,'run_codex',side_effect=answer):
                    rt.start('s',{'content':'first','reasoning_effort':'low'})
                    wait_for(lambda:seen)
                    q=rt.enqueue('s',{'content':'second','reasoning_effort':'high'})['queued']
                    rt.update_session('s',{'reasoning_effort':'medium'})
                    self.assertEqual(q['reasoning_effort'],'high')
                    gate.set();wait_for(lambda:len(rt.store.all('runs'))==2 and not rt.controls)
                    self.assertEqual(seen,['low','high'])
                    self.assertEqual([r['reasoning_effort'] for r in rt.store.all('runs')],['low','high'])
                    self.assertEqual(rt.session('s')['reasoning_effort'],'medium')
                    last=rt.store.all('runs')[-1];rt.store.patch('runs',last['id'],status='interrupted')
                    rt.start('s',{},resume=last['id']);wait_for(lambda:len(rt.store.all('runs'))==3 and not rt.controls)
                    self.assertEqual(seen[-1],'high')
            finally:
                gate.set()
                for e in list(rt.controls.values()):e.set()
                wait_for(lambda:not rt.controls)
                rt.store.db.close()

    def test_planner_receives_effort(self):
        result={'content':'{"content":"ok","tool_calls":[]}','usage':{}}
        with patch.object(providers,'run_codex',return_value=result) as run:
            providers.complete({'kind':'codex','model':'m','reasoning_effort':'high'},[{'role':'user','content':'hi'}],[],lambda x:None,threading.Event())
        self.assertEqual(run.call_args.kwargs['reasoning_effort'],'high')

    def test_image_queue_does_not_reset_text_effort(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);rt=app.Runtime(root/'data',root/'work')
            rt.store.put('sessions',dict(id='s',title='test',provider_id='codex',model='m',mode='chat',reasoning_effort='high',queue_paused=True,created_at=app.now(),updated_at=app.now()))
            try:
                q=rt.enqueue('s',{'content':'a picture','provider_id':'codex','model':'m','reasoning_effort':'default','create_image':True,'image_provider_id':'codex','image_model':'__default__'})['queued']
                q=rt.store.get('queued_messages',q['id'])
                rid=rt.start('s',q,queued=q,defer=True)['run_id']
                self.assertEqual(rt.session('s')['reasoning_effort'],'high')
                self.assertEqual(rt.store.get('runs',rid)['reasoning_effort'],'default')
            finally:rt.store.db.close()

if __name__=='__main__':unittest.main()
