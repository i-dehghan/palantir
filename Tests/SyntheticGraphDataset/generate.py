#!/usr/bin/env python3
"""Deterministic, read-only DIDEBAN synthetic graph API fixtures."""
import argparse, json, pathlib, re, hashlib

SCENARIOS = {
 'isolated': (['A','B','C','D'], [], [8,32,61,91]),
 'chain': (['A','B','C','D','E'], [('A','B',1),('B','C',.8),('C','D',.65),('D','E',.5)], [92,14,25,12,6]),
 'star': (['H','A','B','C','D','E'], [('H',x,1) for x in 'ABCDE'], [18,85,10,42,67,5]),
 'communities': (['A','B','C','D','E','F'], [('A','B',1),('B','C',.9),('A','C',.7),('D','E',1),('E','F',.9),('D','F',.7),('C','D',.2)], [15,73,36,81,12,49]),
 'cycle': (['A','B','C','D'], [('A','B',1),('B','C',.8),('C','A',.6),('C','D',.4)], [80,10,30,5]),
 'weighted_bridge': (['A','B','C','D','E','F','G'], [('A','B',1),('B','C',.95),('C','D',.15),('D','E',1),('E','F',.9),('F','G',.85)], [5,22,68,13,94,28,8]),
}

def fixture(name, data):
    ids, links, risks = data
    nodes=[{'id':f'SYN-{name.upper()}-{key}', 'type':0, 'displayLabel':f'Synthetic {name} {key}', 'riskScore':risk, 'properties':{'synthetic':'true','scenario':name,'provenance':'synthetic_fixture'}} for key,risk in zip(ids,risks)]
    def full(key): return f'SYN-{name.upper()}-{key}'
    edges=[{'sourceId':full(a),'targetId':full(b),'predicate':'SYNTHETIC_RELATION','weight':w,'metadata':{'synthetic':'true'}} for a,b,w in links]
    return {'graph':{'rootEntityId':nodes[0]['id'],'exploredDepth':3,'nodes':nodes,'edges':edges},'maxHops':3,'decay':0.5,'influenceCap':25}

def validate(obj):
    g=obj['graph']; nodes=g['nodes']; edges=g['edges']; ids=[n['id'] for n in nodes]
    assert len(ids)==len(set(ids)) and all(n['id'].startswith('SYN-') for n in nodes)
    assert all(0<=n['riskScore']<=100 for n in nodes)
    assert all(e['sourceId'] in ids and e['targetId'] in ids and e['weight']>0 for e in edges)
    assert len(nodes)<=500 and len(edges)<=5000

def generate(out):
    out.mkdir(parents=True,exist_ok=True)
    manifest={'schema':'DIDEBAN GraphRiskAnalysisRequestDto','purpose':'development-only; not operational evidence','seed':'fixed-v1','scenarios':{}}
    for name,data in SCENARIOS.items():
        obj=fixture(name,data); validate(obj)
        raw=(json.dumps(obj,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode('utf-8')
        (out/(name+'.json')).write_bytes(raw)
        manifest['scenarios'][name]={'nodes':len(obj['graph']['nodes']),'edges':len(obj['graph']['edges']),'sha256':hashlib.sha256(raw).hexdigest(),'baselineRiskRange':[min(n['riskScore'] for n in obj['graph']['nodes']),max(n['riskScore'] for n in obj['graph']['nodes'])]}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    return manifest

if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--out',default='Tests/SyntheticGraphDataset/fixtures'); args=p.parse_args()
    m=generate(pathlib.Path(args.out)); print('PASS: generated',len(m['scenarios']),'deterministic synthetic scenarios')
