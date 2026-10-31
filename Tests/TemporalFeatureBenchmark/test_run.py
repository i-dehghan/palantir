import importlib.util
from pathlib import Path
import sys
import unittest
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
import run as mod

class TemporalFeatureTests(unittest.TestCase):
    def test_no_same_timestamp_history(self):
        rows=[('a',20,'u','v','2026-01-01T00:00:00','normal'),
              ('b',30,'u','w','2026-01-01T00:00:00','normal'),
              ('c',40,'u','v','2026-01-02T00:00:00','high')]
        x,names=mod.causal_features(rows)
        self.assertEqual(x[0,2],0)
        self.assertEqual(x[1,2],0)
        self.assertEqual(x[2,names.index('caller_calls_7d')],2)
        self.assertEqual(x[2,names.index('pair_calls_7d')],1)
        self.assertEqual(x[2,names.index('distinct_peers_7d')],2)
    def test_future_event_does_not_affect_past(self):
        rows=[('a',20,'u','v','2026-01-01','normal'),('b',30,'u','w','2026-01-02','high')]
        x,_=mod.causal_features(rows)
        x2,_=mod.causal_features(rows+[('future',500,'u','v','2026-02-01','network')])
        np.testing.assert_allclose(x,x2[:2])
    def test_chronological_splits_do_not_split_ties(self):
        from datetime import datetime, timedelta
        rows=[(str(i),10,'a','b',(datetime(2026,1,1)+timedelta(days=i//5)).isoformat(),'normal') for i in range(200)]
        splits,times=mod.chronological_splits(rows)
        self.assertEqual(sum(map(len,splits.values())),len(rows))
        for a,b in zip(list(splits)[:-1],list(splits)[1:]):
            self.assertLess(max(times[i] for i in splits[a]),min(times[i] for i in splits[b]))
    def test_missing_db_does_not_create(self):
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as td:
            p=Path(td)/'missing.db'
            with self.assertRaises(FileNotFoundError):mod.load(p)
            self.assertFalse(p.exists())
    def test_operational_db_name_rejected(self):
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as td:
            p=Path(td)/'dideban_dev.db';p.touch()
            with self.assertRaises(ValueError):mod.load(p)
if __name__=='__main__':unittest.main()
