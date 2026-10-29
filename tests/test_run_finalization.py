"""The runtime must retain its run control until its final DB access completes."""
import sys, tempfile, threading, time, unittest
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

    def test_resume_waits_until_cancelled_run_finishes_finalization(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);rt=app.Runtime(root/'data',root/'work')
            rt.store.put('providers',dict(id='p',name='mock',kind='openai',model='m',has_key=False,tools_enabled=True))
            rt.store.put('sessions',dict(id='s',title='title',provider_id='p',model='m',mode='agent',created_at=app.now(),updated_at=app.now()))
            status_written=threading.Event();release=threading.Event();finished=threading.Event();outcome={}
            original=rt.store.patch
            def gated_patch(table,id,**changes):
                result=original(table,id,**changes)
                if table=='runs' and changes.get('status')=='cancelled':
                    status_written.set();release.wait(5)
                return result
            response={'content':'','tool_calls':[{'id':'x','name':'write_file','arguments':{'path':'test.txt','content':'hi'}}],'usage':{}}
            with patch.object(app.providers,'complete',return_value=response),patch.object(rt.store,'patch',side_effect=gated_patch):
                rid=rt.start('s',{'content':'task','mode':'agent'})['run_id']
                until=time.monotonic()+4
                while rt.store.get('runs',rid)['status']!='awaiting_approval' and time.monotonic()<until:time.sleep(.01)
                self.assertEqual(rt.store.get('runs',rid)['status'],'awaiting_approval')
                rt.cancel(rid)
                self.assertTrue(status_written.wait(4))
                def resume():
                    try:outcome.update(rt.start('s',{},resume=rid,defer=True))
                    except Exception as exc:outcome['error']=str(exc)
                    finally:finished.set()
                worker=threading.Thread(target=resume);worker.start()
                try:self.assertFalse(finished.wait(.1),'resume must wait for finalization lock')
                finally:release.set();worker.join(4)
                self.assertTrue(finished.is_set())
                self.assertNotIn('error',outcome)
                new=outcome['run_id']
                self.assertEqual(rt.store.get('runs',new)['status'],'running')
                with rt.lock:
                    rt.controls.pop(new,None);rt.live.pop(new,None);rt.active.pop('s',None)
                    rt.store.patch('runs',new,status='interrupted')
            rt.store.db.close()

if __name__=='__main__':unittest.main()
