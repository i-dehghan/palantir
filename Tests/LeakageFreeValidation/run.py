"""DIDEBAN 3.1.7.9: component-disjoint evaluation and held-out calibration.
Read-only SQLite; experimental synthetic diagnostics, never operational scoring.
"""
from __future__ import annotations
import argparse
import json
import sqlite3
from collections import Counter
from contextlib import closing
from pathlib import Path
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
try:
    from sklearn.frozen import FrozenEstimator
except ImportError:
    FrozenEstimator = None  # scikit-learn older than 1.6
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, brier_score_loss, confusion_matrix,
                             f1_score, precision_score, recall_score, roc_auc_score)
from sklearn.model_selection import GroupShuffleSplit, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

DOMAINS = ('CUSTOMS', 'BANKING', 'TELECOM')

class DSU:
    def __init__(self): self.p={}; self.sz={}
    def find(self,x):
        if x not in self.p:self.p[x]=x;self.sz[x]=1
        while self.p[x]!=x:
            self.p[x]=self.p[self.p[x]];x=self.p[x]
        return x
    def union(self,a,b):
        a,b=self.find(a),self.find(b)
        if a!=b:
            if self.sz[a]<self.sz[b]:a,b=b,a
            self.p[b]=a;self.sz[a]+=self.sz[b]

def load(db_path):
    if not db_path.is_file():raise FileNotFoundError(db_path)
    with closing(sqlite3.connect(db_path.resolve().as_uri()+'?mode=ro',uri=True)) as db:
        truth={(d,str(r)):s for d,r,s in db.execute('SELECT Domain,RecordId,Scenario FROM SyntheticGroundTruth')}
        queries={
          'CUSTOMS':'''SELECT o.order_reg_number,o.total_usd,d.declared_value_usd,o.hs_code,d.declared_hs_code,o.importer_national_id FROM ntsw_orders o JOIN epl_declarations d ON o.order_reg_number=d.order_reg_number ORDER BY o.order_reg_number''',
          'BANKING':'SELECT transaction_rrn,amount_irr,source_account,dest_account,customer_national_id FROM bank_transactions ORDER BY transaction_rrn',
          'TELECOM':'SELECT call_id,duration_seconds,caller_msisdn,receiver_msisdn,caller_national_id FROM telecom_cdrs ORDER BY call_id'}
        out={}
        for domain,q in queries.items():
            rows=db.execute(q).fetchall()
            if not rows:raise ValueError('Empty domain '+domain)
            y=[]
            for r in rows:
                scenario=truth.get((domain,str(r[0])))
                if scenario not in ('normal','moderate','high','network'):
                    raise ValueError(f'Missing label {domain} {r[0]}')
                y.append(int(scenario in ('high','network')))
            out[domain]=(rows,np.asarray(y,dtype=int))
    return out

