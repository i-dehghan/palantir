import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MultiHopDossierGraph } from './dossier.service';

export interface GraphCommunitiesResult {
  assignments: Record<string, number>;
  communitySizes: Record<string, number>;
  bridgeNodeIds: string[];
  modularity: number;
  passes: number;
  method: string;
}

@Injectable({ providedIn: 'root' })
export class GraphCommunitiesService {
  private readonly http = inject(HttpClient);
  private readonly url = 'http://localhost:5191/api/audit/graph-communities/analyze';

  analyze(graph: MultiHopDossierGraph): Observable<GraphCommunitiesResult> {
    return this.http.post<GraphCommunitiesResult>(this.url, {
      rootEntityId: graph.rootEntityId ?? '',
      exploredDepth: graph.exploredDepth ?? 0,
      nodes: graph.nodes,
      edges: graph.edges
    });
  }
}
