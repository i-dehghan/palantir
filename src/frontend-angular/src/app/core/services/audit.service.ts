import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
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
  
  // آدرس‌های پایه هماهنگ با Routeهای تعریف‌شده در Swagger و سرور پایتون
  private readonly apiBaseUrl = 'http://localhost:5191/api/Audit';
  private readonly aiBaseUrl = 'http://127.0.0.1:8000/api/v1';

  activeDomain = signal<DomainType>('CUSTOMS');

  // ۱. اصلاح روت لاگ‌های مغایرت مطابق با Swagger: /api/Audit/logs
  getDiscrepancies(domain: DomainType): Observable<DiscrepancyLog[]> {
    return this.http.get<DiscrepancyLog[]>(`${this.apiBaseUrl}/logs?domain=${domain}`);
  }

  // ۲. ارسال تصویر سند فیزیکی بارنامه به مایکروسرویس پایتون
  auditDocumentWaybill(formData: FormData): Observable<any> {
    return this.http.post<any>(`${this.aiBaseUrl}/multimodal/audit-document`, formData);
  }

  // ۳. تطبیق تقاطعی مشخصات بارنامه با سوابق تاریخی در دات‌نت: /api/Audit/correlate-waybill-history
  correlateWaybillHistory(payload: WaybillCorrelationRequest): Observable<WaybillCorrelationReport> {
    return this.http.post<WaybillCorrelationReport>(`${this.apiBaseUrl}/correlate-waybill-history`, payload);
  }

  // ۴. پایش خط سیر ترانزیت و ردپای سلولی: /api/Audit/transit-correlator مطابق با کوئری‌پارامترهای Swagger
  getTransitCorrelatorReport(cottageNo: string, mobileNumber: string): Observable<TransitCorrelatorReport> {
    const encodedCottage = encodeURIComponent(cottageNo || '');
    const encodedMobile = encodeURIComponent(mobileNumber || '');
    return this.http.get<TransitCorrelatorReport>(
      `${this.apiBaseUrl}/transit-correlator?cottageNumber=${encodedCottage}&driverMsisdn=${encodedMobile}`
    );
  }

  // ۵. دریافت گزارش جرم‌شناسی مدل زبانی
  getForensicDossierNarrative(identifiers: string[], evidences?: any[]): Observable<ForensicNarrativeResponse> {
    const payload: any = { identifiers };
    if (evidences && evidences.length > 0) {
      payload.evidences = evidences;
    }
    return this.http.post<ForensicNarrativeResponse>(`${this.aiBaseUrl}/forensic-narrative`, payload);
  }

  // ۶. گفت‌وگو با دستیار هوشمند پرونده (Copilot)
  askForensicCopilot(payload: any): Observable<any> {
    return this.http.post<any>(`${this.aiBaseUrl}/forensic-copilot`, payload);
  }

  // ۷. پیش‌بینی هوشمند اقدام آتی سوژه
  predictNextMove(payload: any): Observable<PredictiveMoveData> {
    return this.http.post<PredictiveMoveData>(`${this.aiBaseUrl}/predict-move`, payload);
  }
}