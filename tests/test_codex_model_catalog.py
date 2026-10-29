import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from server import providers

SCRIPT = '''#!/usr/bin/env python3
import json,sys
for line in sys.stdin:
    req=json.loads(line)
    if req.get("method")=="initialize":
        print(json.dumps({"id":req["id"],"result":{}}),flush=True)
    elif req.get("method")=="model/list":
        cursor=req["params"].get("cursor")
        data=([{"model":"first"},{"model":"hidden","hidden":True}] if not cursor else [{"id":"second"},{"model":"first"}])
        print(json.dumps({"id":req["id"],"result":{"data":data,"nextCursor":"next" if not cursor else None}}),flush=True)
'''
class CodexCatalogTests(unittest.TestCase):
    def test_cli_catalog_paginates_filters_and_deduplicates(self):
        with tempfile.TemporaryDirectory() as d:
            cli=Path(d)/'codex'; cli.write_text(SCRIPT); cli.chmod(0o755)
            with patch.object(providers, '_codex_executable', return_value=str(cli)):
                self.assertEqual(providers.list_models({'kind':'codex'}), ['first','second'])
    def test_missing_cli_is_an_explicit_error(self):
        with patch.object(providers, '_codex_executable', return_value=None):
            with self.assertRaises(providers.ProviderError): providers.list_models({'kind':'codex'})
