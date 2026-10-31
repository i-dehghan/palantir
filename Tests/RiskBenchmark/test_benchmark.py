import importlib.util
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('risk_benchmark', HERE / 'benchmark.py')
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

class BenchmarkTests(unittest.TestCase):
    def test_missing_database_is_not_created(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'missing.db'
            with self.assertRaises(FileNotFoundError):
                module.evaluate(path)
            self.assertFalse(path.exists())

    def test_invalid_schema_rejected_without_writing(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'empty.db'
            conn = sqlite3.connect(path)
            conn.close()
            before = path.read_bytes()
            with self.assertRaises(ValueError):
                module.evaluate(path)
            self.assertEqual(before, path.read_bytes())

if __name__ == '__main__':
    unittest.main()
