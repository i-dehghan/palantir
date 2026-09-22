import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DossierNode {
  id: string;
  type: number;
  displayLabel: string;
  riskScore: number;
  properties: Record<string, any>;
}

export interface DossierEdge {
  sourceId: string;
  targetId: string;
  predicate: string;
  weight: number;
  timestamp?: string;
}

export interface MultiHopDossierGraph {
  rootEntityId: string;
  exploredDepth: number;
  nodes: DossierNode[];
  edges: DossierEdge[];
}
export interface PathfindingResult {
  sourceId: string;
  targetId: string;
  pathExists: boolean;
  pathNodeIds: string[];
  pathEdges: DossierEdge[];
  narrativeSummary: string;
}
export interface ThreatPattern {
  patternType: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  involvedNodeIds: string[];
  description: string;
  estimatedVolumeIrr: number;
}
export interface EvidenceItem {
  category: string;
  title: string;
  referenceNumber: string;
  description: string;
  timestamp: string;
  financialValueIrr: number;
}

export interface DossierReport {
  caseReference: string;
  generatedAtShamsi: string;
  targetNationalId: string;
  globalRiskScore: number;
  classificationLevel: string;
  executiveSummary: string;
  detectedViolations: string[];
  evidences: EvidenceItem[];
  totalEntitiesLinked: number;
  totalTransactionsFlagged: number;
}

export interface MultiEntityInquiryPayload {
  identifiers: string[];
  relationTypes: ('BANKING' | 'TELECOM' | 'CUSTOMS')[];
  maxDepth?: number;
}

@Injectable({ providedIn: 'root' })
export class DossierService {
  private http = inject(HttpClient);
  private baseUrl = 'http://localhost:5191/api/audit';

  getDossier(nationalId: string, depth: number = 2): Observable<MultiHopDossierGraph> {
    return this.http.get<MultiHopDossierGraph>(`${this.baseUrl}/ontology/dossier/${nationalId}?depth=${depth}`);
  }

  expandNode(nodeId: string): Observable<MultiHopDossierGraph> {
  return this.http.get<MultiHopDossierGraph>(`${this.baseUrl}/ontology/expand/${encodeURIComponent(nodeId)}`);
}
getDossierReport(nationalId: string): Observable<DossierReport> {
  return this.http.get<DossierReport>(`${this.baseUrl}/ontology/dossier-report/${encodeURIComponent(nationalId)}`);
}
// داخل کلاس DossierService:
findPath(sourceId: string, targetId: string): Observable<PathfindingResult> {
  return this.http.get<PathfindingResult>(
    `${this.baseUrl}/ontology/pathfind?sourceId=${encodeURIComponent(sourceId)}&targetId=${encodeURIComponent(targetId)}`
  );
}


detectThreatPatterns(nationalId: string): Observable<ThreatPattern[]> {
  return this.http.get<ThreatPattern[]>(`${this.baseUrl}/ontology/patterns/${encodeURIComponent(nationalId)}`);
}

// واکشی ارتباطات چندمرحله‌ای فرد بر اساس کد ملی یا شماره همراه
  getMultiHopEntityLinks(identifier: string, depth: number = 2): Observable<MultiHopDossierGraph> {
    return this.http.get<MultiHopDossierGraph>(
      `${this.baseUrl}/ontology/identity-links/${encodeURIComponent(identifier)}?depth=${depth}`
    );
  }

  queryMultiEntityLinks(payload: MultiEntityInquiryPayload): Observable<MultiHopDossierGraph> {
  return this.http.post<MultiHopDossierGraph>(
    `${this.baseUrl}/ontology/multi-entity-inquiry`,
    payload
  );
}
}