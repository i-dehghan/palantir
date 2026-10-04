import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface MultiHopDossierGraph {
  rootEntityId?: string;
  targetNid?: string;
  exploredDepth?: number;
  isMultiTarget?: boolean;
  nodes: any[];
  edges: any[];
  timestamp?: number;
}

export interface MultiEntityQueryParams {
  identifiers: string[];
  relationTypes?: ('BANKING' | 'TELECOM' | 'CUSTOMS')[];
  maxDepth?: number;
}

@Injectable({
  providedIn: 'root'
})
export class DossierService {
  private http = inject(HttpClient);
  private baseUrl = 'http://localhost:5191/api/audit';

  getDossier(nationalId: string, depth: number = 2): Observable<MultiHopDossierGraph> {
    const params = new HttpParams().set('depth', depth.toString());
    // اصلاح مسیر اندپوینت از ontology/dossier به مسیر مستقیم کنترلر: /api/audit/dossier/{nationalId}
    return this.http.get<MultiHopDossierGraph>(`${this.baseUrl}/dossier/${nationalId}`, { params });
  }

  getMultiHopEntityLinks(identifier: string, depth: number = 2): Observable<MultiHopDossierGraph> {
    const params = new HttpParams().set('depth', depth.toString());
    return this.http.get<MultiHopDossierGraph>(`${this.baseUrl}/dossier/${identifier}`, { params });
  }

  queryMultiEntityLinks(queryParams: MultiEntityQueryParams): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/multi-entity-links`, queryParams);
  }
}