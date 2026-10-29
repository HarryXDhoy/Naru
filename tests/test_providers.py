import json
import os
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from server import providers as p

TOOLS = [{"type": "function", "function": {"name": "read_file", "description": "Read a file", "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}}]
MESSAGES = [{"role": "system", "content": "Be useful"}, {"role": "user", "content": "Read file"}]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        self.server.requests.append((self.path, None, dict(self.headers)))
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers()
        if self.path.endswith('/api/tags'):
            body = {"models": [{"name": "local-model"}]}
        elif self.path.startswith('/gemini'):
            body = {"models": [{"name": "models/gemini-test", "supportedGenerationMethods": ["generateContent"]}]}
        else:
            body = {"data": [{"id": "test-model"}]}
        self.wfile.write(json.dumps(body).encode())

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.server.requests.append((self.path, payload, dict(self.headers)))
        if self.server.error:
            self.send_response(401); self.send_header('Content-Type', 'application/json'); self.end_headers()
            self.wfile.write(json.dumps({"error": {"message": "Bad credential secret-test-key"}}).encode()); return
        self.send_response(200); self.send_header('Content-Type', self.server.content_type); self.end_headers()
        for event in self.server.events:
            if self.server.delay:
                time.sleep(self.server.delay)
            try:
                if self.server.content_type == 'application/x-ndjson':
                    data = json.dumps(event) + '\n'
                elif self.server.content_type == 'application/json':
                    data = json.dumps(event)
                else:
                    data = 'data: ' + (event if isinstance(event, str) else json.dumps(event)) + '\n\n'
                self.wfile.write(data.encode()); self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                break


class ProviderTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.server.events=[]; self.server.requests=[]; self.server.error=False; self.server.delay=0
        self.server.content_type='text/event-stream'
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True); self.thread.start()
        self.url=f'http://127.0.0.1:{self.server.server_address[1]}'
        self.deltas=[]
        self.cancel=threading.Event()

    def tearDown(self):
        self.server.shutdown(); self.server.server_close()

    def provider(self, kind):
        return {"kind":kind,"model":"test-model","base_url":self.url,'api_key':'secret-test-key'}

    def run_complete(self, kind, messages=None):
        return p.complete(self.provider(kind), messages or MESSAGES, TOOLS, self.deltas.append,self.cancel)

    def test_models_endpoints_no_inference(self):
        for kind in ['openai','responses','anthropic']:
            self.assertEqual(p.list_models(self.provider(kind)),['test-model'])
        self.assertEqual(p.list_models(self.provider('ollama')),['local-model'])
        config=self.provider('gemini'); config['base_url']+='/gemini'
        self.assertEqual(p.list_models(config),['gemini-test'])
        self.assertTrue(all(body is None for _,body,_ in self.server.requests))

    def test_gemini_catalog_follows_pages_and_rejects_repeated_token(self):
        config = self.provider('gemini')
        pages = [
            {'models':[{'name':'models/gemini-one','supportedGenerationMethods':['generateContent']}], 'nextPageToken':'next/+ token'},
            {'models':[{'name':'models/gemini-two','supportedGenerationMethods':['generateContent']}, {'name':'models/embed','supportedGenerationMethods':['embedContent']}]},
        ]
        with patch.object(p, '_json_request', side_effect=pages) as request:
            self.assertEqual(p.list_models(config), ['gemini-one', 'gemini-two'])
            self.assertIn('pageToken=next%2F%2B+token', request.call_args.args[1])
        with patch.object(p, '_json_request', return_value={'models':[], 'nextPageToken':'repeat'}):
            with self.assertRaisesRegex(p.ProviderError, '다음 페이지'):
                p.list_models(config)

    def test_offline_local_model_server_explains_how_to_start_it(self):
        error = p.urllib.error.URLError(ConnectionRefusedError('refused'))
        ollama = {'kind':'ollama', 'base_url':'http://127.0.0.1:11434'}
        studio = {'kind':'openai', 'name':'LM Studio · Local', 'base_url':'http://127.0.0.1:1234/v1'}
        custom = {'kind':'openai', 'name':'Custom', 'base_url':'http://127.0.0.1:1234/v1'}
        self.assertIn('Ollama', str(p._http_error(error, ollama)))
        self.assertIn('Local Server', str(p._http_error(error, studio)))
        self.assertNotIn('LM Studio', str(p._http_error(error, custom)))

    def test_openai_stream_tools_usage(self):
        self.server.events=[{'choices':[{'delta':{'content':'Checking '}}]}, {'choices':[{'delta':{'tool_calls':[{'index':0,'id':'c1','function':{'name':'read_file','arguments':'{"path":'}}]}}]}, {'choices':[{'delta':{'tool_calls':[{'index':0,'function':{'arguments':'"x.txt"}'}}]},'finish_reason':'tool_calls'}]}, {'choices':[],'usage':{'prompt_tokens':10,'completion_tokens':4}}, '[DONE]']
        out=self.run_complete('openai')
        self.assertEqual(out['content'],'Checking ')
        self.assertEqual(out['tool_calls'],[{'id':'c1','name':'read_file','arguments':{'path':'x.txt'}}])
        self.assertEqual(out['usage']['total_tokens'],14)
        self.assertEqual(self.server.requests[-1][2]['Authorization'],'Bearer secret-test-key')

    def test_openai_continuation_preserves_tool_ids(self):
        self.server.events=[{'choices':[{'delta':{'content':'Done'},'finish_reason':'stop'}]},'[DONE]']
        messages=MESSAGES+[{'role':'assistant','content':'','tool_calls':[{'id':'c1','type':'function','function':{'name':'read_file','arguments':'{"path":"a"}'}}],'_native':{'ignored':True}}, {'role':'tool','tool_call_id':'c1','name':'read_file','content':'Hello'}]
        self.run_complete('openai',messages)
        sent=self.server.requests[-1][1]['messages']
        self.assertNotIn('_native',sent[-2]);self.assertEqual(sent[-1]['tool_call_id'],'c1')

    def test_responses_preserves_reasoning_items(self):
        output=[{'type':'reasoning','id':'r1','encrypted_content':'opaque'}, {'type':'function_call','id':'f1','call_id':'c1','name':'read_file','arguments':'{"path":"a"}'}]
        self.server.events=[{'type':'response.completed','response':{'status':'completed','output':output,'usage':{'input_tokens':3,'output_tokens':4}}}]
        out=self.run_complete('responses')
        self.assertEqual(out['native']['output'],output)
        self.assertEqual(out['tool_calls'][0]['arguments'],{'path':'a'})
        self.server.events=[{'type':'response.output_text.delta','delta':'Done'}, {'type':'response.completed','response':{'status':'completed','output':[{'type':'message','role':'assistant','content':[{'type':'output_text','text':'Done'}]}]}}]
        follow=MESSAGES+[{'role':'assistant','content':'','_native':out['native']}, {'role':'tool','tool_call_id':'c1','name':'read_file','content':'hi'}]
        result=self.run_complete('responses',follow)
        sent=self.server.requests[-1][1]
        self.assertIn(output[0],sent['input'])
        self.assertEqual(sent['input'][-1]['call_id'],'c1');self.assertFalse(sent['store'])
        self.assertEqual(result['content'],'Done')

    def test_responses_truncated_stream_is_error(self):
        self.server.events=[{'type':'response.output_text.delta','delta':'partial'}]
        with self.assertRaises(p.ProviderError):self.run_complete('responses')

    def test_anthropic_tools_and_signature(self):
        self.server.events=[{'type':'message_start','message':{'usage':{'input_tokens':5}}},{'type':'content_block_start','index':0,'content_block':{'type':'thinking','thinking':''}}, {'type':'content_block_delta','index':0,'delta':{'type':'thinking_delta','thinking':'private'}}, {'type':'content_block_delta','index':0,'delta':{'type':'signature_delta','signature':'sig'}}, {'type':'content_block_start','index':1,'content_block':{'type':'tool_use','id':'c1','name':'read_file','input':{}}}, {'type':'content_block_delta','index':1,'delta':{'type':'input_json_delta','partial_json':'{"path":"a"}'}}, {'type':'message_delta','delta':{'stop_reason':'tool_use'},'usage':{'output_tokens':4}}, {'type':'message_stop'}]
        result=self.run_complete('anthropic')
        self.assertEqual(result['tool_calls'][0]['arguments'],{'path':'a'})
        self.assertEqual(result['native']['content'][0]['signature'],'sig')
        self.assertEqual(self.deltas,[])
        follow=MESSAGES+[{'role':'assistant','content':'','_native':result['native']},{'role':'tool','tool_call_id':'c1','name':'read_file','content':'data'}]
        self.server.content_type='application/json'
        self.server.events=[{'role':'assistant','content':[{'type':'text','text':'Done'}],'stop_reason':'end_turn'}]
        self.run_complete('anthropic',follow)
        sent=self.server.requests[-1][1]
        self.assertEqual(sent['messages'][-2]['content'][0]['signature'],'sig')
        self.assertEqual(sent['messages'][-1]['content'][0]['tool_use_id'],'c1')

    def test_gemini_preserves_thought_signature(self):
        parts=[{'functionCall':{'name':'read_file','args':{'path':'a'}},'thoughtSignature':'opaque'}]
        self.server.events=[{'candidates':[{'content':{'parts':parts},'finishReason':'STOP'}],'usageMetadata':{'promptTokenCount':3,'candidatesTokenCount':2}}]
        result=self.run_complete('gemini')
        self.assertEqual(result['native']['parts'],parts)
        follow=MESSAGES+[{'role':'assistant','content':'','_native':result['native']},{'role':'tool','tool_call_id':result['tool_calls'][0]['id'],'name':'read_file','content':'{"value":1}'}]
        self.server.events=[{'candidates':[{'content':{'parts':[{'text':'Done'}]},'finishReason':'STOP'}]}]
        self.run_complete('gemini',follow)
        sent=self.server.requests[-1][1]
        self.assertEqual(sent['contents'][-2]['parts'],parts)
        self.assertEqual(sent['contents'][-1]['parts'][0]['functionResponse']['response'],{'value':1})

    def test_ollama_native_stream_and_tools(self):
        self.server.content_type='application/x-ndjson'
        self.server.events=[{'message':{'role':'assistant','content':'Hi'}}, {'message':{'tool_calls':[{'function':{'name':'read_file','arguments':{'path':'a'}}}]}},{'message':{},'done':True,'prompt_eval_count':10,'eval_count':4}]
        result=self.run_complete('ollama')
        self.assertEqual(result['content'],'Hi');self.assertEqual(result['usage']['total_tokens'],14)
        self.assertEqual(result['tool_calls'][0]['arguments'],{'path':'a'})
        follow=MESSAGES+[{'role':'assistant','content':'','tool_calls':[{'id':'c1','type':'function','function':{'name':'read_file','arguments':'{"path":"a"}'}}]},{'role':'tool','name':'read_file','tool_call_id':'c1','content':'data'}]
        self.run_complete('ollama',follow)
        sent=self.server.requests[-1][1]['messages']
        self.assertEqual(sent[-2]['tool_calls'][0]['function']['arguments'],{'path':'a'})
        self.assertEqual(sent[-1]['tool_name'],'read_file')

    def test_errors_redact_keys(self):
        self.server.error=True
        with self.assertRaises(p.ProviderError) as error:self.run_complete('openai')
        self.assertNotIn('secret-test-key',str(error.exception));self.assertIn('401',str(error.exception))

    def test_malformed_tool_arguments_never_execute(self):
        self.server.events=[{'choices':[{'delta':{'tool_calls':[{'index':0,'id':'x','function':{'name':'read_file','arguments':'not-json'}}]},'finish_reason':'tool_calls'}]},'[DONE]']
        with self.assertRaises(p.ProviderError):self.run_complete('openai')

    def test_precancel_does_not_send_request(self):
        self.cancel.set()
        with self.assertRaises(p.CancelledError):self.run_complete('openai')
        self.assertEqual(self.server.requests,[])

    def test_cancel_during_stalled_request(self):
        self.server.events=[{'choices':[{'delta':{'content':'late'},'finish_reason':'stop'}]}]
        self.server.delay=2
        threading.Timer(.15,self.cancel.set).start()
        started=time.monotonic()
        with self.assertRaises(p.CancelledError):self.run_complete('openai')
        self.assertLess(time.monotonic()-started,1)

    def test_invalid_endpoint_rejects_embedded_secrets(self):
        for url in ['file:///etc/passwd','http://key:password@example.com','https://example.com?api_key=secret']:
            config=self.provider('openai');config['base_url']=url
            with self.assertRaises(p.ProviderError):p.list_models(config)

    def test_truncated_streams_rejected(self):
        fixtures = {
            'openai': [{'choices': [{'delta': {'content': 'partial'}}]}],
            'anthropic': [{'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'text', 'text': 'partial'}}],
            'gemini': [{'candidates': [{'content': {'parts': [{'text': 'partial'}]}}]}],
        }
        for kind, events in fixtures.items():
            self.server.events = events
            with self.assertRaises(p.ProviderError, msg=kind): self.run_complete(kind)

    def test_codex_planner_normalizes_host_tools(self):
        result={'content':json.dumps({'content':'Reading','tool_calls':[{'id':'c1','name':'read_file','arguments_json':'{"path":"a"}'}]}),'usage':{'input_tokens':2}}
        with patch.object(p,'run_codex',return_value=result) as run:
            output=p.complete({'kind':'codex','model':''},MESSAGES,TOOLS,self.deltas.append,self.cancel)
            self.assertEqual(output['tool_calls'][0]['arguments'],{'path':'a'})
            self.assertEqual(self.deltas,['Reading'])
            self.assertTrue(run.call_args.kwargs['_planner'])
            self.assertEqual(run.call_args.args[3],'chat')

    def test_codex_planner_rejects_unregistered_tools(self):
        result={'content':json.dumps({'content':'','tool_calls':[{'id':'c1','name':'evil_tool','arguments_json':'{}'}]}),'usage':{}}
        with patch.object(p,'run_codex',return_value=result):
            with self.assertRaises(p.ProviderError):p.complete({'kind':'codex','model':''},MESSAGES,TOOLS,self.deltas.append,self.cancel)

    def test_plain_chat_disables_native_action_tools(self):
        with tempfile.TemporaryDirectory() as folder:
            binary=Path(folder)/'codex'
            captured=Path(folder)/'argv.json'
            script = ('#!/usr/bin/env python3\nimport json,sys\n'
                      'sys.stdin.read()\n'
                      f'open({str(captured)!r},"w").write(json.dumps(sys.argv[1:]))\n'
                      'print(json.dumps({"type":"item.completed","item":{"id":"m1","type":"agent_message","text":"Hello"}}))\n'
                      'print(json.dumps({"type":"turn.completed","usage":{}}))\n')
            binary.write_text(script);binary.chmod(0o755)
            with patch.dict(os.environ,{'NARU_CODEX_BIN':str(binary)}):
                events=[]
                p.run_codex('Hello','',folder,'chat',lambda *args:events.append(args),self.cancel)
            argv=json.loads(captured.read_text())
            disabled={argv[i+1] for i,v in enumerate(argv[:-1]) if v=='--disable'}
            self.assertTrue({'shell_tool','apps','plugins','memories','multi_agent','hooks','browser_use','computer_use'}.issubset(disabled))
            self.assertEqual(argv[argv.index('--sandbox')+1],'read-only')
            self.assertNotIn('workspace-write',argv)
            for setting in ['web_search="disabled"','skills.bundled.enabled=false','skills.include_instructions=false','project_doc_max_bytes=0','mcp_servers={}']:
                self.assertIn(setting,argv)
            self.assertTrue(any(kind=='status' and isinstance(data.get('text'),str) for kind,data in events))

    def test_codex_json_events_and_arguments(self):
        with tempfile.TemporaryDirectory() as folder:
            binary=Path(folder)/'codex'
            binary.write_text('#!/usr/bin/env python3\nimport json,sys\nif sys.argv[1:]==["login","status"]:\n print("Logged in using ChatGPT");sys.exit(0)\nprompt=sys.stdin.read()\nprint(json.dumps({"type":"thread.started","thread_id":"abc"}))\nprint(json.dumps({"type":"item.completed","item":{"id":"m1","type":"agent_message","text":"Hello"}}))\nprint(json.dumps({"type":"turn.completed","usage":{"input_tokens":2,"output_tokens":1}}))\n')
            binary.chmod(0o755)
            with patch.dict(os.environ,{'NARU_CODEX_BIN':str(binary)}):
                self.assertTrue(p.codex_status()['authenticated'])
                events=[]
                result=p.run_codex('Hello','',folder,'chat',lambda *a:events.append(a),self.cancel)
                self.assertEqual(result['content'],'Hello')
                self.assertEqual(result['usage']['total_tokens'],3)
                self.assertIn(('delta',{'text':'Hello'}),events)


if __name__=='__main__':unittest.main()
