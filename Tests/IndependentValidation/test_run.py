import sys
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from run import make_ood, evaluate

class OODTests(unittest.TestCase):
    def test_determinism_balance_and_finite_features(self):
        for domain in ('CUSTOMS','BANKING','TELECOM'):
            x,y=make_ood(domain,400,123)
            xx,yy=make_ood(domain,400,123)
            np.testing.assert_array_equal(x,xx)
            np.testing.assert_array_equal(y,yy)
            self.assertEqual(int(y.sum()),200)
            self.assertTrue(np.isfinite(x).all())
            self.assertEqual(x.shape[1],2 if domain=='CUSTOMS' else 3)

    def test_missing_db_is_not_created(self):
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as tmp:
            db=Path(tmp)/'missing.db'
            with self.assertRaises(FileNotFoundError):evaluate(db)
            self.assertFalse(db.exists())

if __name__=='__main__':unittest.main()
