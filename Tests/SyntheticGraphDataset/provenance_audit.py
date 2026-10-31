#!/usr/bin/env python3
"""Read-only static inventory of literal risk assignments. Not a data-lineage proof."""
import argparse, json, pathlib, re
PATTERN=re.compile(r'\b(?:GlobalRiskScore|RiskScore|riskScore)\s*=\s*(\d+(?:\.\d+)?)\b')
def scan(root):
    findings=[]
    for path in sorted(root.rglob('*.cs')):
        if any(p in {'bin','obj','Migrations'} for p in path.parts): continue
        for n,line in enumerate(path.read_text(encoding='utf-8-sig',errors='replace').splitlines(),1):
            for m in PATTERN.finditer(line):
                findings.append({'file':str(path.relative_to(root)).replace('\\','/'),'line':n,'field':m.group(0).split('=')[0].strip(),'literal':float(m.group(1)),'snippet':line.strip()[:180],'classification':'literal_assignment_candidate','reviewRequired':True})
    return {'disclaimer':'Static source inventory only. A literal assignment does not establish DB provenance or actual runtime execution.','findings':findings}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',default='src/backend-dotnet/Dideban.Api');p.add_argument('--out',default='risk-provenance-candidates.json');a=p.parse_args()
    root=pathlib.Path(a.source)
    if not root.is_dir(): p.error('source directory not found: '+str(root))
    result=scan(root);pathlib.Path(a.out).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Found',len(result['findings']),'literal assignment candidates; manual review required.')
