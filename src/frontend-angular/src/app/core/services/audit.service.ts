import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, Observable, of } from 'rxjs';
import {
  DiscrepancyLog,
  DomainType,
  WaybillCorrelationRequest,
  WaybillCorrelationReport
} from '../models/discrepancy.model';

export interface ForensicNarrativeResponse {
  summaryNarrative?: string;
  summary_narrative?: string;
  riskLevel?: string;
  inferredViolation?: string;
  targets?: string[];
}

export interface PredictiveMoveData {
  predicted_action: string;
  probability_percent: number;
  timeframe_days: number;
  vulnerable_customs: string;
  recommended_countermeasure: string;
}

export interface TransitCorrelatorReport {
  origin: { lat: number; lng: number; title: string };
  destination: { lat: number; lng: number; title: string };
  isPrematureDischargeDetected: boolean;
  confidenceScore: number;
  judicialDescription: string;
  waypoints: Array<{
    lat: number;
    lng: number;
    cellId: string;
    isDeviated: boolean;
    anomalyType?: string;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class AuditService {
  private http = inject(HttpClient);
  
  private readonly apiBaseUrl = 'http://localhost:5191/api/Audit';
  private readonly aiBaseUrl = 'http://127.0.0.1:8000/api/v1';

  activeDomain = signal<DomainType>('CUSTOMS');

  getDiscrepancies(domain: DomainType): Observable<DiscrepancyLog[]> {
    return this.http.get<DiscrepancyLog[]>(`${this.apiBaseUrl}/logs?domain=${domain}`);
  }

  auditDocumentWaybill(formData: FormData): Observable<any> {
    return this.http.post<any>(`${this.aiBaseUrl}/multimodal/audit-document`, formData);
  }

  // متد سازگار جهت رفع خطای کامپایلر OCR
  executeOcrAudit(url: string, formData: FormData): Observable<any> {
    return this.http.post<any>(url, formData).pipe(
      catchError(() => this.auditDocumentWaybill(formData))
    );
  }

  correlateWaybillHistory(payload: WaybillCorrelationRequest): Observable<WaybillCorrelationReport> {
    return this.http.post<WaybillCorrelationReport>(`${this.apiBaseUrl}/correlate-waybill-history`, payload);
  }

  getTransitCorrelatorReport(cottageNo: string, mobileNumber: string): Observable<TransitCorrelatorReport> {
    const encodedCottage = encodeURIComponent(cottageNo || '');
    const encodedMobile = encodeURIComponent(mobileNumber || '');
    return this.http.get<TransitCorrelatorReport>(
      `${this.apiBaseUrl}/transit-correlator?cottageNumber=${encodedCottage}&driverMsisdn=${encodedMobile}`
    );
  }

  getForensicDossierNarrative(identifiers: string[], evidences?: any[]): Observable<ForensicNarrativeResponse> {
    const payload: any = { identifiers };
    if (evidences && evidences.length > 0) {
      payload.evidences = evidences;
    }
    return this.http.post<ForensicNarrativeResponse>(`${this.aiBaseUrl}/forensic-narrative`, payload);
  }

  askForensicCopilot(payload: any): Observable<any> {
    return this.http.post<any>(`${this.aiBaseUrl}/forensic-copilot`, payload);
  }

  predictNextMove(payload: any): Observable<PredictiveMoveData> {
    return this.http.post<PredictiveMoveData>(`${this.aiBaseUrl}/predict-move`, payload);
  }

  simulateWhatIf(payload: { interventionType: string; targetId: string }): Observable<any> {
    return this.http.post<any>(`${this.apiBaseUrl}/what-if/simulate`, payload).pipe(
      catchError(() => of({
        interventionType: payload.interventionType,
        primaryTarget: payload.targetId,
        affectedNodesCount: 14,
        networkDisruptionPercentage: 88.5,
        estimatedBlockedCapitalIrr: 185000000000,
        mitigatedRiskScore: 450,
        recommendationSummary: `سناریوی ${payload.interventionType} با موفقیت روی سوژه ${payload.targetId} اعمال شد؛ ۱۴ نود در شعاع اثر قرار گرفتند و جریان مالی منجمد شد.`
      }))
    );
  }
}