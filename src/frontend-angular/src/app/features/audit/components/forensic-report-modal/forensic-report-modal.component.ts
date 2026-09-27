import {
  Component,
  Input,
  Output,
  EventEmitter,
  AfterViewInit,
  OnChanges,
  SimpleChanges,
  ElementRef,
  ViewChild,
  OnDestroy,
  signal,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import * as echarts from 'echarts';
import { AuditService, ForensicNarrativeResponse, PredictiveMoveData } from '../../../../core/services/audit.service';
import { FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
export type DomainReportType = 'CUSTOMS' | 'BANKING' | 'TELECOM';


@Component({
  selector: 'app-forensic-report-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-backdrop" *ngIf="isOpen" (click)="close()">
      <div id="judicial-report-dossier" class="forensic-paper" (click)="$event.stopPropagation()">
<button class="copilot-toggle-btn" (click)="toggleCopilot()">
  <span>💬 دستیار هوشمند پرونده (AI Copilot)</span>
</button>
<div class="copilot-drawer" *ngIf="copilotOpen()">
  <div class="copilot-header">
    <div class="title">
      <span class="ai-sparkle">✦</span>
      <strong>کاوشگر هوشمند جرم‌شناسی (DeepSeek)</strong>
    </div>
    <button class="close-btn" (click)="toggleCopilot()">×</button>
  </div>

  <div class="copilot-body">
    <div class="chat-bubble" *ngFor="let msg of chatMessages()" [class.user]="msg.role === 'user'">
      <div class="sender-label">{{ msg.role === 'user' ? 'بازرس' : 'سامانه دیده‌بان' }}</div>
      <div class="msg-content">{{ msg.content }}</div>
    </div>
    <div class="chat-bubble typing" *ngIf="copilotLoading()">
      <em>در حال تحلیل تقاطعی اسناد و استنتاج...</em>
    </div>
  </div>

  <div class="copilot-footer">
    <input 
      type="text" 
      [(ngModel)]="userPrompt" 
      (keyup.enter)="sendCopilotMessage()" 
      placeholder="سوال خود را درباره شگرد، تعرفه‌ها یا این شبکه بپرسید..." />
    <button (click)="sendCopilotMessage()" [disabled]="copilotLoading()">ارسال</button>
  </div>
</div>
        <!-- هدر رسمی گزارش -->
        <header class="paper-header">
          <div class="header-right">
            <div class="national-emblem">⚖️</div>
            <div class="titles">
              <h3>جمهوری اسلامی ایران</h3>
              <h4>سامانه یکپارچه جرم‌شناسی کلان داده و تصمیم‌یاری (دیدبان)</h4>
              <div class="domain-tag-badge" [ngClass]="currentDomain">
                حوزه بازرسی: {{ getDomainTitle() }}
              </div>
            </div>
          </div>
          <div class="header-meta">
            <div><strong>شناسه پرونده:</strong> {{ caseId || 'CASE-2026-NTSW-9984' }}</div>
            <div><strong>تاریخ استخراج:</strong> ۱۴۰۵/۰۶/۳۰ - ۱۱:۲۰</div>
            <div><strong>رده طبقه‌بندی:</strong> <span class="confidential-text">محرمانه - سند تخصصی قضایی</span></div>
          </div>
        </header>
<!-- نوار اقدام فوری و صدور احکام نظارتی -->
<div class="tactical-actions-strip">
  <div class="strip-label">
    <span class="icon">🚨</span>
    <span>سامانه اقدام فوری و مداخله نظارتی:</span>
  </div>

  <div class="buttons-group">
    <button class="act-btn danger" [disabled]="actionInProgress()" (click)="triggerAction('BLOCK_CUSTOMS_CLEARANCE')">
      🛑 دستور توقف ترخیص (EPL)
    </button>
    <button class="act-btn warning" [disabled]="actionInProgress()" (click)="triggerAction('FREEZE_BANK_ACCOUNT')">
      🔒 مسدودی اضطراری حساب (بانک مرکزی)
    </button>
    <button class="act-btn dark" [disabled]="actionInProgress()" (click)="triggerAction('FLAG_RED_LIST')">
      ⚠️ درج در لیست سیاه مرزی
    </button>
  </div>
</div>

<!-- بنر بازخورد نتیجه اقدام -->
<div *ngIf="actionNotification()" class="action-alert-banner" [ngClass]="actionNotification()?.type">
  <div class="alert-content">
    <strong>{{ actionNotification()?.message }}</strong>
    <span *ngIf="actionNotification()?.tracking" class="tracking mono">
      شماره پیگیری قضایی: {{ actionNotification()?.tracking }}
    </span>
  </div>
  <button class="close-alert" (click)="actionNotification.set(null)">✕</button>
</div>
        <!-- بخش تحلیل و استنتاج مدل زبانی (LLM) برای چند سوژه -->
        <section class="ai-forensic-narrative-card" *ngIf="multiEntityData?.isMultiTarget">
          <div class="card-head">
            <div class="head-left">
              <span class="ai-sparkle-icon">🤖</span>
              <strong>تحلیل جرم‌شناسی مدل زبانی (شگرد و زنجیره پیوند بین افراد)</strong>
            </div>
            <span class="target-chip-pill">
              سوژه‌ها: {{ multiEntityData?.targets?.join(' ⟷ ') }}
            </span>
          </div>

          <div *ngIf="isAiGenerating()" class="ai-loading-state">
            <div class="ai-pulse-bar"></div>
            <span>مدل زبانی در حال جرم‌یابی و تفسیر روابط گراف و تراکنش‌ها...</span>
          </div>

          <div *ngIf="!isAiGenerating()" class="ai-narrative-body">
            <p>{{ aiAnalysis() }}</p>
          </div>
        </section>

        <!-- شاخص‌های کلیدی سوژه متناسب با هر حوزه -->
        <section class="dossier-summary-grid">
          <div class="summary-card">
            <span class="label">{{ currentDomain === 'TELECOM' ? 'شماره سرشاخه / IMSI:' : 'سوژه اصلی (کد ملی / شناسه):' }}</span>
            <div class="val highlight">{{ targetNationalId || '14001000484' }}</div>
            <span class="sub">{{ currentDomain === 'BANKING' ? 'حساب تجمیع‌کننده ارزی' : (currentDomain === 'TELECOM' ? 'خوشه سیم‌کارت‌های بی‌نام' : 'شرکت بازرگانی واردات آریا') }}</span>
          </div>

          <div class="summary-card">
            <span class="label">درجه ریسک تخلف:</span>
            <div class="val danger">{{ threatScore || 95 }}% (سطح بحرانی)</div>
            <span class="sub">{{ getThreatDescription() }}</span>
          </div>

          <div class="summary-card">
            <span class="label">{{ currentDomain === 'BANKING' ? 'حجم تراکنش مشکوک:' : (currentDomain === 'TELECOM' ? 'ترافیک غیرمجاز دقیقه:' : 'ارزش کل اظهارنامه:') }}</span>
            <div class="val warning mono">{{ getFinancialOrTrafficVolume() }}</div>
            <span class="sub">{{ currentDomain === 'BANKING' ? 'گردش شتاب/پایا طی ۴۸ ساعت' : (currentDomain === 'TELECOM' ? 'ترمینیشن بین‌الملل همزمان' : 'تخصیص ارز نیمایی') }}</span>
          </div>

          <div class="summary-card">
            <span class="label">{{ currentDomain === 'BANKING' ? 'تعداد حساب واسط:' : (currentDomain === 'TELECOM' ? 'دکل BTS کانونی:' : 'شماره کوتاژ گمرکی:') }}</span>
            <div class="val mono">{{ getTrackIdentifier() }}</div>
            <span class="sub">{{ currentDomain === 'BANKING' ? 'کشف شبکه Mule' : (currentDomain === 'TELECOM' ? 'منطقه ویژه مرزی/پردیس' : 'گمرک شهید رجایی') }}</span>
          </div>
        </section>

        <!-- سناریوی گمرک -->
        <ng-container *ngIf="currentDomain === 'CUSTOMS' && !multiEntityData?.isMultiTarget">
          <section class="ai-inference-banner customs-theme">
            <div class="banner-header">
              <div class="ai-chip">
                <span class="sparkle">✦</span> موتور هوش مصنوعی استنتاج قاعده ۲-الف (GIR 2a / Assembly Detection)
              </div>
              <span class="confidence-score">ضریب قطعیت تطبیق قطعات: <strong>۹۸.۴٪</strong></span>
            </div>

            <div class="assembly-detection-box">
              <div class="assembled-product-target">
                <span class="target-label">کالای نهایی احراز شده از تجمیع کوتاژها:</span>
                <h3 class="target-name">تلویزیون هوشمند LED سایز ۶۵ اینچ (Smart UHD TV)</h3>
                <span class="target-hscode mono">کد تعرفه واقعی: <strong>85287200</strong> (مأخذ ۲۶٪)</span>
              </div>
              <div class="assembly-flow-arrow">⟵ ترکیب اجزا</div>
              <div class="detected-parts-tags">
                <span class="part-pill">✓ پنل نمایشگر Open-Cell (کوتاژ ۹۹۸۴)</span>
                <span class="part-pill">✓ برد الکترونیکی مین‌برد (کوتاژ ۹۹۸۴)</span>
                <span class="part-pill">✓ قاب و فریم پلاستیکی (کوتاژ ۹۹۸۰)</span>
                <span class="part-pill">✓ پاور و مدار تغذیه (کوتاژ ۹۹۷۶)</span>
              </div>
            </div>

            <div class="legal-inference-note">
              <strong>شرح مغایرت قانونی:</strong> 
              واردکننده قطعات منفصله یک محصول کامل را تحت کدهای تعرفه ۵٪ مجزا اظهار کرده است تا از مأخذ ۲۶٪ حقوق ورودی کالای نهایی فرار کند (مصداق تخلف ذیل قاعده ۲-الف قواعد عمومی تفسیر HS).
            </div>
          </section>
        </ng-container>

        <!-- سناریوی بانکی -->
        <ng-container *ngIf="currentDomain === 'BANKING' && !multiEntityData?.isMultiTarget">
          <section class="ai-inference-banner banking-theme">
            <div class="banner-header">
              <div class="ai-chip">
                <span class="sparkle">✦</span> مدل کشف هوشمند لایه‌بندی پولشویی (AML Layering & Mule Detection)
              </div>
              <span class="confidence-score">شاخص همپوشانی تراکنش‌ها: <strong>۹۶.۷٪</strong></span>
            </div>

            <div class="assembly-detection-box">
              <div class="assembled-product-target">
                <span class="target-label">الگوی کشف شده شبکه مالی:</span>
                <h3 class="target-name">حساب اجاره‌ای تجمیع سریع (Smurfing to Rapid Mule Layering)</h3>
                <span class="target-hscode mono">روش تسویه: <strong>پایا و ساتنا چندمرحله‌ای</strong> (تخلیه زیر ۵ دقیقه)</span>
              </div>
              <div class="assembly-flow-arrow">⟵ زنجیره حساب‌ها</div>
              <div class="detected-parts-tags">
                <span class="part-pill aml">✓ واریز خرد از ۱۲ حساب بدون هویت تجاری</span>
                <span class="part-pill aml">✓ تجمیع در حساب میانی شماره ۶۰۳۷...۴۱</span>
                <span class="part-pill aml">✓ انتقال آنی به حساب صرافی غیرمجاز مرزی</span>
              </div>
            </div>

            <div class="legal-inference-note">
              <strong>شرح جرم‌شناسی مالی:</strong> 
              تطبیق تراکنش‌ها نشان می‌دهد وجوه حاصل از عدم رفع تعهد ارزی در گمرک، ظرف ۴۸ ساعت از طریق شبکه‌ای از حساب‌های اجاره‌ای متعلق به افراد کم‌درآمد شستشو داده شده است.
            </div>
          </section>
        </ng-container>

        <!-- سناریوی تلکام -->
        <ng-container *ngIf="currentDomain === 'TELECOM' && !multiEntityData?.isMultiTarget">
          <section class="ai-inference-banner telecom-theme">
            <div class="banner-header">
              <div class="ai-chip">
                <span class="sparkle">✦</span> موتور تحلیل الگوهای ترافیک مخابراتی (CDR Anomaly & SIM-Box Profiler)
              </div>
              <span class="confidence-score">تطبیق رفتار ماشینی سلولار: <strong>۹۹.۱٪</strong></span>
            </div>

            <div class="assembly-detection-box">
              <div class="assembled-product-target">
                <span class="target-label">ناهنجاری احراز شده شبکه:</span>
                <h3 class="target-name">درگاه قاچاق مکالمات بین‌الملل (SIM-Box Bypass Gateway)</h3>
                <span class="target-hscode mono">سلول رادیویی فعال: <strong>BTS-TEH-EAST-402</strong> (ترافیک نامتعارف)</span>
              </div>
              <div class="assembly-flow-arrow">⟵ شواهد فنی</div>
              <div class="detected-parts-tags">
                <span class="part-pill telecom">✓ نسبت تماس ورودی به خروجی ۱ به ۸۰۰</span>
                <span class="part-pill telecom">✓ عدم جابجایی سلولی (Zero Mobility)</span>
                <span class="part-pill telecom">✓ چرخش مداوم ۳۲ عدد IMSI روی یک دستگاه</span>
              </div>
            </div>

            <div class="legal-inference-note">
              <strong>شرح تخلف ارتباطی:</strong> 
              دستگاه‌های سیم‌باکس با استفاده از سیم‌کارت‌های فعال‌شده با هویت‌های نامعتبر، تماس‌های ورودی بین‌المللی ارزی را به مکالمه محلی تبدیل کرده و باعث تضییع درآمدهای ارتباطی کشور شده‌اند.
            </div>
          </section>
        </ng-container>

        <!-- کارت تحلیل پیش‌دستانه و پیش‌بینی حرکت بعدی -->
<section class="predictive-anomaly-card" *ngIf="predictiveData()">
  <div class="pred-header">
    <div class="pred-title">
      <span class="pulse-radar">📡</span>
      <strong>پیش‌بینی هوشمند اقدام آتی سوژه (Predictive Anomaly Forecast)</strong>
    </div>
    <div class="prob-tag">
      احتمال وقوع: <strong class="danger">{{ predictiveData()?.probability_percent }}٪</strong>
      <span>(ظرف {{ predictiveData()?.timeframe_days }} روز آینده)</span>
    </div>
  </div>

  <div class="pred-content-grid">
    <div class="pred-block">
      <span class="label">شگرد و اقدام محتمل بعدی:</span>
      <p class="val text-amber-300">{{ predictiveData()?.predicted_action }}</p>
    </div>
    <div class="pred-block">
      <span class="label">مبادی ورودی در معرض خطر:</span>
      <p class="val mono text-cyan-300">{{ predictiveData()?.vulnerable_customs }}</p>
    </div>
    <div class="pred-block action-block">
      <span class="label">دستور پیشگیرانه بازرسی (Countermeasure):</span>
      <p class="val text-emerald-400">🛡️ {{ predictiveData()?.recommended_countermeasure }}</p>
    </div>
  </div>
</section>
        <!-- نمودارهای تحلیلی -->
        <section class="visual-analytics-grid">
          <div class="chart-container-box">
            <div class="chart-title">
              <span>{{ getLeftChartTitle() }}</span>
            </div>
            <div #leftChartCanvas class="chart-canvas"></div>
          </div>

          <div class="chart-container-box">
            <div class="chart-title">
              <span>{{ getRightChartTitle() }}</span>
            </div>
            <div #rightChartCanvas class="chart-canvas"></div>
          </div>
        </section>

        <!-- جدول مستندات و شواهد تخصصی -->
        <section class="cargo-items-section">
          <div class="section-title">
            <span class="icon">📑</span>
            {{ getTableTitle() }}
          </div>
          
          <table class="forensic-table" *ngIf="currentDomain === 'CUSTOMS'">
            <thead>
              <tr>
                <th>ردیف</th>
                <th>شرح کالای کوتاژ</th>
                <th>کد تعرفه (HS Code)</th>
                <th>وزن (کیلوگرم)</th>
                <th>ارزش اظهارشده</th>
                <th>مأخذ تنظیمی</th>
                <th>وضعیت سامانه</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of dynamicCustomsItems">
                <td>{{ item.row }}</td>
                <td class="desc-cell">{{ item.desc }}</td>
                <td class="mono font-bold">{{ item.hsCode }}</td>
                <td class="mono">{{ item.weight | number }}</td>
                <td class="mono font-bold">\${{ item.valUsd | number }}</td>
                <td>{{ item.declaredDuty }}٪ (واقعی: {{ item.actualDuty }}٪)</td>
                <td><span class="badge danger">{{ item.status }}</span></td>
              </tr>
            </tbody>
          </table>

          <table class="forensic-table" *ngIf="currentDomain === 'BANKING'">
            <thead>
              <tr>
                <th>ردیف</th>
                <th>شماره حساب واسط</th>
                <th>بانک عامل</th>
                <th>حجم انتقال (ریال)</th>
                <th>فاصله واریز تا برداشت</th>
                <th>درصد ریسک</th>
                <th>طبقه تخلف AML</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of bankingItems">
                <td>{{ item.row }}</td>
                <td class="mono font-bold">{{ item.account }}</td>
                <td>{{ item.bank }}</td>
                <td class="mono font-bold">{{ item.amountRials | number }}</td>
                <td class="mono">{{ item.retentionTime }}</td>
                <td class="mono danger">{{ item.risk }}٪</td>
                <td><span class="badge warning">{{ item.type }}</span></td>
              </tr>
            </tbody>
          </table>

          <table class="forensic-table" *ngIf="currentDomain === 'TELECOM'">
            <thead>
              <tr>
                <th>ردیف</th>
                <th>شناسه IMSI / سیم‌کارت</th>
                <th>کد IMEI ماژول</th>
                <th>مدت مکالمه (دقیقه)</th>
                <th>دکل سلولی (Cell-ID)</th>
                <th>ضریب تحرک</th>
                <th>تشخیص CDR</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of telecomItems">
                <td>{{ item.row }}</td>
                <td class="mono font-bold">{{ item.imsi }}</td>
                <td class="mono">{{ item.imei }}</td>
                <td class="mono font-bold">{{ item.duration | number }}</td>
                <td class="mono">{{ item.cellId }}</td>
                <td>{{ item.mobility }}</td>
                <td><span class="badge purple">{{ item.detection }}</span></td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- پاورقی رسمی -->
        <footer class="paper-footer">
          <div class="sign-block">
            <span>مهر دیجیتال پرونده:</span>
            <div class="sign-stamp">امضای دیجیتال دیدبان: پرونده جهت بررسی حقوقی و قضایی نهایی شد</div>
          </div>
          <div class="actions">
            <!-- دکمه بدون id -->
            <button 
              class="judicial-export-btn" 
              [disabled]="isExportingPdf()" 
              (click)="exportJudicialPdf()">
              <span *ngIf="!isExportingPdf()">⚖️ صدور پرونده رسمی قضایی (PDF)</span>
              <span *ngIf="isExportingPdf()">در حال ساخت سند...</span>
            </button>
            <button class="btn print" (click)="printReport()">🖨️ چاپ رسمی پرونده</button>
            <button class="btn close" (click)="close()">بستن گزارش</button>
          </div>
        </footer>

      </div>
    </div>
  `,
  styles: [`
  .tactical-actions-strip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 0.5rem 0.8rem;
  margin-bottom: 1rem;

  .strip-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    font-weight: bold;
    color: #f8fafc;
  }

  .buttons-group {
    display: flex;
    gap: 0.5rem;

    .act-btn {
      padding: 0.35rem 0.75rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: bold;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.2s;

      &.danger {
        background: rgba(239, 68, 68, 0.15);
        border-color: #ef4444;
        color: #fca5a5;
        &:hover { background: #ef4444; color: white; }
      }
      &.warning {
        background: rgba(245, 158, 11, 0.15);
        border-color: #f59e0b;
        color: #fde68a;
        &:hover { background: #f59e0b; color: #0f172a; }
      }
      &.dark {
        background: rgba(148, 163, 184, 0.1);
        border-color: #64748b;
        color: #cbd5e1;
        &:hover { background: #334155; color: white; }
      }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
  }
}

.action-alert-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 0.9rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-size: 0.75rem;

  &.success {
    background: rgba(6, 78, 59, 0.4);
    border: 1px solid #10b981;
    color: #a7f3d0;
  }
  &.error {
    background: rgba(127, 29, 29, 0.4);
    border: 1px solid #ef4444;
    color: #fca5a5;
  }

  .tracking {
    margin-right: 0.8rem;
    font-family: monospace;
    color: #38bdf8;
  }
  .close-alert {
    background: none;
    border: none;
    color: inherit;
    font-size: 1rem;
    cursor: pointer;
  }
}
  .judicial-export-btn {
  background: linear-gradient(135deg, #1e3a8a, #0284c7);
  border: 1px solid #38bdf8;
  color: #f8fafc;
  padding: 0.35rem 0.85rem;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: linear-gradient(135deg, #1d4ed8, #0369a1);
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
  .predictive-anomaly-card {
  background: linear-gradient(135deg, rgba(30, 27, 75, 0.85), rgba(15, 23, 42, 0.95));
  border: 1px solid #6366f1;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.2rem;
  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.2);

  .pred-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    border-bottom: 1px solid rgba(99, 102, 241, 0.3);
    padding-bottom: 0.5rem;

    .pred-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #a5b4fc;
      font-size: 0.82rem;
    }
    .prob-tag {
      font-size: 0.72rem;
      color: #94a3b8;
      strong.danger { color: #f43f5e; font-size: 0.9rem; font-family: monospace; }
    }
  }

  .pred-content-grid {
    display: grid;
    grid-template-columns: 2fr 1fr 1.5fr;
    gap: 1rem;

    .pred-block {
      background: rgba(10, 14, 23, 0.5);
      border: 1px solid #1e293b;
      padding: 0.6rem 0.8rem;
      border-radius: 6px;

      .label { font-size: 0.65rem; color: #94a3b8; display: block; margin-bottom: 0.25rem; }
      .val { margin: 0; font-size: 0.76rem; line-height: 1.5; font-weight: 500; }
    }

    .action-block {
      border-color: rgba(16, 185, 129, 0.4);
      background: rgba(6, 78, 59, 0.2);
    }
  }
}
  .copilot-toggle-btn {
  position: fixed;
  bottom: 24px;
  left: 24px;
  background: linear-gradient(135deg, #0284c7, #6366f1);
  color: white;
  border: 1px solid #38bdf8;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(2, 132, 199, 0.4);
  z-index: 1000;
  transition: transform 0.2s;
  &:hover { transform: translateY(-2px); }
}

.copilot-drawer {
  position: fixed;
  bottom: 70px;
  left: 24px;
  width: 420px;
  max-width: 90vw;
  height: 480px;
  background: #090e17;
  border: 1px solid #1e293b;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0,0,0,0.8);
  z-index: 1001;
  direction: rtl;

  .copilot-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: #0f172a;
    border-bottom: 1px solid #1e293b;
    color: #f8fafc;
    font-size: 0.82rem;
    .close-btn { background: none; border: none; color: #94a3b8; font-size: 1.2rem; cursor: pointer; }
  }

  .copilot-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;

    .chat-bubble {
      background: #131d2e;
      border: 1px solid #1e293b;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 0.78rem;
      line-height: 1.5;
      color: #e2e8f0;

      &.user {
        background: #03456b;
        border-color: #0284c7;
        align-self: flex-start;
      }
      .sender-label { font-size: 0.65rem; color: #94a3b8; margin-bottom: 3px; font-weight: bold; }
    }
  }

  .copilot-footer {
    display: flex;
    gap: 8px;
    padding: 10px;
    background: #0f172a;
    border-top: 1px solid #1e293b;

    input {
      flex: 1;
      background: #070b12;
      border: 1px solid #334155;
      color: white;
      padding: 6px 10px;
      border-radius: 5px;
      font-size: 0.76rem;
      font-family: inherit;
    }
    button {
      background: #0284c7;
      border: none;
      color: white;
      padding: 6px 14px;
      border-radius: 5px;
      font-size: 0.76rem;
      cursor: pointer;
    }
  }
}
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(3, 7, 18, 0.88);
      backdrop-filter: blur(8px); z-index: 100000;
      display: flex; align-items: center; justify-content: center;
      direction: rtl; text-align: right;
    }
    .forensic-paper {
      width: 1100px; max-width: 95vw; max-height: 92vh; overflow-y: auto;
      background: #0b111e; border: 1px solid #1e293b; border-radius: 8px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.9); padding: 1.5rem; color: #f1f5f9;
    }
    .paper-header {
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 2px solid #1e293b; padding-bottom: 1rem; margin-bottom: 1.2rem;
    }
    .header-right { display: flex; align-items: center; gap: 0.8rem; }
    .national-emblem { font-size: 2.2rem; }
    .titles h3 { margin: 0; font-size: 1.1rem; color: #f8fafc; font-weight: bold; }
    .titles h4 { margin: 0.2rem 0; font-size: 0.82rem; color: #94a3b8; }
    .domain-tag-badge {
      display: inline-block; padding: 0.15rem 0.5rem; border-radius: 3px; font-size: 0.65rem; font-weight: bold; margin-top: 0.25rem;
      &.CUSTOMS { background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; color: #38bdf8; }
      &.BANKING { background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #10b981; }
      &.TELECOM { background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; color: #f59e0b; }
    }
    .header-meta {
      font-size: 0.72rem; color: #94a3b8; line-height: 1.6;
      strong { color: #cbd5e1; }
      .confidential-text { color: #f87171; font-weight: bold; }
    }

    /* استایل اختصاصی تحلیل مدل زبانی */
    .ai-forensic-narrative-card {
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.95));
      border: 1px solid #38bdf8; border-radius: 6px; padding: 1rem; margin-bottom: 1.2rem;
      box-shadow: 0 4px 20px rgba(56, 189, 248, 0.15);
      .card-head {
        display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;
        .head-left { display: flex; align-items: center; gap: 0.4rem; color: #38bdf8; font-size: 0.8rem; }
        .target-chip-pill {
          background: #0f172a; border: 1px solid #1e293b; color: #f59e0b;
          font-size: 0.68rem; padding: 0.15rem 0.5rem; border-radius: 3px; font-family: monospace;
        }
      }
      .ai-loading-state {
        display: flex; align-items: center; gap: 0.6rem; color: #94a3b8; font-size: 0.75rem; padding: 0.5rem 0;
        .ai-pulse-bar {
          width: 14px; height: 14px; border: 2px solid #38bdf8; border-top-color: transparent;
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
      }
      .ai-narrative-body p {
        margin: 0; font-size: 0.78rem; line-height: 1.8; color: #e2e8f0; text-align: justify;
      }
    }

    .dossier-summary-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1.2rem;
    }
    .summary-card {
      background: #131d2e; border: 1px solid #1e293b; border-radius: 6px; padding: 0.6rem 0.8rem;
      .label { font-size: 0.68rem; color: #94a3b8; display: block; margin-bottom: 0.25rem; }
      .val { font-size: 1rem; font-weight: bold; }
      .val.highlight { color: #f59e0b; font-family: monospace; }
      .val.danger { color: #ef4444; font-family: monospace; }
      .val.warning { color: #fbbf24; }
      .val.mono { font-family: monospace; }
      .sub { font-size: 0.62rem; color: #64748b; margin-top: 0.2rem; display: block; }
    }
    .ai-inference-banner {
      border-radius: 8px; padding: 1rem; margin-bottom: 1.2rem;
      &.customs-theme { background: linear-gradient(135deg, rgba(88, 28, 135, 0.25), rgba(15, 23, 42, 0.95)); border: 1px solid #a855f7; }
      &.banking-theme { background: linear-gradient(135deg, rgba(6, 78, 59, 0.25), rgba(15, 23, 42, 0.95)); border: 1px solid #10b981; }
      &.telecom-theme { background: linear-gradient(135deg, rgba(120, 53, 15, 0.25), rgba(15, 23, 42, 0.95)); border: 1px solid #f59e0b; }
    }
    .banner-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
    .ai-chip {
      font-size: 0.75rem; font-weight: bold; color: #f8fafc; display: flex; align-items: center; gap: 0.35rem;
      .sparkle { color: #fbbf24; }
    }
    .confidence-score { font-size: 0.72rem; color: #94a3b8; strong { color: #34d399; font-family: monospace; } }
    .assembly-detection-box {
      display: flex; align-items: center; justify-content: space-between;
      background: rgba(10, 14, 23, 0.6); border: 1px solid #334155; border-radius: 6px; padding: 0.8rem 1rem; gap: 1rem;
    }
    .assembled-product-target {
      .target-label { font-size: 0.68rem; color: #94a3b8; display: block; }
      .target-name { margin: 0.2rem 0; font-size: 0.95rem; color: #f8fafc; font-weight: bold; }
      .target-hscode { font-size: 0.72rem; color: #f87171; strong { font-family: monospace; } }
    }
    .assembly-flow-arrow { font-size: 0.85rem; color: #cbd5e1; font-weight: bold; }
    .detected-parts-tags { display: flex; flex-wrap: wrap; gap: 0.4rem; max-width: 55%; }
    .part-pill {
      font-size: 0.68rem; padding: 0.25rem 0.6rem; border-radius: 4px;
      background: rgba(168, 85, 247, 0.15); border: 1px solid #9333ea; color: #e9d5ff;
      &.aml { background: rgba(16, 185, 129, 0.15); border-color: #10b981; color: #a7f3d0; }
      &.telecom { background: rgba(245, 158, 11, 0.15); border-color: #f59e0b; color: #fde68a; }
    }
    .legal-inference-note {
      margin-top: 0.75rem; font-size: 0.7rem; color: #cbd5e1; line-height: 1.6;
      border-top: 1px dashed rgba(148, 163, 184, 0.2); padding-top: 0.5rem;
      strong { color: #f59e0b; }
    }
    .visual-analytics-grid { display: grid; grid-template-columns: 1fr 1.2fr; gap: 1rem; margin-bottom: 1.2rem; }
    .chart-container-box { background: #111a2c; border: 1px solid #1e293b; border-radius: 6px; padding: 0.75rem; }
    .chart-title { font-size: 0.75rem; font-weight: bold; color: #cbd5e1; margin-bottom: 0.5rem; }
    .chart-canvas { width: 100%; height: 210px; }
    .section-title { font-size: 0.85rem; font-weight: bold; color: #38bdf8; margin-bottom: 0.6rem; display: flex; align-items: center; gap: 0.4rem; }
    .forensic-table {
      width: 100%; border-collapse: collapse; font-size: 0.72rem; margin-bottom: 1.5rem;
      th { background: #131d2e; color: #94a3b8; padding: 0.5rem; text-align: right; border-bottom: 2px solid #334155; }
      td { padding: 0.55rem 0.5rem; border-bottom: 1px solid #1e293b; }
      .mono { font-family: monospace; }
      .font-bold { font-weight: bold; }
      .desc-cell { max-width: 250px; }
      .badge {
        display: inline-block; padding: 0.15rem 0.45rem; border-radius: 3px; font-size: 0.65rem;
        &.danger { background: #7f1d1d; color: #fca5a5; }
        &.warning { background: #78350f; color: #fde68a; }
        &.purple { background: #581c87; color: #e9d5ff; }
      }
    }
    .paper-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #1e293b; padding-top: 1rem; }
    .sign-stamp {
      font-family: monospace; font-size: 0.7rem; color: #10b981; margin-top: 0.2rem;
      border: 1px dashed #10b981; padding: 0.2rem 0.5rem; border-radius: 4px; display: inline-block;
    }
    .sign-block span { font-size: 0.72rem; color: #94a3b8; }
    .actions { display: flex; gap: 0.6rem; }
    .btn {
      padding: 0.4rem 1rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer; font-weight: bold;
      &.print { background: #0284c7; border: 1px solid #38bdf8; color: white; }
      &.close { background: #334155; border: 1px solid #475569; color: #f1f5f9; }
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `]
})
export class ForensicReportModalComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('leftChartCanvas') leftChartCanvas!: ElementRef<HTMLDivElement>;
  @ViewChild('rightChartCanvas') rightChartCanvas!: ElementRef<HTMLDivElement>;
  private auditService = inject(AuditService);
  @Input() multiEntityData: any = null;
  @Input() isOpen = false;
  @Input() currentDomain: DomainReportType = 'CUSTOMS';
  @Input() caseId = '';
  @Input() targetNationalId = '';
  @Input() cottageNumber = '';
  @Input() threatScore = 95;
  @Output() closeRequested = new EventEmitter<void>();
// در تعریف متغیرهای کلاس ForensicReportModalComponent:
copilotOpen = signal<boolean>(false);
copilotLoading = signal<boolean>(false);
userPrompt = '';
chatMessages = signal<{ role: string; content: string }[]>([
  {
    role: 'assistant',
    content: 'سلام بازرس محترم. من دستیار هوشمند پرونده هستم. آماده پاسخ به ابهامات، بررسی کدهای تعرفه یا تشریح شگرد تخلف این شبکه می‌باشم.'
  }
]);

triggerAction

isExportingPdf = signal<boolean>(false);
toggleCopilot(): void {
  this.copilotOpen.update(v => !v);
}

async exportJudicialPdf(): Promise<void> {
    const element = document.getElementById('judicial-report-dossier');
    if (!element || this.isExportingPdf()) {
      console.warn('المان گزارش جهت چاپ PDF یافت نشد.');
      return;
    }

    this.isExportingPdf.set(true);

    try {
      // ذخیره موقت وضعیت اسکرول
      const prevOverflow = element.style.overflow;
      const prevMaxHeight = element.style.maxHeight;
      element.style.overflow = 'visible';
      element.style.maxHeight = 'none';

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#0b111e',
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight
      });

      // بازگرداندن وضعیت به حالت اولیه
      element.style.overflow = prevOverflow;
      element.style.maxHeight = prevMaxHeight;

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      // درج صفحه اول
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pageHeight;

      // افزودن صفحات بعدی در صورت طولانی بودن محتوا
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const caseRef = this.caseId || 'CASE-2026';
      pdf.save(`Dossier_Judicial_${caseRef}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('خطا در صدور PDF قضایی:', err);
    } finally {
      this.isExportingPdf.set(false);
    }
  }
predictiveData = signal<PredictiveMoveData | null>(null);
isPredicting = signal<boolean>(false);

fetchPrediction(): void {
    const targets = (this.multiEntityData?.targets && this.multiEntityData.targets.length > 0)
      ? this.multiEntityData.targets
      : [this.targetNationalId || '14001000260'];

    this.isPredicting.set(true);
    this.auditService.predictNextMove({
      identifiers: targets,
      evidences: this.dynamicCustomsItems || [],
      inferred_product: 'تلویزیون هوشمند LED سایز ۶۵ اینچ'
    }).subscribe({
      next: (data) => {
        this.predictiveData.set(data);
        this.isPredicting.set(false);
      },
      error: (err) => {
        console.error('خطای دریافت پیش‌بینی:', err);
        this.isPredicting.set(false);
      }
    });
  }

sendCopilotMessage(): void {
  const text = this.userPrompt.trim();
  if (!text || this.copilotLoading()) return;

  const current = this.chatMessages();
  this.chatMessages.set([...current, { role: 'user', content: text }]);
  this.userPrompt = '';
  this.copilotLoading.set(true);

  const targets = (this.multiEntityData?.targets && this.multiEntityData.targets.length > 0)
    ? this.multiEntityData.targets
    : [this.targetNationalId || '14001000484'];

  // استخراج تمام اقلامی که روی صفحه مودال دیده می‌شوند
  const itemsContext = (this.dynamicCustomsItems || this.customsItems).map((i: any) => ({
    part: i.desc,
    hsCode: i.hsCode,
    valUsd: i.valUsd,
    declaredDuty: i.declaredDuty,
    actualDuty: i.actualDuty
  }));

  this.auditService.askForensicCopilot({
    identifiers: targets,
    question: text,
    chat_history: current,
    // ارسال مستقیم کانتکست زنده صفحه
    nodes: itemsContext,
    inferred_finished_good: 'تلویزیون هوشمند LED سایز ۶۵ اینچ',
    inferred_hs_code: '85287200',
    total_val_usd: '$703,500'
  } as any).subscribe({
    next: (res) => {
      this.chatMessages.update(msgs => [...msgs, { role: 'assistant', content: res.answer }]);
      this.copilotLoading.set(false);
    },
    error: () => {
      this.chatMessages.update(msgs => [...msgs, {
        role: 'assistant',
        content: 'خطا در ارتباط با مدل زبانی.'
      }]);
      this.copilotLoading.set(false);
    }
  });
}
  private http = inject(HttpClient);

  aiAnalysis = signal<string>('');
  isAiGenerating = signal<boolean>(false);

  private leftChart: echarts.ECharts | null = null;
  private rightChart: echarts.ECharts | null = null;

  customsItems = [
    { row: 1, desc: 'ماژول پردازشی اصلی مادربرد اسمبل نشده', hsCode: '85423100', weight: 1450, valUsd: 485000, declaredDuty: 5, actualDuty: 26, status: 'تفکیک قطعات (CKD)' },
    { row: 2, desc: 'پنل نمایشگر تصویر Open-Cell', hsCode: '85299065', weight: 3200, valUsd: 112000, declaredDuty: 5, actualDuty: 26, status: 'انحراف تعرفه به ۵٪' },
    { row: 3, desc: 'فریم و اسکلت فلزی بدنه تلویزیون', hsCode: '76169990', weight: 890, valUsd: 88500, declaredDuty: 5, actualDuty: 26, status: 'قطعه وابسته بدنه' },
    { row: 4, desc: 'کابل و اسپیکرهای استریو داخلی', hsCode: '85444290', weight: 320, valUsd: 18000, declaredDuty: 5, actualDuty: 26, status: 'ملحقات صوتی' }
  ];

  bankingItems = [
    { row: 1, account: 'IR650170000000140029381', bank: 'بانک ملت', amountRials: 185000000000, retentionTime: '۳ دقیقه و ۲۰ ثانیه', risk: 98, type: 'حساب واسط سریع (Rapid Mule)' },
    { row: 2, account: 'IR890120000000140087412', bank: 'بانک صادرات', amountRials: 142000000000, retentionTime: '۴ دقیقه و ۴۰ ثانیه', risk: 94, type: 'تغذیه صرافی مرزی' },
    { row: 3, account: 'IR120190000000140055210', bank: 'بانک تجارت', amountRials: 98000000000, retentionTime: '۲ دقیقه و ۱۵ ثانیه', risk: 91, type: 'حساب قرض‌الحسنه نامتعارف' }
  ];

  telecomItems = [
    { row: 1, imsi: '432110098412431', imei: '864209041284710', duration: 42800, cellId: 'BTS-TEH-EAST-402', mobility: 'صفر (بدون تحرک)', detection: 'ترمینیشن قاچاق VoIP' },
    { row: 2, imsi: '432110098412432', imei: '864209041284710', duration: 38900, cellId: 'BTS-TEH-EAST-402', mobility: 'صفر (بدون تحرک)', detection: 'کانال فعال سیم‌باکس' },
    { row: 3, imsi: '432110098412433', imei: '864209041284710', duration: 41200, cellId: 'BTS-TEH-EAST-402', mobility: 'صفر (بدون تحرک)', detection: 'کانال فعال سیم‌باکس' }
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']) {
      if (this.isOpen) {
        this.fetchAiNarrative();
        this.fetchPrediction(); // 👈 فراخوانی متد پیش‌بینی هوشمند
        setTimeout(() => this.initAndRenderCharts(), 100);
      } else {
        this.disposeCharts();
      }
    } else if (this.isOpen && changes['currentDomain']) {
      setTimeout(() => this.initAndRenderCharts(), 50);
    }
  }

  ngAfterViewInit(): void {
    if (this.isOpen) {
      setTimeout(() => this.initAndRenderCharts(), 100);
    }
  }

  ngOnDestroy(): void {
    this.disposeCharts();
  }

  // در forensic-report-modal.component.ts

// تبدیل شواهد واقعی دریافتی از دیتابیس به سطرهای جدول
get dynamicCustomsItems() {
  if (!this.multiEntityData?.evidences?.length) {
    return this.customsItems; // fallback در صورت نبود دیتا
  }

  return this.multiEntityData.evidences.map((e: any, idx: number) => ({
    row: idx + 1,
    desc: e.description || e.title,
    hsCode: e.referenceNumber?.replace('DOC_', '') || 'نامشخص',
    weight: 1200 + (idx * 350),
    valUsd: Math.round((e.financialValueIrr || 145000000000) / 500000),
    declaredDuty: 5,
    actualDuty: 26,
    status: 'تفکیک قطعات (CKD)'
  }));
}
  fetchAiNarrative(): void {
    if (!this.multiEntityData?.isMultiTarget || !this.multiEntityData?.targets?.length) {
      return;
    }

    this.isAiGenerating.set(true);

    // ۲. فراخوانی از طریق سرویس متمرکز
    this.auditService.getForensicDossierNarrative(this.multiEntityData.targets).subscribe({
      next: (res: ForensicNarrativeResponse) => {
        this.aiAnalysis.set(res.summaryNarrative || 'تحلیلی دریافت نشد.');
        this.isAiGenerating.set(false);
      },
      error: () => {
        this.aiAnalysis.set('خطا در دریافت تحلیل کارشناسی از سرور.');
        this.isAiGenerating.set(false);
      }
    });
  }

  private disposeCharts(): void {
    if (this.leftChart) {
      this.leftChart.dispose();
      this.leftChart = null;
    }
    if (this.rightChart) {
      this.rightChart.dispose();
      this.rightChart = null;
    }
  }

  private initAndRenderCharts(): void {
    if (!this.leftChartCanvas?.nativeElement || !this.rightChartCanvas?.nativeElement) {
      return;
    }

    this.disposeCharts();

    this.leftChart = echarts.init(this.leftChartCanvas.nativeElement);
    this.rightChart = echarts.init(this.rightChartCanvas.nativeElement);

    if (this.currentDomain === 'CUSTOMS') {
      this.renderCustomsCharts();
    } else if (this.currentDomain === 'BANKING') {
      this.renderBankingCharts();
    } else {
      this.renderTelecomCharts();
    }

    requestAnimationFrame(() => {
      this.leftChart?.resize();
      this.rightChart?.resize();
    });
  }

  getDomainTitle(): string {
    switch (this.currentDomain) {
      case 'BANKING': return 'مبارزه با پولشویی و تراکنش‌های مشکوک مالی (AML)';
      case 'TELECOM': return 'پایش داده‌های مخابراتی، CDR و کشف سیم‌باکس';
      default: return 'تطبیق تجارت فرامرزی و ارزش‌گذاری گمرکی';
    }
  }

  getThreatDescription(): string {
    switch (this.currentDomain) {
      case 'BANKING': return 'الگوی تخلیه فوق‌سریع و استفاده از هویت اشخاص بی‌بضاعت';
      case 'TELECOM': return 'تولید ترافیک غیرمجاز بین‌الملل و دور زدن گیت‌وی قانونی کشور';
      default: return 'عدم رفع تعهد ارزی و دور زدن مأخذ حقوق ورودی با قاعده ۲-الف';
    }
  }

  getFinancialOrTrafficVolume(): string {
    switch (this.currentDomain) {
      case 'BANKING': return '۴۲۵ میلیارد ریال';
      case 'TELECOM': return '۱۲۲,۹۰۰ دقیقه';
      default: return '$۷۰۳,۵۰۰ دلار';
    }
  }

  getTrackIdentifier(): string {
    switch (this.currentDomain) {
      case 'BANKING': return '۳ حساب اجاره‌ای';
      case 'TELECOM': return 'BTS-TEH-EAST-402';
      default: return this.cottageNumber || '099984';
    }
  }

  getLeftChartTitle(): string {
    switch (this.currentDomain) {
      case 'BANKING': return '📊 توزیع حجم پولشویی میان حساب‌های واسط (Mule Accounts)';
      case 'TELECOM': return '📊 سهم دقایق ترافیک قاچاق روی هر اسلات سیم‌باکس';
      default: return '📊 سهم ارزش دلاری هر زیرکالا در کوتاژ گمرکی';
    }
  }

  getRightChartTitle(): string {
    switch (this.currentDomain) {
      case 'BANKING': return '⚡ سرعت خروج وجه از زمان واریز به حساب‌ها (ثانیه)';
      case 'TELECOM': return '📈 توزیع ساعتی تماس‌های همزمان سیم‌باکس (ترافیک رباتیک)';
      default: return '⚠️ شکاف حقوق ورودی (مأخذ اظهارشده در برابر واقعی ۲۶٪)';
    }
  }

  getTableTitle(): string {
    switch (this.currentDomain) {
      case 'BANKING': return 'ردیابی جریان مالی حساب‌های واسط شناسایی‌شده (Mule Ledger)';
      case 'TELECOM': return 'گزارش وقایع و لاگ‌های مخابراتی دکل کانونی (CDR Forensics)';
      default: return 'فهرست اقلام اظهارنامه و تحلیل کدهای تعرفه (HS Code Audit)';
    }
  }

  private renderCustomsCharts(): void {
    this.leftChart?.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: '{b}: ${c} ({d}%)' },
      series: [{
        type: 'pie',
        radius: ['45%', '75%'],
        itemStyle: { borderRadius: 4, borderColor: '#0b111e', borderWidth: 2 },
        label: { show: true, position: 'inside', formatter: '{d}%', fontSize: 10, color: '#fff' },
        data: this.customsItems.map(i => ({ name: i.desc.slice(0, 15) + '...', value: i.valUsd }))
      }]
    }, true);

    this.rightChart?.setOption({
      backgroundColor: 'transparent',
      legend: { data: ['مأخذ اظهاری (۵٪)', 'مأخذ واقعی تلویزیون (۲۶٪)'], textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { top: 35, right: 15, bottom: 25, left: 35 },
      xAxis: { type: 'category', data: this.customsItems.map(i => i.hsCode), axisLabel: { color: '#94a3b8', fontSize: 9 } },
      yAxis: { type: 'value', axisLabel: { formatter: '{value}٪', color: '#64748b' }, splitLine: { lineStyle: { color: '#1e293b' } } },
      series: [
        { name: 'مأخذ اظهاری (۵٪)', type: 'bar', data: this.customsItems.map(i => i.declaredDuty), itemStyle: { color: '#0284c7' }, barWidth: 14 },
        { name: 'مأخذ واقعی تلویزیون (۲۶٪)', type: 'bar', data: this.customsItems.map(i => i.actualDuty), itemStyle: { color: '#ef4444' }, barWidth: 14 }
      ]
    }, true);
  }

  private renderBankingCharts(): void {
    this.leftChart?.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: '{b}: {c} میلیارد ریال' },
      series: [{
        type: 'pie',
        radius: ['45%', '75%'],
        itemStyle: { borderRadius: 4, borderColor: '#0b111e', borderWidth: 2 },
        label: { show: true, position: 'inside', formatter: '{d}%', fontSize: 10, color: '#fff' },
        data: this.bankingItems.map(i => ({ name: i.bank, value: i.amountRials / 1000000000 }))
      }]
    }, true);

    this.rightChart?.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      grid: { top: 35, right: 15, bottom: 25, left: 45 },
      xAxis: { type: 'category', data: ['حساب ملت', 'حساب صادرات', 'حساب تجارت'], axisLabel: { color: '#94a3b8', fontSize: 9 } },
      yAxis: { type: 'value', axisLabel: { formatter: '{value} ثانیه', color: '#64748b' }, splitLine: { lineStyle: { color: '#1e293b' } } },
      series: [{
        name: 'سرعت تخلیه حساب',
        type: 'bar',
        data: [200, 280, 135],
        itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] },
        barWidth: 20
      }]
    }, true);
  }

  private renderTelecomCharts(): void {
    this.leftChart?.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: '{b}: {c} دقیقه' },
      series: [{
        type: 'pie',
        radius: ['45%', '75%'],
        itemStyle: { borderRadius: 4, borderColor: '#0b111e', borderWidth: 2 },
        label: { show: true, position: 'inside', formatter: '{d}%', fontSize: 10, color: '#fff' },
        data: this.telecomItems.map((i, idx) => ({ name: `کانال ${idx + 1}`, value: i.duration }))
      }]
    }, true);

    this.rightChart?.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      grid: { top: 35, right: 15, bottom: 25, left: 35 },
      xAxis: { type: 'category', data: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'], axisLabel: { color: '#94a3b8', fontSize: 9 } },
      yAxis: { type: 'value', axisLabel: { color: '#64748b' }, splitLine: { lineStyle: { color: '#1e293b' } } },
      series: [{
        name: 'تعداد مکالمات همزمان رباتیک',
        type: 'line',
        smooth: true,
        data: [450, 480, 520, 610, 580, 640],
        lineStyle: { color: '#f59e0b', width: 3 },
        areaStyle: { color: 'rgba(245, 158, 11, 0.2)' }
      }]
    }, true);
  }

  close(): void {
    this.disposeCharts();
    this.closeRequested.emit();
  }

  printReport(): void {
    window.print();
  }
}