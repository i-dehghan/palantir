import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { DiscrepancyLog } from '../models/discrepancy.model';

export type DomainType = 'CUSTOMS' | 'BANKING' | 'TELECOM';
export interface ForensicNarrativeResponse {
  caseId: string;
  investigatedTargets: string[];
  summaryNarrative: string;
  graphSummary?: {
    totalNodes: number;
    totalEdges: number;
    hasDirectConnection: boolean;
  };
  generatedAt?: string;
}
export interface PredictiveMoveData {
  predicted_action: string;
  probability_percent: number;
  timeframe_days: number;
  vulnerable_customs: string;
  recommended_countermeasure: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuditService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:5191/api/Audit';

  // سیگنال مشترک حوزه انتخابی
  activeDomain = signal<DomainType>('CUSTOMS');

  getDiscrepancies(domain?: string): Observable<DiscrepancyLog[]> {
    const targetDomain = domain || this.activeDomain();
    const params = new HttpParams().set('domain', targetDomain);
    return this.http.get<DiscrepancyLog[]>(`${this.apiUrl}/discrepancies`, { params });
  }

  runAudit(domain?: DomainType): Observable<any> {
    const targetDomain = domain || this.activeDomain();
    return this.http.post(`${this.apiUrl}/run?domain=${targetDomain}`, {});
  }

  getTacticalGateways(domain: string, nationalId?: string): Observable<any> {
  let params = new HttpParams().set('domain', domain);
  if (nationalId) {
    params = params.set('nationalId', nationalId);
  }
  return this.http.get<any>(`${this.apiUrl}/gateways`, { params });
}
getForensicDossierNarrative(identifiers: string[]): Observable<ForensicNarrativeResponse> {
  return this.http.post<ForensicNarrativeResponse>(
    `${this.apiUrl}/forensic/dossier-narrative`,
    { identifiers }
  );
}

askForensicCopilot(payload: {
  identifiers: string[];
  question: string;
  chat_history: { role: string; content: string }[];
  nodes?: any[];
  edges?: any[];
}): Observable<{ answer: string }> {
  // ارسال مستقیم به میکروسرویس پایتون
  return this.http.post<{ answer: string }>(
    'http://127.0.0.1:8000/api/v1/forensic-copilot/chat',
    payload
  );
}
predictNextMove(payload: {
  identifiers: string[];
  evidences: any[];
  inferred_product?: string;
}): Observable<PredictiveMoveData> {
  return this.http.post<PredictiveMoveData>(
    'http://127.0.0.1:8000/api/v1/predict-next-move',
    payload
  );
}

executeTacticalAction(payload: {
  caseId: string;
  targetNationalId: string;
  actionType: 'BLOCK_CUSTOMS_CLEARANCE' | 'FREEZE_BANK_ACCOUNT' | 'FLAG_RED_LIST';
  reason: string;
}) {
  return this.http.post<{ success: boolean; trackingNumber: string; message: string; executedAtShamsi: string }>(
    `${this.apiUrl}/actions/execute`,
    payload
  );
}
}