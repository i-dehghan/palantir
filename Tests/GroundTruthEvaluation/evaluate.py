"""Read-only evaluation of DIDEBAN backend discrepancy logs against synthetic labels."""
from __future__ import annotations

import argparse
import json
import sqlite3
from collections import Counter, defaultdict
from contextlib import closing
from pathlib import Path

DOMAINS = ("CUSTOMS", "BANKING", "TELECOM")
POSITIVE = {"high", "network"}

def evaluate(path: Path) -> dict:
    if not path.is_file():
        raise FileNotFoundError(path)
    with closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)) as db:
        db.row_factory = sqlite3.Row
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not {"SyntheticGroundTruth", "DiscrepancyLogs"} <= tables:
            raise ValueError("SyntheticGroundTruth and DiscrepancyLogs are required")
        truth = defaultdict(dict)
        for row in db.execute("SELECT Domain, RecordId, Scenario FROM SyntheticGroundTruth"):
            domain, rid, scenario = row
            if domain in DOMAINS:
                if scenario not in {"normal", "moderate", "high", "network"}:
                    raise ValueError("Unexpected scenario: " + str(scenario))
                if rid in truth[domain]:
                    raise ValueError(f"Duplicate ground-truth key: {domain}/{rid}")
                truth[domain][rid] = scenario

        logs = defaultdict(list)
        for row in db.execute('SELECT DomainType, OrderRegNumber, RiskScore FROM "DiscrepancyLogs"'):
            domain, identifier, score = row
            if domain not in DOMAINS:
                continue
            if domain == "BANKING":
                key = identifier.removeprefix("BANK-TX-") if identifier.startswith("BANK-TX-") else None
            elif domain == "TELECOM":
                key = identifier.removeprefix("TEL-CALL-") if identifier.startswith("TEL-CALL-") else None
            else:
                key = identifier
            logs[domain].append((key, score))

        results = {}
        for domain in DOMAINS:
            labels = truth[domain]
            matched = {}
            unknown = 0
            duplicate = 0
            for key, score in logs[domain]:
                if key not in labels:
                    unknown += 1
                elif key in matched:
                    duplicate += 1
                    matched[key] = max(matched[key], score)
                else:
                    matched[key] = score

            # "Detected" means a log was emitted, not score >= a threshold.
            tp = sum(labels[key] in POSITIVE for key in matched)
            fp = len(matched) - tp
            positives = sum(s in POSITIVE for s in labels.values())
            fn = positives - tp
            tn = len(labels) - positives - fp
            precision = tp / (tp + fp) if tp + fp else None
            recall = tp / positives if positives else None
            f1 = (2 * precision * recall / (precision + recall)
                  if precision is not None and recall is not None and precision + recall else None)
            scenarios = {}
            for scenario in ("normal", "moderate", "high", "network"):
                total = sum(s == scenario for s in labels.values())
                hits = sum(labels[k] == scenario for k in matched)
                scores = [score for k, score in matched.items() if labels[k] == scenario]
                scenarios[scenario] = {
                    "total": total, "detected": hits,
                    "detectionRate": round(hits / total, 6) if total else None,
                    "meanRiskScoreAmongDetected": round(sum(scores) / len(scores), 4) if scores else None
                }
            results[domain] = {
                "groundTruthRows": len(labels), "rawLogRows": len(logs[domain]),
                "matchedUniqueLogRows": len(matched), "unknownLogRows": unknown,
                "duplicateLogRows": duplicate,
                "confusionMatrix": {"TP": tp, "FP": fp, "FN": fn, "TN": tn},
                "precision": round(precision, 6) if precision is not None else None,
                "recall": round(recall, 6) if recall is not None else None,
                "f1": round(f1, 6) if f1 is not None else None,
                "scenarioBreakdown": scenarios,
                "riskScoreRankingStatus": "NOT_EVALUATED_FULL_POPULATION",
            }
        return {
            "phase": "3.1.7.6",
            "readOnly": True,
            "metricsType": "BACKEND_LOG_DETECTION_VS_SYNTHETIC_GROUND_TRUTH",
            "positiveScenarios": sorted(POSITIVE),
            "negativeScenarios": ["normal", "moderate"],
            "interpretation": "Missing discrepancy log is treated as non-detection, not a risk score of zero.",
            "limitations": [
                "Backend LIMIT 700 without ORDER BY makes evaluation sample-dependent.",
                "Precision/recall describe synthetic scenario retrieval, not crime detection.",
                "Ranking AUC cannot be calculated on full population without per-record backend scores.",
                "Graph propagation is not evaluated.",
            ],
            "domains": results
        }

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.out.resolve() == args.db.resolve() or args.out.exists():
        parser.error("Report path must be new and different from database")
    result = evaluate(args.db)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    for domain, metrics in result["domains"].items():
        print(f'{domain}: matched={metrics["matchedUniqueLogRows"]} unknown={metrics["unknownLogRows"]} '
              f'precision={metrics["precision"]} recall={metrics["recall"]}')
    print(f"Report: {args.out}")

if __name__ == "__main__":
    main()
