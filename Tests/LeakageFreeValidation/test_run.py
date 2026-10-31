import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from run import DSU,features,split_indices,choose_threshold,run,new_model,calibrate_prefitted

class LeakageFreeTests(unittest.TestCase):
    def test_disjoint_graph_components(self):
        rows=[]
        for component in range(40):
            for edge in range(4):
                rows.append((f'R{component}-{edge}',1000000+edge,
                             f'A{component}',f'B{component}-{edge}',f'ID{component}'))
        tr,cal,te,groups=split_indices('BANKING',rows,3179)
        self.assertFalse(set(groups[tr])&set(groups[cal]))
        self.assertFalse(set(groups[tr])&set(groups[te]))
        self.assertFalse(set(groups[cal])&set(groups[te]))
        endpoint=lambda ids:{rows[i][j] for i in ids for j in (2,3)}
        self.assertFalse(endpoint(tr)&endpoint(te))
        self.assertFalse(endpoint(tr)&endpoint(cal))
        self.assertFalse(endpoint(cal)&endpoint(te))

    def test_label_feasible_component_split(self):
        rows=[]; labels=[]
        for component in range(60):
            for edge in range(4):
                rows.append((f'R{component}-{edge}',1000+edge,
                             f'A{component}',f'B{component}-{edge}',f'ID{component}'))
                labels.append(component%2)
        tr,cal,te,groups=split_indices('BANKING',rows,3179,np.array(labels))
        for ids in (tr,cal,te):
            self.assertGreaterEqual(len(ids),20)
            self.assertEqual(set(np.array(labels)[ids]),{0,1})
        self.assertFalse(set(groups[tr]) & set(groups[cal]))
        self.assertFalse(set(groups[tr]) & set(groups[te]))
        self.assertFalse(set(groups[cal]) & set(groups[te]))

    def test_infeasible_components_rejected(self):
        rows=[]; labels=[]
        for component in range(15):
            for edge in range(3):
                rows.append((f'R{component}-{edge}',1000+edge,
                             f'A{component}',f'B{component}-{edge}',f'ID{component}'))
                labels.append(int(component==0))
        with self.assertRaisesRegex(ValueError,'infeasible'):
            split_indices('BANKING',rows,3179,np.array(labels))

    def test_split_local_degree(self):
        rows=[('1',100.,'a','b','x'),('2',200.,'a','c','y'),('3',300.,'z','b','z')]
        x=features('BANKING',rows,np.array([0]),np.array([0]))
        self.assertEqual(x[0,1:].tolist(),[1.,1.])
        self.assertEqual(features('BANKING',rows,np.array([0]),np.array([0,1,2]))[0,1:].tolist(),[2.,2.])

    def test_threshold_constraint(self):
        y=np.array([1,1,0,0]);p=np.array([.9,.8,.4,.1])
        t,ok=choose_threshold(y,p,.9)
        self.assertTrue(ok)
        self.assertGreaterEqual(t,.4)

    def test_prefitted_calibration_sklearn_compatibility(self):
        x=np.linspace(-3.,3.,40).reshape(-1,1)
        y=(x[:,0]>0).astype(int)
        model=new_model(3179)
        model.fit(x,y)
        for method in ("sigmoid","isotonic"):
            calibrated=calibrate_prefitted(model,x,y,method)
            proba=calibrated.predict_proba(x)[:,1]
            self.assertEqual(proba.shape,(40,))
            self.assertTrue(np.isfinite(proba).all())

    def test_missing_db_no_create(self):
        with tempfile.TemporaryDirectory() as td:
            path=Path(td)/'missing.db'
            with self.assertRaises(FileNotFoundError):run(path)
            self.assertFalse(path.exists())

if __name__=='__main__':unittest.main()
