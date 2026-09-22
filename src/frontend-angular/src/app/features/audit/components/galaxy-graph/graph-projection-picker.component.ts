import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-graph-projection-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="projection-panel">
      <div class="panel-header">
        <h4>🎛️ پیکربندی استخراج ستون‌های گراف تلفیقی (Field Projection)</h4>
        <p>مشخص کنید از هر منبع اطلاعاتی چه مشخصه‌هایی در رسم شبکه ذی‌نفعان منظور شوند:</p>
      </div>

      <div class="sources-grid">
        <!-- حوزه گمرک -->
        <div class="source-box customs">
          <h5>🛃 اسناد گمرکی (Customs)</h5>
          <label><input type="checkbox" [(ngModel)]="fields.customs.orderNo"> شماره ثبت‌سفارش (گره سند)</label>
          <label><input type="checkbox" [(ngModel)]="fields.customs.cottageNo"> کوتاژ ترخیص</label>
          <label><input type="checkbox" [(ngModel)]="fields.customs.totalUsd"> ارزش دلاری (وزن یال)</label>
          <label><input type="checkbox" [(ngModel)]="fields.customs.goodsDescription"> شرح کالا (HS Description)</label>
        </div>

        <!-- حوزه بانکی -->
        <div class="source-box banking">
          <h5>💳 تراکنش‌های بانکی (Core/AML)</h5>
          <label><input type="checkbox" [(ngModel)]="fields.banking.sourceAccount"> حساب مبدأ (گره اصلی)</label>
          <label><input type="checkbox" [(ngModel)]="fields.banking.destAccount"> حساب مقصد / واسط (گره مقصد)</label>
          <label><input type="checkbox" [(ngModel)]="fields.banking.amount"> مبلغ واریز (برچسب یال)</label>
          <label><input type="checkbox" [(ngModel)]="fields.banking.rrn"> کد پیگیری / مرجع (RRN)</label>
        </div>

        <!-- حوزه مخابرات -->
        <div class="source-box telecom">
          <h5>📡 دیتای مخابرات (CDR / Switch)</h5>
          <label><input type="checkbox" [(ngModel)]="fields.telecom.callerMsisdn"> شماره سیم‌کارت فرد (MSISDN)</label>
          <label><input type="checkbox" [(ngModel)]="fields.telecom.receiverMsisdn"> شماره‌های مخاطبین</label>
          <label><input type="checkbox" [(ngModel)]="fields.telecom.duration"> مدت زمان تماس (ثانیه)</label>
          <label><input type="checkbox" [(ngModel)]="fields.telecom.cellId"> شناسه دکل / موقعیت مکانی (Cell ID)</label>
        </div>
      </div>

      <div class="panel-footer">
        <button class="apply-projection-btn" (click)="emitConfig()">
          ⚡ بازسازی و چینش مجدد گراف بر اساس ستون‌های منتخب
        </button>
      </div>
    </div>
  `,
  styles: [`
    .projection-panel {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 1rem 1.25rem;
      margin-bottom: 1.5rem;
      direction: rtl;
    }
    .panel-header h4 { margin: 0; color: #f8fafc; font-size: 0.95rem; }
    .panel-header p { margin: 0.2rem 0 0.8rem; color: #94a3b8; font-size: 0.78rem; }
    .sources-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
    }
    .source-box {
      background: #1e293b;
      padding: 0.75rem;
      border-radius: 8px;
      border-top: 3px solid #64748b;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;

      h5 { margin: 0 0 0.4rem; font-size: 0.82rem; color: #f1f5f9; }
      label { font-size: 0.75rem; color: #cbd5e1; cursor: pointer; display: flex; align-items: center; gap: 0.4rem; }
      input[type="checkbox"] { cursor: pointer; }
    }
    .source-box.customs { border-top-color: #8b5cf6; }
    .source-box.banking { border-top-color: #10b981; }
    .source-box.telecom { border-top-color: #06b6d4; }
    .panel-footer { margin-top: 0.9rem; text-align: left; }
    .apply-projection-btn {
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 0.45rem 1rem;
      font-size: 0.8rem;
      cursor: pointer;
      transition: background 0.2s;
      &:hover { background: #1d4ed8; }
    }
  `]
})
export class GraphProjectionPickerComponent implements OnInit {
  @Output() configChanged = new EventEmitter<any>();

  fields = {
    customs: { orderNo: true, cottageNo: true, totalUsd: true, goodsDescription: false },
    banking: { sourceAccount: true, destAccount: true, amount: true, rrn: false },
    telecom: { callerMsisdn: true, receiverMsisdn: true, duration: true, cellId: false }
  };

  ngOnInit(): void {
    // مقداردهی اولیه به محض بارگذاری
    this.emitConfig();
  }

  emitConfig(): void {
    // ارسال یک کلون از آبجکت برای تحریک تغییرات ایمیوتبل
    this.configChanged.emit({ ...JSON.parse(JSON.stringify(this.fields)) });
  }
}