def split_indices(domain,rows,seed,y=None):
    n=len(rows)
    if domain=='CUSTOMS':
        groups=np.array([str(r[5]) for r in rows])
    else:
        dsu=DSU()
        for r in rows:dsu.union(str(r[2]),str(r[3]))
        groups=np.array([dsu.find(str(r[2])) for r in rows])
    if len(set(groups))<3:raise ValueError(f'{domain}: fewer than 3 independent groups/components')
    if y is None:
        # Preserve existing public helper API for structural tests.
        first,te=next(GroupShuffleSplit(n_splits=1,test_size=.2,random_state=seed).split(np.zeros(n),groups=groups))
        second,cal_relative=next(GroupShuffleSplit(n_splits=1,test_size=.25,random_state=seed+1).split(np.zeros(len(first)),groups=groups[first]))
        tr,cal=first[second],first[cal_relative]
    else:
        # Component-aware, label-feasible split. No graph component is split.
        # Split selection uses labels, but not model predictions or final test metrics.
        y=np.asarray(y,dtype=int)
        if len(y)!=n or set(np.unique(y))!={0,1}:
            raise ValueError(f'{domain}: expected binary labels matching rows')
        unique, inverse=np.unique(groups,return_inverse=True)
        group_counts=np.bincount(inverse,minlength=len(unique))
        pos_counts=np.bincount(inverse,weights=y,minlength=len(unique))
        neg_counts=group_counts-pos_counts
        pos_components=int(np.count_nonzero(pos_counts))
        neg_components=int(np.count_nonzero(neg_counts))
        if pos_components<3 or neg_components<3:
            raise ValueError(
                f'{domain}: component-disjoint train/calibration/test is infeasible: '
                f'positiveComponents={pos_components}, negativeComponents={neg_components}; '
                'each split requires both classes. Do not fall back to a leaky row split.')
        rng=np.random.default_rng(seed)
        best=None
        # Search among component allocations; minimize row/class proportion drift.
        # This is deliberately deterministic for a fixed seed.
        for attempt in range(2500):
            order=rng.permutation(len(unique))
            # Stratify by component's dominant class, preserving component integrity.
            pos_ids=order[pos_counts[order]>=neg_counts[order]]
            neg_ids=order[pos_counts[order]<neg_counts[order]]
            assignment=np.empty(len(unique),dtype=np.int8)
            for ids in (pos_ids,neg_ids):
                if not len(ids):continue
                # Distribute components to target fractions by *row counts*.
                targets=np.array([.6,.2,.2])*group_counts[ids].sum()
                sizes=np.zeros(3)
                for j in ids:
                    deficits=(targets-sizes)/np.maximum(targets,1)
                    target=int(np.argmax(deficits))
                    assignment[j]=target
                    sizes[target]+=group_counts[j]
            split_ids=[np.flatnonzero(assignment[inverse]==k) for k in range(3)]
            if any(len(ix)<20 or len(np.unique(y[ix]))!=2 for ix in split_ids):
                continue
            fractions=np.array([len(ix)/n for ix in split_ids])
            rates=np.array([y[ix].mean() for ix in split_ids])
            loss=float(np.sum((fractions-np.array([.6,.2,.2]))**2)
                       +np.sum((rates-y.mean())**2))
            if best is None or loss<best[0]:
                best=(loss,split_ids)
            if loss<.001:break
        if best is None:
            raise ValueError(
                f'{domain}: no feasible component-disjoint split found after 2500 '
                f'deterministic allocations (positiveComponents={pos_components}, '
                f'negativeComponents={neg_components}). A large mixed-class component '
                'may dominate; use a new synthetic fixture or report infeasibility, '
                'not row-level splitting.')
        tr,cal,te=best[1]
    assert not (set(groups[tr])&set(groups[cal]) or set(groups[tr])&set(groups[te]) or set(groups[cal])&set(groups[te]))
    return tr,cal,te,groups

def features(domain,rows,idx,reference_idx):
    """Graph degrees are built ONLY from the designated split's rows.
    This is an inductive component-disjoint protocol, not transductive scoring.
    """
    if domain=='CUSTOMS':
        return np.asarray([[(float(rows[i][1])-float(rows[i][2]))/max(abs(float(rows[i][1])),1.),
                            float(rows[i][3]!=rows[i][4])] for i in idx],dtype=float)
    left=Counter(str(rows[i][2]) for i in reference_idx)
    right=Counter(str(rows[i][3]) for i in reference_idx)
    return np.asarray([[float(np.log1p(max(float(rows[i][1]),0))),
                        float(left[str(rows[i][2])]),float(right[str(rows[i][3])])]
                       for i in idx],dtype=float)

def calibrate_prefitted(model, xcal, ycal, method):
    """Calibrate an already-fitted estimator, supporting sklearn 1.5 and 1.6+."""
    if FrozenEstimator is not None:
        calibrator = CalibratedClassifierCV(estimator=FrozenEstimator(model), method=method)
    else:
        calibrator = CalibratedClassifierCV(estimator=model, method=method, cv="prefit")
    calibrator.fit(xcal, ycal)
    return calibrator

def new_model(seed):
    return make_pipeline(StandardScaler(),LogisticRegression(max_iter=2000,random_state=seed))

def choose_threshold(y,p,min_precision=.8):
    """Choose highest recall subject to minimum calibration precision.
    If no threshold satisfies constraint with positive predictions, return 1.0
    and explicitly flag infeasibility.
    """
    candidates=np.unique(np.r_[0.,p,1.])
    best=None
    for t in candidates:
        pred=p>=t
        if not pred.any():continue
        prec=precision_score(y,pred,zero_division=0)
        if prec<min_precision:continue
        recall=recall_score(y,pred,zero_division=0)
        candidate=(recall,prec,float(t))
        if best is None or candidate[:2]>best[:2]:best=candidate
    if best is None:return 1.0,False
    return best[2],True

def scores(y,p,t):
    pred=p>=t
    tn,fp,fn,tp=confusion_matrix(y,pred,labels=[0,1]).ravel()
    return {'rocAuc':round(float(roc_auc_score(y,p)),6),
            'prAuc':round(float(average_precision_score(y,p)),6),
            'brier':round(float(brier_score_loss(y,p)),6),
            'precision':round(float(precision_score(y,pred,zero_division=0)),6),
            'recall':round(float(recall_score(y,pred,zero_division=0)),6),
            'f1':round(float(f1_score(y,pred,zero_division=0)),6),
            'confusionMatrix':{'TN':int(tn),'FP':int(fp),'FN':int(fn),'TP':int(tp)}}

