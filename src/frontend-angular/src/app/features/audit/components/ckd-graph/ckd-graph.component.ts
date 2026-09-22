import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CkdCase } from '../../../../core/models/discrepancy.model';

@Component({
  selector: 'app-ckd-graph',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ckd-container" *ngIf="ckdCase">
      <!-- هدر دیاگرام -->
      <div class="ckd-header">
        <div class="header-right">
          <h3>
            <span class="icon">❄</span>
            شبکه ارتباطی پرونده تفکیک قطعات (CKD Assembly Graph)
          </h3>
          <p>کشف تجمیعی ثبت‌سفارش‌های منفصل با هدف فرار از تعرفه کالای کامل</p>
        </div>
        <div class="header-left">
          <span class="risk-label">نمره ریسک تجمیعی: <strong class="risk-score">۹۵٪</strong></span>
        </div>
      </div>

      <!-- ساختار درختی دیاگرام -->
      <div class="tree-wrapper">
        
        <!-- ۱. گره بالایی: شرکت واردکننده -->
        <div class="tree-node top-node">
          <div class="node-title">شرکت واردکننده</div>
          <div class="node-subtitle">{{ ckdCase.importerName }}</div>
          <div class="node-meta font-mono">شناسه ملی: {{ ckdCase.importerId }}</div>
        </div>

        <!-- خط عمودی اتصال دهنده ۱ -->
        <div class="vertical-connector"></div>

        <!-- ۲. گره میانی: محصول هدف BOM -->
        <div class="tree-node middle-node">
          <div class="node-title target-title">محصول نهایی شناسایی‌شده (BOM Target)</div>
          <div class="node-subtitle">{{ ckdCase.targetProduct }}</div>
          <div class="node-meta highlight-meta">
            تطبیق ۱۰۰٪ اجزا • ارزش کل: 
            <span class="font-mono">{{ ckdCase.totalValue | number }} $</span>
          </div>
        </div>

        <!-- خط عمودی خروجی از گره میانی -->
        <div class="vertical-connector-red"></div>

        <!-- خط افقی انشعاب (Bus Line) -->
        <div class="bus-line-container" *ngIf="ckdCase.parts && ckdCase.parts.length > 0">
          <div class="horizontal-bus"></div>
          
          <!-- گره‌های پایینی: قطعات و کوتاژهای ترخیص‌شده -->
          <div class="bottom-nodes-row">
            <div class="bottom-node-branch" *ngFor="let part of ckdCase.parts">
              <div class="branch-connector"></div>
              <div class="tree-node bottom-node">
                <div class="part-order-id font-mono">{{ part.orderNo }}</div>
                <div class="part-desc">{{ part.partName }}</div>
                <div class="part-meta font-mono">
                  <span>HS: {{ part.hsCode }}</span>
                  <span>{{ part.valUsd | number }} $</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .ckd-container {
      background: #080e1a;
      border: 1px solid #1e293b;
      border-radius: 12px;
      margin-top: 1.5rem;
      padding: 1.5rem;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
      color: #f8fafc;
      direction: rtl;
    }

    .ckd-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 1.25rem;
      margin-bottom: 2.5rem;

      .header-right {
        h3 {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #f8fafc;
          .icon { color: #94a3b8; font-size: 1.2rem; }
        }
        p {
          margin: 0.35rem 0 0;
          font-size: 0.78rem;
          color: #94a3b8;
        }
      }

      .header-left {
        font-size: 0.95rem;
        color: #e2e8f0;
        .risk-score { color: #f87171; font-weight: 800; font-family: monospace; }
      }
    }

    /* درخت دیاگرام */
    .tree-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      overflow-x: auto;
      padding: 1rem 0 2rem;
    }

    .tree-node {
      border-radius: 8px;
      text-align: center;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
      transition: transform 0.2s;
      z-index: 2;

      &:hover { transform: translateY(-2px); }
    }

    /* گره بالایی */
    .top-node {
      background: #172439;
      border: 1px solid #2d4566;
      padding: 1.2rem 2.5rem;
      min-width: 320px;

      .node-title { font-size: 0.82rem; color: #94a3b8; margin-bottom: 0.3rem; }
      .node-subtitle { font-size: 0.95rem; font-weight: 700; color: #f8fafc; }
      .node-meta { font-size: 0.85rem; color: #cbd5e1; margin-top: 0.4rem; }
    }

    /* گره میانی */
    .middle-node {
      background: #0f1c29;
      border: 1px solid #059669;
      box-shadow: 0 0 15px rgba(5, 150, 105, 0.2);
      padding: 1.2rem 3rem;
      min-width: 420px;

      .target-title { font-size: 0.85rem; font-weight: 700; color: #34d399; margin-bottom: 0.3rem; }
      .node-subtitle { font-size: 0.9rem; color: #e2e8f0; }
      .highlight-meta {
        margin-top: 0.6rem;
        font-size: 0.85rem;
        color: #6ee7b7;
        font-weight: 600;
        span { color: #ffffff; }
      }
    }

    /* گره‌های پایینی */
    .bottom-node {
      background: #111a28;
      border: 1px solid #334155;
      border-top: 3px solid #ef4444;
      padding: 1rem 0.8rem;
      width: 200px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 125px;

      .part-order-id {
        font-size: 0.85rem;
        font-weight: 700;
        color: #f8fafc;
        margin-bottom: 0.5rem;
      }
      .part-desc {
        font-size: 0.78rem;
        color: #cbd5e1;
        line-height: 1.4;
        margin-bottom: 0.6rem;
      }
      .part-meta {
        display: flex;
        justify-content: space-between;
        font-size: 0.75rem;
        color: #94a3b8;
        border-top: 1px solid #1e293b;
        padding-top: 0.5rem;
        span:last-child { color: #fca5a5; font-weight: 600; }
      }
    }

    /* کانکتورها و خطوط انشعاب */
    .vertical-connector {
      width: 2px;
      height: 38px;
      background: #3b82f6;
    }

    .vertical-connector-red {
      width: 2px;
      height: 35px;
      background: #ef4444;
    }

    .bus-line-container {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
    }

    .bottom-nodes-row {
      display: flex;
      justify-content: center;
      gap: 1.5rem;
      width: 100%;
      position: relative;
    }

    .bottom-node-branch {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
    }

    .branch-connector {
      width: 2px;
      height: 25px;
      background: #ef4444;
    }

    /* خط افقی سراسری بین اولین و آخرین گره پایینی */
    .horizontal-bus {
      position: absolute;
      top: 0;
      height: 2px;
      background: #ef4444;
      left: 105px;
      right: 105px;
      z-index: 1;
    }
  `]
})
export class CkdGraphComponent {
  @Input() ckdCase!: CkdCase;
  
}