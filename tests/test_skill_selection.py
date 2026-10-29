import tempfile
import unittest
from pathlib import Path
from server import app


class SkillSelectionTests(unittest.TestCase):
    def test_imported_skill_is_only_included_when_enabled_and_selected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            rt = app.Runtime(root / 'data', root / 'workspace')
            try:
                instructions = '---\nname: ego-browser\n---\nUse the available browser tools.'
                rt.store.put('skills', dict(id='imported', name='ego-browser', description='', instructions=instructions, enabled=True))
                self.assertIn(instructions, rt.system(['imported'], rt.settings()))
                self.assertNotIn(instructions, rt.system([], rt.settings()))
                rt.store.patch('skills', 'imported', enabled=False)
                self.assertNotIn(instructions, rt.system(['imported'], rt.settings()))
            finally:
                rt.store.db.close()


if __name__ == '__main__':
    unittest.main()
