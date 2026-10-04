import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DiscrepancyLog, DomainType } from '../models/discrepancy.model';

export interface TacticalGatewayDto {
  id: string;
  name: string;
  code: string;
  domain: string;
  latitude: number;
  longitude: number;
  riskScore: number;
  trafficVolume: number;
  anomalyDetected: boolean;
}

export interface ForensicNarrativeResponse {
  summaryNarrative: string;
  riskLevel: string;
  inferredViolation: string;
  targets: string[];
}

export interface PredictiveMoveData {
  predicted_action: string;
  probability_percent: number;
  timeframe_days: number;
  vulnerable_customs: string;
  recommended_countermeasure: string;
}

export interface RemedialActionRequest {
  actionType: 'BLOCK_CUSTOMS_CLEARANCE' | 'FREEZE_BANK_ACCOUNT' | 'FLAG_RED_LIST';
  targetIdentifier: string;
  caseId: string;
  domain: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuditService {
  private http = inject(HttpClient);
  public activeDomain = signal<DomainType>('CUSTOMS');

  getDiscrepancies(domain: string = 'CUSTOMS'): Observable<DiscrepancyLog[]> {
    const params = new HttpParams().set('domain', domain);
    return this.http.get<DiscrepancyLog[]>('/api/v1/audit/logs', { params });
  }

  getTacticalGateways(domain: string = 'CUSTOMS', nationalId?: string): Observable<TacticalGatewayDto[]> {
    let params = new HttpParams().set('domain', domain);
    if (nationalId) {
      params = params.set('nationalId', nationalId);
    }
    return this.http.get<TacticalGatewayDto[]>('/api/v1/tactical/gateways', { params });
  }

  executeRemedialAction(payload: RemedialActionRequest): Observable<any> {
    return this.http.post<any>('/api/v1/actions/execute', payload);
  }

  getForensicDossierNarrative(identifiers: string[]): Observable<ForensicNarrativeResponse> {
    return this.http.post<ForensicNarrativeResponse>('/api/v1/forensic-narrative', { identifiers });
  }

  askForensicCopilot(payload: {
    identifiers: string[];
    question: string;
    chat_history: { role: string; content: string }[];
    nodes?: any[];
    inferred_finished_good?: string;
    inferred_hs_code?: string;
    total_val_usd?: string;
  }): Observable<{ answer: string }> {
    return this.http.post<{ answer: string }>('/api/v1/forensic-copilot', payload);
  }

  predictNextMove(payload: {
    identifiers: string[];
    evidences: any[];
    inferred_product: string;
  }): Observable<PredictiveMoveData> {
    return this.http.post<PredictiveMoveData>('/api/v1/predict-move', payload);
  }
}