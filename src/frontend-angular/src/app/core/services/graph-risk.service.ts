// DIDEBAN 3.1.6.4.1 — typed API adapter. The service does not mutate graph state.
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MultiHopDossierGraph } from './dossier.service';

export interface GraphRiskFactor {
  name: string;
  normalizedValue: number;
  weight: number;
  contribution: number;
}

export interface GraphRiskBaselineNode {
  nodeId: string;
  priorityScore: number;
  factors: GraphRiskFactor[];
}

export interface GraphRiskSourceContribution {
  sourceId: string;
  sourceScore: number;
  pathStrength: number;
  hops: number;
  path: string[];
  contribution: number;
}

export interface GraphRiskPropagationNode {
  nodeId: string;
  baseScore: number;
  networkInfluence: number;
  combinedIndex: number;
  sources: GraphRiskSourceContribution[];
}

export interface GraphRiskSettings {
  maxHops: number;
  decay: number;
  influenceCap: number;
}

export interface GraphRiskAnalysisRequest {
  graph: MultiHopDossierGraph;
  maxHops?: number;
  decay?: number;
  influenceCap?: number;
}

export interface GraphRiskAnalysisResponse {
  scoringVersion: string;
  propagationVersion: string;
  disclaimer: string;
  baseline: GraphRiskBaselineNode[];
  propagation: GraphRiskPropagationNode[];
  settings: GraphRiskSettings;
}

@Injectable({ providedIn: 'root' })
export class GraphRiskService {
  private readonly http = inject(HttpClient);
  // Matches the existing DossierService / GraphCommunitiesService local API convention.
  private readonly url = 'http://localhost:5191/api/audit/graph-risk/analyze';

  analyze(
    graph: MultiHopDossierGraph,
    settings: Partial<GraphRiskSettings> = {}
  ): Observable<GraphRiskAnalysisResponse> {
    const request: GraphRiskAnalysisRequest = {
      graph,
      ...(settings.maxHops !== undefined ? { maxHops: settings.maxHops } : {}),
      ...(settings.decay !== undefined ? { decay: settings.decay } : {}),
      ...(settings.influenceCap !== undefined ? { influenceCap: settings.influenceCap } : {})
    };
    return this.http.post<GraphRiskAnalysisResponse>(this.url, request);
  }
}
