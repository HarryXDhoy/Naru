import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from server import app


class ContextRefsAPITests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name).resolve()
        self.rt=app.Runtime(self.root/'data',self.root/'workspace')
        (self.root/'workspace'/'src').mkdir()
        (self.root/'workspace'/'src'/'sample.py').write_text('example = 7\n')
        self.server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        self.server.runtime=self.rt
        threading.Thread(target=self.server.serve_forever,daemon=True).start()

    def tearDown(self):
        self.server.shutdown();self.server.server_close()
        self.rt.store.db.close();self.tmp.cleanup()

    def request(self,method,path,body=None,token=True):
        c=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
        headers={'Content-Type':'application/json'}
        if token:headers['X-Naru-Token']=self.rt.csrf
        c.request(method,path,json.dumps(body) if body is not None else None,headers)
        res=c.getresponse();payload=json.loads(res.read());status=res.status;c.close()
        return status,payload

    def test_search_names_then_explicit_snapshot(self):
        with patch.object(app.context_refs,'snapshot',wraps=app.context_refs.snapshot) as snap:
            status,result=self.request('GET','/api/context/files?q=sample')
            self.assertEqual(status,200);self.assertEqual(result['files'],['src/sample.py'])
            self.assertEqual(result['workspace'],str(self.root/'workspace'));snap.assert_not_called()
            status,result=self.request('POST','/api/context/read',{'path':'src/sample.py','workspace':result['workspace']})
            self.assertEqual(status,200);self.assertEqual(result['text'],'example = 7\n');snap.assert_called_once()

    def test_read_rejects_stale_workspace_missing_csrf_and_outside_paths(self):
        workspace=str(self.root/'workspace')
        for path in ('../secret.txt','/tmp/secret.txt','.hidden.txt'):
            status,_=self.request('POST','/api/context/read',{'path':path,'workspace':workspace})
            self.assertEqual(status,400)
        status,_=self.request('POST','/api/context/read',{'path':'src/sample.py','workspace':'/tmp'})
        self.assertEqual(status,400)
        status,_=self.request('POST','/api/context/read',{'path':'src/sample.py','workspace':workspace},token=False)
        self.assertEqual(status,403)
        status,_=self.request('POST','/api/context/read',{'path':'src/missing.py','workspace':workspace})
        self.assertEqual(status,400)

    def test_changed_workspace_rejects_selection(self):
        _,found=self.request('GET','/api/context/files?q=sample')
        self.rt.store.patch('settings','main',workspace=str(self.root/'another'))
        status,result=self.request('POST','/api/context/read',{'path':found['files'][0],'workspace':found['workspace']})
        self.assertEqual(status,400);self.assertIn('바뀌었습니다',result['error'])

    def test_wrong_methods_rejected(self):
        self.assertEqual(self.request('POST','/api/context/files',{})[0],404)
        self.assertEqual(self.request('GET','/api/context/read')[0],404)


if __name__=='__main__':unittest.main()