def run(db_path,seed=3179,min_precision=.8):
    if not 0<min_precision<=1:raise ValueError('min_precision must be in (0,1]')
    result={'phase':'3.1.7.9','status':'EXPERIMENTAL_LEAKAGE_FREE_SYNTHETIC_EVALUATION',
            'readOnly':True,'seed':seed,'minimumCalibrationPrecision':min_precision,'domains':{},
            'limitations':['Only synthetic labels and synthetic data were evaluated.',
              'Split-specific graph degrees may not correspond to online production feature availability.',
              'Calibration method selection is based on calibration data, never the test set.',
              'Graph component sizes may cause severely imbalanced splits; invalid splits are rejected.',
              'No real-world performance claim and no operational model or database changes.']}
    for domain,(rows,y) in load(db_path).items():
        tr,cal,te,groups=split_indices(domain,rows,seed,y)
        for name,ids in [('train',tr),('calibration',cal),('test',te)]:
            if len(ids)<20 or len(set(y[ids]))!=2:
                raise ValueError(f'{domain}: {name} has insufficient rows or one label class; change seed or split strategy')
        xtr=features(domain,rows,tr,tr)
        xcal=features(domain,rows,cal,cal)
        xte=features(domain,rows,te,te)
        model=new_model(seed);model.fit(xtr,y[tr])
        base_cal=model.predict_proba(xcal)[:,1]
        candidates={'uncalibrated':(model,base_cal)}
        for method in ('sigmoid','isotonic'):
            calibrated=calibrate_prefitted(model,xcal,y[cal],method)
            candidates[method]=(calibrated,calibrated.predict_proba(xcal)[:,1])
        # Calibration set is used for both fitting calibration and method selection:
        # optimistic selection; test remains untouched. Explicitly report this caveat.
        selected=min(candidates,key=lambda k:brier_score_loss(y[cal],candidates[k][1]))
        chosen,pcal=candidates[selected]
        threshold,feasible=choose_threshold(y[cal],pcal,min_precision)
        pte=chosen.predict_proba(xte)[:,1]
        if domain!='CUSTOMS':
            endpoints=lambda ids:{str(rows[i][j]) for i in ids for j in (2,3)}
            overlap=len(endpoints(tr)&endpoints(te))+len(endpoints(tr)&endpoints(cal))+len(endpoints(cal)&endpoints(te))
        else:overlap=None
        result['domains'][domain]={
          'rows':len(rows),'trainRows':len(tr),'calibrationRows':len(cal),'testRows':len(te),
          'trainPositiveRate':round(float(y[tr].mean()),6),
          'calibrationPositiveRate':round(float(y[cal].mean()),6),
          'testPositiveRate':round(float(y[te].mean()),6),
          'groupOverlap':0,'graphEndpointOverlap':overlap,
          'componentOrEntityGroups':len(set(groups)),
          'calibrationBrierByMethod':{k:round(float(brier_score_loss(y[cal],v[1])),6) for k,v in candidates.items()},
          'selectedCalibration':selected,'selectedThreshold':round(threshold,8),
          'calibrationPrecisionConstraintFeasible':feasible,
          'testAtSelectedThreshold':scores(y[te],pte,threshold),
          'testAtDefaultThreshold':scores(y[te],pte,.5),
          'warning':'Calibration method chosen on the same calibration split used to fit calibrators; final test is independent.'}
    return result

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--db',required=True,type=Path)
    p.add_argument('--out',required=True,type=Path)
    p.add_argument('--seed',type=int,default=3179)
    p.add_argument('--min-precision',type=float,default=.8)
    a=p.parse_args()
    if a.out.resolve()==a.db.resolve() or a.out.exists() or a.out.suffix.lower()!='.json':
        p.error('Output must be a new .json path distinct from input database')
    result=run(a.db,a.seed,a.min_precision)
    a.out.parent.mkdir(parents=True,exist_ok=True)
    with a.out.open('x',encoding='utf-8') as f:json.dump(result,f,indent=2,ensure_ascii=False)
    for domain,d in result['domains'].items():
        print(domain,'calibration=',d['selectedCalibration'],'threshold=',d['selectedThreshold'],
              'F1=',d['testAtSelectedThreshold']['f1'],'graphOverlap=',d['graphEndpointOverlap'])
    print('Report:',a.out)
if __name__=='__main__':main()
