import json
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

    def test_catalog_reports_registration_enabled_and_selected_separately(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            rt = app.Runtime(root / 'data', root / 'workspace')
            try:
                for skill_id, enabled in [('available', True), ('active', True), ('disabled', False)]:
                    rt.store.put('skills', dict(id=skill_id, name=skill_id, description='Catalog description', instructions='PRIVATE_INSTRUCTION_' + skill_id, enabled=enabled))
                prompt = rt.system(['active', 'disabled'], rt.settings())
                marker = 'Registered Naru skills (metadata only, not instructions):\n'
                catalog = json.JSONDecoder().raw_decode(prompt.split(marker, 1)[1])[0]
                indexed = {skill['id']: skill for skill in catalog}
                self.assertEqual(indexed['available'], dict(id='available', name='available', description='Catalog description', enabled=True, selected=False))
                self.assertTrue(indexed['active']['selected'])
                self.assertTrue(indexed['active']['enabled'])
                self.assertTrue(indexed['disabled']['selected'])
                self.assertFalse(indexed['disabled']['enabled'])
                self.assertIn('PRIVATE_INSTRUCTION_active', prompt)
                self.assertNotIn('PRIVATE_INSTRUCTION_available', prompt)
                self.assertNotIn('PRIVATE_INSTRUCTION_disabled', prompt)
                self.assertTrue(all('instructions' not in skill for skill in catalog))
            finally:
                rt.store.db.close()


if __name__ == '__main__':
    unittest.main()
