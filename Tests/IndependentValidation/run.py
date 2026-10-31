"""DIDEBAN 3.1.7.8: independent synthetic OOD + graph overlap diagnostics.
No write access to SQLite. No operational model modifications.
"""
from __future__ import annotations
import argparse
import json
import sqlite3
import sys
from collections import Counter
from contextlib import closing
from pathlib import Path
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

DOMAINS = ('CUSTOMS', 'BANKING', 'TELECOM')
SCENARIOS = ('normal', 'moderate', 'high', 'network')

def metrics(y, p):
    z = p >= .5
    return {'rocAuc': round(float(roc_auc_score(y,p)),6),
            'prAuc': round(float(average_precision_score(y,p)),6),
            'brier': round(float(brier_score_loss(y,p)),6),
            'precision': round(float(precision_score(y,z,zero_division=0)),6),
            'recall': round(float(recall_score(y,z,zero_division=0)),6),
            'f1': round(float(f1_score(y,z,zero_division=0)),6)}

def make_ood(domain, n, seed):
    """Generate an independently seeded, shifted synthetic *feature* population.

    Labels are assigned by construction, never inferred from original FeaturesJson.
    Shifted ranges deliberately overlap across scenarios, unlike training generator.
    """
    rng=np.random.default_rng(seed)
    labels=np.arange(n)%4
    rng.shuffle(labels)
    y=np.isin(labels,[2,3]).astype(int)
    if domain=='CUSTOMS':
        # Overlap both low/high value gaps, introduce independent HS mismatch noise.
        means=np.array([.07,.13,.24,.20])
        gaps=np.clip(rng.normal(means[labels], .09),0,.65)
        hs=(rng.random(n)<np.array([.08,.16,.28,.58])[labels]).astype(float)
        x=np.column_stack([gaps,hs])
    elif domain=='BANKING':
        # log-amount distributions shifted and overlapping; degrees independent.
        means=np.array([12.5,14.2,15.5,14.8])
        amount=rng.normal(means[labels],1.8)
        src=rng.poisson(np.array([1.4,2.0,4.5,6.0])[labels])+1
        dst=rng.poisson(np.array([1.5,2.2,4.0,5.8])[labels])+1
        x=np.column_stack([amount,src,dst]).astype(float)
    elif domain=='TELECOM':
        means=np.array([5.1,6.0,7.0,4.9])
        duration=rng.normal(means[labels],1.3)
        caller=rng.poisson(np.array([1.5,2.2,4.2,6.0])[labels])+1
        receiver=rng.poisson(np.array([1.4,2.1,3.0,5.2])[labels])+1
        x=np.column_stack([duration,caller,receiver]).astype(float)
    else:
        raise ValueError(domain)
    return x,y

def graph_diagnostics(db_path, seed):
    """Report connected-component sizes and endpoint overlap under national-ID split.
    No assertion that group holdout equals graph component holdout.
    """
    results={}
    with closing(sqlite3.connect(db_path.resolve().as_uri()+'?mode=ro',uri=True)) as db:
        queries={
            'BANKING': 'SELECT customer_national_id,source_account,dest_account FROM bank_transactions ORDER BY transaction_rrn',
            'TELECOM': 'SELECT caller_national_id,caller_msisdn,receiver_msisdn FROM telecom_cdrs ORDER BY call_id'
        }
        for domain,sql in queries.items():
            rows=db.execute(sql).fetchall()
            groups=np.array([r[0] for r in rows])
            if len(set(groups))<5: raise ValueError('Insufficient groups')
            train,test=next(GroupShuffleSplit(test_size=.3,random_state=seed).split(np.zeros(len(rows)),groups=groups))
            tr={v for i in train for v in rows[i][1:]}
            te={v for i in test for v in rows[i][1:]}
            # Union-find on graph endpoints
            parent={}
            size={}
            def find(a):
                parent.setdefault(a,a);size.setdefault(a,1)
                while parent[a]!=a:
                    parent[a]=parent[parent[a]]
                    a=parent[a]
                return a
            def union(a,b):
                a,b=find(a),find(b)
                if a!=b:
                    if size[a]<size[b]:a,b=b,a
                    parent[b]=a;size[a]+=size[b]
            for _,a,b in rows:union(a,b)
            component_sizes=Counter(find(a) for a in parent)
            largest=max(component_sizes.values(),default=0)
            results[domain]={
                'rows':len(rows),'trainRows':len(train),'testRows':len(test),
                'nationalIdOverlap':len(set(groups[train])&set(groups[test])),
                'sharedGraphEndpoints':len(tr&te),
                'trainEndpoints':len(tr),'testEndpoints':len(te),
                'graphComponentCount':len(component_sizes),
                'largestComponentNodes':largest,
                'largestComponentFractionOfNodes':round(largest/max(len(parent),1),6),
                'componentHoldoutEvaluated':False,
                'note':'Endpoint overlap is diagnostic. Connected-component isolation is not implemented in this run.'
            }
    return results

