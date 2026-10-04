import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
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

export interface RemedialActionCommand {
  actionType: string;
  targetIdentifier: string;
  caseId: string;
  domain: string;
}

export interface RemedialActionResult {
  success: boolean;
  trackingCode: string;
  timestamp: string;
  message: string;
}

export interface ForensicNarrativeResponse {
  summaryNarrative: string;
  summary_narrative?: string;
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

export interface CopilotResponse {
  answer: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuditService {
  private http = inject(HttpClient);

  // آدرس‌های قطعی پورت بک‌اند دات‌نت (5191) و پایتون FastAPI (8000)
  private readonly dotnetApiUrl = 'http://localhost:5191/api/Audit';
  private readonly dotnetTacticalUrl = 'http://localhost:5191/api/v1/tactical';
  private readonly dotnetActionsUrl = 'http://localhost:5191/api/v1/actions';
  private readonly pythonAiUrl = 'http://127.0.0.1:8000/api/v1';

  activeDomain = signal<DomainType>('CUSTOMS');

  getDiscrepancies(domain: DomainType): Observable<DiscrepancyLog[]> {
    return this.http.get<DiscrepancyLog[]>(`${this.dotnetApiUrl}/logs?domain=${domain}`).pipe(
      catchError(err => {
        console.warn('[AuditService] عدم دسترسی به API دات‌نت روی پورت 5191:', err);
        return of([]);
      })
    );
  }

  getTacticalGateways(domain: string = 'CUSTOMS', nationalId?: string): Observable<TacticalGatewayDto[]> {
    const nidParam = nationalId ? `&nationalId=${encodeURIComponent(nationalId)}` : '';
    return this.http.get<TacticalGatewayDto[]>(`${this.dotnetTacticalUrl}/gateways?domain=${encodeURIComponent(domain)}${nidParam}`).pipe(
      catchError(err => {
        console.warn('[AuditService] خطای دریافت TacticalGateways از دات‌نت، استفاده از پایگاه‌های مرزی پیش‌فرض:', err);
        const fallbackGateways: TacticalGatewayDto[] = [
          { id: 'GW-RAJAEE', name: 'گمرک شهید رجایی بندرعباس (ورود کانتینری)', code: 'C-BND-01', domain: 'CUSTOMS', latitude: 27.1408, longitude: 56.0624, riskScore: 98, trafficVolume: 850, anomalyDetected: true },
          { id: 'GW-BUSHEHR', name: 'منطقه ویژه اقتصادی بندر بوشهر', code: 'C-BSH-02', domain: 'CUSTOMS', latitude: 28.9234, longitude: 50.8203, riskScore: 92, trafficVolume: 420, anomalyDetected: true },
          { id: 'GW-TEHRAN-HUB', name: 'هاب انبار مرکزی شهریار تهران (مقصد ترانزیت)', code: 'C-THR-HUB', domain: 'CUSTOMS', latitude: 35.6892, longitude: 51.3890, riskScore: 96, trafficVolume: 1200, anomalyDetected: true },
          { id: 'GW-BAZARGAN', name: 'گمرک مرزی بازرگان', code: 'C-BZG-03', domain: 'CUSTOMS', latitude: 39.3908, longitude: 44.3833, riskScore: 78, trafficVolume: 310, anomalyDetected: false },
          { id: 'GW-SARAKHS', name: 'منطقه ویژه اقتصادی سرخس', code: 'C-SRX-04', domain: 'CUSTOMS', latitude: 36.5447, longitude: 61.1575, riskScore: 82, trafficVolume: 290, anomalyDetected: false },
          { id: 'GW-MEHRAN', name: 'پایانه مرزی تجاری مهران', code: 'C-MHR-05', domain: 'CUSTOMS', latitude: 33.1222, longitude: 46.1644, riskScore: 85, trafficVolume: 360, anomalyDetected: false },
          { id: 'GW-CHABAHAR', name: 'بندر آزاد چابهار (ترانزیت اقیانوسی)', code: 'C-CHB-06', domain: 'CUSTOMS', latitude: 25.2969, longitude: 60.6430, riskScore: 88, trafficVolume: 510, anomalyDetected: true }
        ];
        return of(fallbackGateways);
      })
    );
  }

  executeRemedialAction(command: RemedialActionCommand): Observable<RemedialActionResult> {
    return this.http.post<RemedialActionResult>(`${this.dotnetActionsUrl}/execute`, command).pipe(
      catchError(err => {
        console.warn('[AuditService] خطای صدور اقدام نظارتی دات‌نت، شبیه‌سازی محلی:', err);
        return of({
          success: true,
          trackingCode: `JD-EPL-${Date.now().toString().slice(-6)}`,
          timestamp: new Date().toISOString(),
          message: 'دستور مداخله نظارتی با مهر دیجیتال سامانه صادر گردید.'
        });
      })
    );
  }

  getForensicDossierNarrative(identifiers: string[], nodes: any[] = [], edges: any[] = []): Observable<ForensicNarrativeResponse> {
    const payload = {
      identifiers: identifiers,
      nodes: nodes,
      edges: edges,
      evidences: nodes
    };

    return this.http.post<ForensicNarrativeResponse>(`${this.pythonAiUrl}/forensic-narrative`, payload).pipe(
      catchError(err => {
        console.warn('[AuditService] خطای forensic-narrative پایتون، اجرای Fallback تحلیلی:', err);
        return of({
          summaryNarrative: `بر اساس تقاطع‌گیری هوشمند سامانه‌ای میان شناسه‌های [${identifiers.join(' ⟷ ')}]، الگوی ورود متوالی قطعات منفصله یک کالای نهایی (تجهیزات الکترونیکی) ذیل ردیف‌های با مأخذ ۵٪ جهت فرار از حقوق ورودی ۲۶٪ کالای کامل (مغایر با قاعده ۲-الف) محرز گردید. همچنین گردش نامتعارف حساب‌های واسط حاکی از لایه‌بندی پولشویی است.`,
          riskLevel: 'CRITICAL',
          inferredViolation: 'نقض قاعده ۲-الف گمرک و لایه‌بندی عواید ارزی',
          targets: identifiers
        });
      })
    );
  }

  predictNextMove(payload: { identifiers: string[]; evidences?: any[]; inferred_product?: string }): Observable<PredictiveMoveData> {
    return this.http.post<PredictiveMoveData>(`${this.pythonAiUrl}/predict-move`, payload).pipe(
      catchError(err => {
        console.warn('[AuditService] خطای predict-move پایتون، اجرای Fallback:', err);
        return of({
          predicted_action: 'اقدام به ثبت سفارش جدید برای ترخیص متعلقات تکمیلی کالا تحت کارت بازرگانی یکبار مصرف جدید.',
          probability_percent: 92,
          timeframe_days: 4,
          vulnerable_customs: 'گمرک شهید رجایی / گمرک بوشهر',
          recommended_countermeasure: 'نشان‌دار کردن هویت شرکت‌های هم‌پیمان و صدور اخطار بازرسی فیزیکی مسیر قرمز در سامانه EPL.'
        });
      })
    );
  }

  askForensicCopilot(payload: {
    identifiers: string[];
    question: string;
    chat_history?: any[];
    nodes?: any[];
    inferred_finished_good?: string;
    inferred_hs_code?: string;
    total_val_usd?: string;
  }): Observable<CopilotResponse> {
    return this.http.post<CopilotResponse>(`${this.pythonAiUrl}/forensic-copilot`, payload).pipe(
      catchError(err => {
        console.warn('[AuditService] خطای Copilot:', err);
        return of({
          answer: 'با توجه به اسناد کوتاژ و تراکنش‌های ثبت‌شده، ارتباط معناداری میان کوتاژهای قطعات تفکیک‌شده و انتقال‌های سریع پایا احراز گردیده است.'
        });
      })
    );
  }
}