"""The runtime must retain its run control until its final DB access completes."""
import sys, tempfile, threading, unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import app


class RunFinalizationTests(unittest.TestCase):
    def test_control_remains_until_final_queue_read_finishes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);rt=app.Runtime(root/'data',root/'work')
            rt.store.put('providers',dict(id='p',name='mock',kind='openai',model='m',has_key=False))
            rt.store.put('sessions',dict(id='s',title='title',provider_id='p',model='m',mode='chat',created_at=app.now(),updated_at=app.now()))
            rid=rt.start('s',{'content':'hello'},defer=True)['run_id']
            entered=threading.Event();release=threading.Event();where=rt.store.where
            def gated_where(table,field,value):
                if table=='queued_messages':entered.set();release.wait(2)
                return where(table,field,value)
            with patch.object(app.providers,'complete',return_value={'content':'answer'}),patch.object(rt.store,'where',side_effect=gated_where):
                worker=threading.Thread(target=rt.execute,args=(rid,rt.controls[rid]))
                worker.start()
                try:
                    self.assertTrue(entered.wait(2))
                    self.assertIn(rid,rt.controls)
                finally:
                    release.set();worker.join(2)
                self.assertFalse(worker.is_alive())
                self.assertNotIn(rid,rt.controls)
            rt.store.db.close()

if __name__=='__main__':unittest.main()