def evaluate(db_path,seed=3178,ood_rows=4000):
    if not db_path.is_file():raise FileNotFoundError(db_path)
    if ood_rows<100 or ood_rows%4:raise ValueError('ood_rows must be >=100 and divisible by four')
    regression=Path(__file__).resolve().parents[1]/'RegressionBenchmark'
    if not (regression/'run.py').is_file():raise FileNotFoundError('Tests/RegressionBenchmark/run.py is required')
    sys.path.insert(0,str(regression))
    from run import load
    data=load(db_path)
    results={}
    for i,domain in enumerate(DOMAINS):
        x,y,names=data[domain]
        model=make_pipeline(StandardScaler(),LogisticRegression(max_iter=2000,random_state=seed))
        model.fit(x,y)
        xx,yy=make_ood(domain,ood_rows,seed+100*i)
        pp=model.predict_proba(xx)[:,1]
        results[domain]={
            'trainRows':len(y),'independentSyntheticRows':len(yy),
            'features':names,'oodMetrics':metrics(yy,pp),
            'scenarioBalance':{name:int((np.arange(ood_rows)%4==j).sum()) for j,name in enumerate(SCENARIOS)},
            'oodFeatureMeans':[round(float(v),4) for v in xx.mean(axis=0)],
            'evaluationType':'SYNTHETIC_SHIFTED_DISTRIBUTION_NOT_REAL_WORLD'
        }
    return {
        'phase':'3.1.7.8','status':'INDEPENDENT_SYNTHETIC_OOD_DIAGNOSTIC',
        'readOnly':True,'seed':seed,
        'trainingData':'original synthetic fixture, all labeled records',
        'oodData':'new RNG population with overlapping shifted feature distributions',
        'domains':results,'graphLeakageDiagnostics':graph_diagnostics(db_path,seed),
        'limitations':[
            'OOD labels are still assigned by a synthetic design, not observed outcomes.',
            'Graph degree features in training are transductive, computed from the full fixture.',
            'Graph connected-component holdout has NOT been performed.',
            'A model trained on all original records is used solely for independent synthetic OOD testing.',
            'No operational scoring model or database was changed.'
        ]}

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--db',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--seed',type=int,default=3178)
    p.add_argument('--ood-rows',type=int,default=4000)
    a=p.parse_args()
    if a.out.resolve()==a.db.resolve() or a.out.exists() or a.out.suffix.lower()!='.json':
        p.error('Output must be a new JSON path distinct from the database')
    result=evaluate(a.db,a.seed,a.ood_rows)
    a.out.parent.mkdir(parents=True,exist_ok=True)
    a.out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    for domain,item in result['domains'].items():
        print(domain,'OOD=',item['oodMetrics'])
    for domain,item in result['graphLeakageDiagnostics'].items():
        print(domain,'sharedGraphEndpoints=',item['sharedGraphEndpoints'],
              'components=',item['graphComponentCount'])
    print('Report:',a.out)

if __name__=='__main__':main()
