"""DIDEBAN 3.1.7.11: read-only temporal synthetic feature benchmark.

Chronological four-way holdout; causal, past-only telecom aggregates.
NOT component-disjoint; graph overlaps are reported. No operational changes.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict, deque
from contextlib import closing
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sqlite3
import numpy as np
from sklearn.metrics import brier_score_loss

ROOT = Path(__file__).resolve().parents[1]
CORE_PATH = ROOT / 'LeakageFreeValidation' / 'run.py'
if not CORE_PATH.is_file():
    raise FileNotFoundError(f'Required existing runner: {CORE_PATH}')
spec = importlib.util.spec_from_file_location('dideban_temporal_core', CORE_PATH)
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)


def parse_timestamp(value):
    if value is None: raise ValueError('NULL timestamp')
    s = str(value).strip().replace('Z', '+00:00')
    try:
        dt = datetime.fromisoformat(s)
    except ValueError as exc:
        raise ValueError(f'Invalid ISO timestamp: {value!r}') from exc
    if dt.tzinfo is not None: dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def load(db_path):
    path = Path(db_path)
    if not path.is_file(): raise FileNotFoundError(path)
    if path.name.lower() == 'dideban_dev.db':
        raise ValueError('Operational DB is not permitted for this synthetic benchmark')
    with closing(sqlite3.connect(path.resolve().as_uri()+'?mode=ro', uri=True)) as db:
        records = db.execute('''SELECT c.call_id,c.duration_seconds,c.caller_msisdn,
            c.receiver_msisdn,c.call_date,g.Scenario FROM telecom_cdrs c
            JOIN SyntheticGroundTruth g ON g.Domain='TELECOM'
              AND g.RecordId=CAST(c.call_id AS TEXT)
            ORDER BY c.call_date,c.call_id''').fetchall()
        count = db.execute('SELECT COUNT(*) FROM telecom_cdrs').fetchone()[0]
    if len(records) != count or not records:
        raise ValueError('TELECOM synthetic ground truth incomplete')
    if any(r[5] not in ('normal','moderate','high','network') for r in records):
        raise ValueError('Invalid synthetic scenario')
    return records


def chronological_splits(rows):
    """Four time-disjoint splits by timestamp blocks; fail rather than split ties."""
    times = [parse_timestamp(r[4]) for r in rows]
    order = sorted(range(len(rows)), key=lambda i: (times[i], str(rows[i][0])))
    if len(order) < 100: raise ValueError('Need >=100 rows')
    blocks = []
    for i in order:
        if not blocks or times[i] != times[blocks[-1][0]]: blocks.append([])
        blocks[-1].append(i)
    if len(blocks) < 4: raise ValueError('Need >=4 distinct timestamps')
    targets = [.6, .7, .8]
    cumulative = np.cumsum([len(b) for b in blocks])
    cut = [int(np.argmin(np.abs(cumulative[:-1] - len(rows)*t))) + 1 for t in targets]
    if not (0 < cut[0] < cut[1] < cut[2] < len(blocks)):
        raise ValueError('Timestamp groups cannot support four chronological partitions')
    ranges = [(0,cut[0]),(cut[0],cut[1]),(cut[1],cut[2]),(cut[2],len(blocks))]
    splits = {name: np.asarray([i for b in blocks[a:z] for i in b],dtype=int)
              for name,(a,z) in zip(('train','calibratorFit','policySelection','test'),ranges)}
    for name, idx in splits.items():
        if len(idx) < 20: raise ValueError(f'{name}: fewer than 20 records')
    for a,b in zip(list(splits)[:-1],list(splits)[1:]):
        if max(times[i] for i in splits[a]) >= min(times[i] for i in splits[b]):
            raise AssertionError('Temporal leakage')
    return splits, times


def causal_features(rows, windows_days=(1,7,30)):
    """Compute all features using STRICTLY earlier timestamps, no label use.

    History is updated after scoring all records sharing a timestamp.
    Window counts use (t-window, t); same-timestamp records cannot see each other.
    """
    times = [parse_timestamp(r[4]) for r in rows]
    order = sorted(range(len(rows)), key=lambda i:(times[i],str(rows[i][0])))
    n = len(rows)
    x = np.zeros((n, 2 + 3*len(windows_days) + 2), dtype=float)
    caller_hist = defaultdict(deque)
    pair_hist = defaultdict(deque)
    caller_peers = defaultdict(lambda: defaultdict(int))
    caller_durations = defaultdict(deque)
    max_window = max(windows_days)*86400
    p=0
    while p<n:
        q=p+1
        while q<n and times[order[q]]==times[order[p]]:q+=1
        now = times[order[p]].timestamp()  # timestamp ordering only; naive datetime interpreted consistently in same environment
        for pos in range(p,q):
            i=order[pos];r=rows[i];caller=str(r[2]);receiver=str(r[3]);pair=(caller,receiver)
            dur=max(float(r[1]),0.0)
            hist=caller_hist[caller]
            while hist and now-hist[0][0]>max_window:
                old_time,old_peer=hist.popleft()
                caller_peers[caller][old_peer]-=1
                if not caller_peers[caller][old_peer]:del caller_peers[caller][old_peer]
            ph=pair_hist[pair]
            while ph and now-ph[0]>max_window:ph.popleft()
            dh=caller_durations[caller]
            while dh and now-dh[0][0]>max_window:dh.popleft()
            x[i,0]=np.log1p(dur)
            x[i,1]=np.log1p(len(hist))
            for wi,days in enumerate(windows_days):
                threshold=now-days*86400
                x[i,2+wi]=sum(t>threshold for t,_ in hist)
                x[i,2+len(windows_days)+wi]=sum(t>threshold for t in ph)
                x[i,2+2*len(windows_days)+wi]=len({peer for t,peer in hist if t>threshold})
            x[i,-2]=np.log1p(np.mean([d for _,d in dh])) if dh else 0.0
            x[i,-1]=np.log1p(len(caller_peers[caller]))
        # Mutate history only after the entire timestamp batch has been scored.
        for pos in range(p,q):
            i=order[pos];r=rows[i];caller=str(r[2]);receiver=str(r[3]);pair=(caller,receiver)
            dur=max(float(r[1]),0.0)
            caller_hist[caller].append((now,receiver))
            caller_peers[caller][receiver]+=1
            pair_hist[pair].append(now)
            caller_durations[caller].append((now,dur))
        p=q
    names=['log_duration','log_caller_count_30d']
    names += [f'caller_calls_{w}d' for w in windows_days]
    names += [f'pair_calls_{w}d' for w in windows_days]
    names += [f'distinct_peers_{w}d' for w in windows_days]
    names += ['log_mean_prior_duration_30d','log_distinct_peers_30d']
    return x,names


def evaluate(x,y,splits,cols,seed,min_precision):
    tr,cal,sel,te=(splits[k] for k in ('train','calibratorFit','policySelection','test'))
    model=core.new_model(seed)
    model.fit(x[tr][:,cols],y[tr])
    candidates={'uncalibrated':model}
    for method in ('sigmoid','isotonic'):
        candidates[method]=core.calibrate_prefitted(model,x[cal][:,cols],y[cal],method)
    brier={key:float(brier_score_loss(y[sel],est.predict_proba(x[sel][:,cols])[:,1]))
           for key,est in candidates.items()}
    selected=min(brier,key=lambda key:(brier[key],{'uncalibrated':0,'sigmoid':1,'isotonic':2}[key]))
    threshold,feasible=core.choose_threshold(y[sel],candidates[selected].predict_proba(x[sel][:,cols])[:,1],min_precision)
    prob=candidates[selected].predict_proba(x[te][:,cols])[:,1]
    return {'selectedCalibration':selected,'policySelectionBrierByMethod':{k:round(v,6) for k,v in brier.items()},
            'selectedThreshold':round(float(threshold),8),'policyPrecisionConstraintFeasible':bool(feasible),
            'testAtSelectedThreshold':core.scores(y[te],prob,threshold),
            'testAtDefaultThreshold':core.scores(y[te],prob,.5)}


def run(db_path,seed=31711,min_precision=.8):
    if not 0<min_precision<=1:raise ValueError('min_precision must be (0,1]')
    rows=load(db_path)
    splits,times=chronological_splits(rows)
    y=np.asarray([int(r[5] in ('high','network')) for r in rows],dtype=int)
    for name,idx in splits.items():
        if set(y[idx])!={0,1}:
            raise ValueError(f'{name}: missing a label class under chronological holdout; no shuffled fallback')
    x,names=causal_features(rows)
    baseline=evaluate(x,y,splits,[0],seed,min_precision)
    engineered=evaluate(x,y,splits,list(range(x.shape[1])),seed,min_precision)
    # Diagnostics only: never choose between baseline and engineered based on test metrics.
    endpoints={k:{str(rows[i][j]) for i in ix for j in (2,3)} for k,ix in splits.items()}
    overlaps={f'{a}-{b}':len(endpoints[a]&endpoints[b]) for a in splits for b in splits if list(splits).index(a)<list(splits).index(b)}
    return {'phase':'3.1.7.11','status':'EXPERIMENTAL_SYNTHETIC_TEMPORAL_HOLDOUT',
            'readOnly':True,'seed':seed,'minimumPolicyPrecision':min_precision,
            'splitPolicy':'chronological timestamp-block, no shared timestamp across splits',
            'featurePolicy':'strictly prior event timestamps, same-time batch exclusion',
            'rows':len(rows),'splits':{k:{'rows':len(ix),'positives':int(y[ix].sum()),
                        'start':min(times[i] for i in ix).isoformat(),
                        'end':max(times[i] for i in ix).isoformat()} for k,ix in splits.items()},
            'graphEndpointOverlapBySplitPair':overlaps,
            'graphComponentDisjoint':all(v==0 for v in overlaps.values()),
            'features':names,'baselineDurationOnly':baseline,'engineeredTemporal':engineered,
            'limitations':['Only synthetic data and synthetic labels.',
              'Temporal split is NOT guaranteed graph-component-disjoint.',
              'GraphFixtureV2 topology was generated using synthetic scenarios.',
              'History-based features use past events from all chronological partitions; this simulates a sequential stream, not isolated components.',
              'Baseline vs engineered test metrics are diagnostic, not feature-selection criteria.',
              'No independent OOD fixture and no real-world performance claim.',
              'No operational database or service changed.']}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db',required=True,type=Path)
    parser.add_argument('--out',required=True,type=Path)
    parser.add_argument('--seed',type=int,default=31711)
    parser.add_argument('--min-precision',type=float,default=.8)
    a=parser.parse_args()
    if a.out.suffix.lower()!='.json' or a.out.exists() or a.out.resolve()==a.db.resolve():
        parser.error('Output must be a new, non-existing JSON file')
    result=run(a.db,a.seed,a.min_precision)
    a.out.parent.mkdir(parents=True,exist_ok=True)
    with a.out.open('x',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,indent=2)
    print('TELECOM duration-only F1:',result['baselineDurationOnly']['testAtSelectedThreshold']['f1'])
    print('TELECOM temporal F1:',result['engineeredTemporal']['testAtSelectedThreshold']['f1'])
    print('Graph component disjoint:',result['graphComponentDisjoint'])
    print('Report:',a.out)
if __name__=='__main__':main()
