import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from prepare import REQUIRED, prepare


class PreparationTests(unittest.TestCase):
    def _create_source(self, source: Path) -> None:
        with closing(sqlite3.connect(source)) as db:
            with db:
                for name in REQUIRED:
                    db.execute(f'CREATE TABLE "{name}" (id INTEGER)')
                db.execute('INSERT INTO SyntheticGroundTruth VALUES (1)')

    def test_stage_isolated_copy(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            src = root / "source.db"
            self._create_source(src)

            result = prepare(src, root / "stage")
            self.assertFalse(result["backendExecuted"])
            self.assertTrue(Path(result["operationalCopy"]).is_file())

            with closing(sqlite3.connect(result["operationalCopy"])) as db:
                with db:
                    db.execute("INSERT INTO DiscrepancyLogs VALUES (5)")

            with closing(sqlite3.connect(src)) as db:
                self.assertEqual(
                    db.execute("SELECT COUNT(*) FROM DiscrepancyLogs").fetchone()[0],
                    0,
                )

    def test_refuses_nonempty_directory(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            src = root / "source.db"
            out = root / "stage"
            out.mkdir()
            (out / "keep").write_text("x", encoding="utf-8")
            self._create_source(src)

            with self.assertRaises(FileExistsError):
                prepare(src, out)


if __name__ == "__main__":
    unittest.main()
