# DIDEBAN 3.1.7.5 — Windows SQLite handle fix

This patch closes every SQLite connection explicitly, including test connections.
A `with sqlite3.connect(...)` block commits or rolls back a transaction,
but does not close the connection. On Windows this can cause WinError 32
during TemporaryDirectory cleanup.

Extract this ZIP into D:\\project\\Dideban with -Force.
It replaces only:
- Tests/IsolatedBackendBenchmark/prepare.py
- Tests/IsolatedBackendBenchmark/test_prepare.py

Run:
  python -m unittest discover -s .\\Tests\\IsolatedBackendBenchmark -p "test_*.py" -v
  python .\\Tests\\IsolatedBackendBenchmark\\prepare.py --db .\\data\\dideban_synthetic_3173.db --out-dir .\\data\\benchmark_3175

If the output directory already contains files, choose a fresh output directory.
The backend is not started by this script.
