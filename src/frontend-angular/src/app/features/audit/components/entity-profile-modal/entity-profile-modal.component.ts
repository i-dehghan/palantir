import { Component, Input, Output, EventEmitter, signal, AfterViewInit, ViewChild, ElementRef, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as echarts from 'echarts';

@Component({
  selector: 'app-entity-profile-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal-backdrop" *ngIf="isOpen" (click)="closeModal()">
      <div class="entity-profile-container" (click)="$event.stopPropagation()">
        
        <!-- هدر پروفایل سوژه -->
        <header class="profile-header">
          <div class="header-right">
            <span class="entity-avatar-icon">🏢</span>
            <div class="title-block">
              <h3>پرونده و بوم تحلیلی مستقل سوژه (Entity Dossier Studio)</h3>
              <span class="nid-badge font-mono">شناسه ملی / کد ملی تحت رصد: {{ nationalId }}</span>
            </div>
          </div>
          <button class="close-btn" (click)="closeModal()">×</button>
        </header>

        <!-- نوار تب‌های تخصصی گمرکی، بانکی، گراف و نقشه -->
        <div class="profile-tabs-bar">
          <button class="p-tab" [class.active]="activeTab() === 'OVERVIEW'" (click)="activeTab.set('OVERVIEW')">
            📊 نمای کلی و ریسک
          </button>
          <button class="p-tab" [class.active]="activeTab() === 'GRAPH'" (click)="activeTab.set('GRAPH'); initEntityGraph()">
            🕸️ گراف پیوندی سوژه (Link Graph)
          </button>
          <button class="p-tab" [class.active]="activeTab() === 'MAP'" (click)="activeTab.set('MAP')">
            🗺️ نقشه و مسیرهای ترانزیت (GIS)
          </button>
          <button class="p-tab" [class.active]="activeTab() === 'CUSTOMS'" (click)="activeTab.set('CUSTOMS')">
            🛃 گمرک و کوتاژها
          </button>
          <button class="p-tab" [class.active]="activeTab() === 'BANKING'" (click)="activeTab.set('BANKING')">
            💳 تراکنش‌های AML
          </button>
        </div>

        <!-- بدنه محتوای تب‌ها -->
        <div class="profile-content-body">
          
          <!-- نمای کلی -->
          <div *ngIf="activeTab() === 'OVERVIEW'" class="tab-pane">
            <div class="metrics-grid">
              <div class="m-card">
                <span class="label">شاخص تجمیعی ریسک</span>
                <div class="val danger">۹۶٪ (سطح بحرانی)</div>
              </div>
              <div class="m-card">
                <span class="label">کل پرونده‌های فعال</span>
                <div class="val text-cyan">۱۴ مورد</div>
              </div>
              <div class="m-card">
                <span class="label">گردش مالی رصدشده</span>
                <div class="val text-amber">۴۲۵ میلیارد ریال</div>
              </div>
            </div>
            <div class="summary-box">
              <h4>تحلیل جامع هوش مصنوعی دیده‌بان برای این سوژه</h4>
              <p>این شرکت/شخص با شناسه ملی {{ nationalId }} به عنوان مهره اصلی در شبکه ترخیص قطعات منفصله و تخلیه سریع وجوه از طریق حساب‌های واسط (Mule) شناسایی شده است.</p>
            </div>
          </div>

          <!-- تب گراف پیوندی اختصاصی سوژه -->
          <div *ngIf="activeTab() === 'GRAPH'" class="tab-pane full-height">
            <div #entityGraphCanvas class="embedded-canvas"></div>
          </div>

          <!-- تب نقشه GIS اختصاصی سوژه -->
          <div *ngIf="activeTab() === 'MAP'" class="tab-pane full-height">
            <div class="map-stub-container">
              <div class="map-hud-overlay">
                <span>📍 ردیابی جغرافیایی و دکل‌های سلولی مرتبط با کدملی: {{ nationalId }}</span>
              </div>
              <div class="fake-map-view">
                <div class="pulse-point" style="top: 45%; left: 52%;"></div>
                <span class="map-label" style="top: 49%; left: 48%;">موقعیت ترانزیتی گمرک شهید رجایی / بندرعباس</span>
              </div>
            </div>
          </div>

          <!-- امور گمرکی -->
          <div *ngIf="activeTab() === 'CUSTOMS'" class="tab-pane">
            <h4 class="pane-title">فهرست کوتاژها و اظهارنامه‌های گمرکی این سوژه</h4>
            <div class="data-list-box">
              <div class="data-row" *ngFor="let c of customsRecords">
                <span class="font-mono accent">{{ c.cottage }}</span>
                <span>{{ c.goods }}</span>
                <span class="font-mono">{{ c.value }}</span>
                <span class="badge danger">{{ c.status }}</span>
              </div>
            </div>
          </div>

          <!-- امور بانکی و AML -->
          <div *ngIf="activeTab() === 'BANKING'" class="tab-pane">
            <h4 class="pane-title">شبکه حساب‌های واسط و تراکنش‌های مرتبط</h4>
            <div class="data-list-box">
              <div class="data-row" *ngFor="let b of bankingRecords">
                <span class="font-mono">{{ b.account }}</span>
                <span>{{ b.bank }}</span>
                <span class="font-mono">{{ b.amount }} ریال</span>
                <span class="badge warning">{{ b.type }}</span>
              </div>
            </div>
          </div>

        </div>

        <footer class="profile-footer">
          <button class="close-profile-btn" (click)="closeModal()">بستن شناسنامه سوژه</button>
        </footer>

      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(3, 7, 18, 0.88);
      backdrop-filter: blur(6px); z-index: 100000;
      display: flex; align-items: center; justify-content: center;
      direction: rtl; text-align: right;
    }
    .entity-profile-container {
      width: 1050px; max-width: 96vw; height: 680px; background: #0b111e; border: 1px solid #1e293b;
      border-radius: 8px; box-shadow: 0 25px 50px rgba(0,0,0,0.85); display: flex; flex-direction: column; overflow: hidden;
    }
    .profile-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 0.8rem 1.2rem; background: #0f172a; border-bottom: 1px solid #1e293b;
      .header-right { display: flex; align-items: center; gap: 0.8rem; .entity-avatar-icon { font-size: 1.8rem; } }
      h3 { margin: 0; color: #f8fafc; font-size: 0.95rem; font-weight: bold; }
      .nid-badge { font-size: 0.72rem; color: #38bdf8; display: block; margin-top: 2px; }
      .close-btn { background: none; border: none; color: #94a3b8; font-size: 1.3rem; cursor: pointer; &:hover { color: #ef4444; } }
    }
    .profile-tabs-bar {
      display: flex; background: #131d2e; border-bottom: 1px solid #1e293b; padding: 0 1rem; gap: 0.4rem;
      .p-tab {
        background: transparent; border: none; color: #94a3b8; padding: 0.6rem 0.9rem;
        font-size: 0.72rem; cursor: pointer; border-bottom: 2px solid transparent; font-family: inherit;
        &:hover { color: #f8fafc; }
        &.active { color: #38bdf8; border-bottom-color: #38bdf8; font-weight: bold; background: rgba(56, 189, 248, 0.05); }
      }
    }
    .profile-content-body {
      padding: 1rem; flex: 1; overflow-y: auto; color: #e2e8f0; font-size: 0.8rem; display: flex; flex-direction: column;
      .tab-pane {
        flex: 1; display: flex; flex-direction: column;
        &.full-height { height: 100%; min-height: 420px; }
      }
      .embedded-canvas { width: 100%; height: 100%; min-height: 420px; background: #070b12; border-radius: 6px; }
      
      .map-stub-container {
        position: relative; width: 100%; height: 100%; min-height: 420px; background: #05080f; border-radius: 6px; border: 1px solid #1e293b; overflow: hidden;
        .map-hud-overlay { position: absolute; top: 10px; right: 10px; background: rgba(15,23,42,0.9); padding: 4px 10px; border-radius: 4px; font-size: 0.7rem; color: #38bdf8; border: 1px solid #334155; z-index: 10; }
        .fake-map-view { width: 100%; height: 100%; background: radial-gradient(circle at center, #0f172a 0%, #020617 100%); position: relative; }
        .pulse-point { position: absolute; width: 16px; height: 16px; background: #ef4444; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 20px #ef4444; animation: pulseRing 1.5s infinite; }
        .map-label { position: absolute; transform: translate(-50%, -50%); font-size: 0.7rem; color: #fca5a5; font-weight: bold; background: rgba(0,0,0,0.6); padding: 2px 6px; border-radius: 3px; }
      }

      .metrics-grid {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.8rem; margin-bottom: 1rem;
        .m-card {
          background: #131d2e; border: 1px solid #1e293b; padding: 0.8rem; border-radius: 6px;
          .label { font-size: 0.68rem; color: #94a3b8; display: block; margin-bottom: 0.3rem; }
          .val { font-size: 1.1rem; font-weight: bold; font-family: monospace; &.danger { color: #ef4444; } }
        }
      }
      .summary-box {
        background: #070b12; border: 1px solid #1e293b; padding: 1rem; border-radius: 6px;
        h4 { margin: 0 0 0.5rem 0; color: #38bdf8; font-size: 0.85rem; }
        p { margin: 0; line-height: 1.6; color: #cbd5e1; font-size: 0.76rem; }
      }
      .pane-title { font-size: 0.85rem; color: #38bdf8; margin-bottom: 0.8rem; font-weight: bold; }
      .data-list-box {
        display: flex; flex-direction: column; gap: 0.5rem;
        .data-row {
          display: grid; grid-template-columns: 1.2fr 1.8fr 1.2fr 120px; align-items: center;
          background: #111a2c; padding: 0.6rem 0.8rem; border-radius: 4px; border: 1px solid #1e293b; font-size: 0.75rem;
          .accent { color: #f59e0b; font-weight: bold; }
          .badge { font-size: 0.65rem; padding: 0.2rem 0.5rem; border-radius: 3px; text-align: center; &.danger { background: #7f1d1d; color: #fca5a5; } &.warning { background: #78350f; color: #fde68a; } }
        }
      }
    }
    .profile-footer {
      padding: 0.8rem 1.2rem; background: #0f172a; border-top: 1px solid #1e293b; display: flex; justify-content: flex-end;
      .close-profile-btn { background: #334155; color: white; border: none; padding: 0.4rem 1rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer; font-weight: bold; &:hover { background: #475569; } }
    }
    @keyframes pulseRing {
      0% { transform: translate(-50%, -50%) scale(0.9); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
    }
  `]
})
export class EntityProfileModalComponent implements AfterViewInit, OnChanges {
  @Input() isOpen = false;
  @Input() nationalId = '';
  @Output() closeRequested = new EventEmitter<void>();

  @ViewChild('entityGraphCanvas') entityGraphCanvas!: ElementRef<HTMLDivElement>;
  private entityChart: echarts.ECharts | null = null;

  activeTab = signal<'OVERVIEW' | 'GRAPH' | 'MAP' | 'CUSTOMS' | 'BANKING'>('OVERVIEW');

  customsRecords = [
    { cottage: 'NTSW-100K-9984', goods: 'ماژول‌های پردازشی الکترونیکی', value: '$۱۱۲,۰۰۰', status: 'مغایرت قاعده ۲-الف' },
    { cottage: 'NTSW-100K-9980', goods: 'فریم و اسکلت فلزی بدنه', value: '$۸۸,۵۰۰', status: 'انحراف تعرفه' }
  ];

  bankingRecords = [
    { account: 'IR650170000000140029381', bank: 'بانک ملت', amount: '۱۸۵,۰۰۰,۰۰۰,۰۰۰', type: 'حساب واسط سریع' },
    { account: 'IR890120000000140087412', bank: 'بانک صادرات', amount: '۱۴۲,۰۰۰,۰۰۰,۰۰۰', type: 'تغذیه صرافی مرزی' }
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen && this.activeTab() === 'GRAPH') {
      setTimeout(() => this.initEntityGraph(), 100);
    }
  }

  ngAfterViewInit(): void {
    if (this.isOpen && this.activeTab() === 'GRAPH') {
      setTimeout(() => this.initEntityGraph(), 100);
    }
  }

  initEntityGraph(): void {
    if (!this.entityGraphCanvas?.nativeElement) return;
    if (this.entityChart) {
      this.entityChart.dispose();
    }

    this.entityChart = echarts.init(this.entityGraphCanvas.nativeElement);

    const nodes = [
      { id: 'ROOT', name: `کد ملی: ${this.nationalId}`, category: 0, symbolSize: 45, itemStyle: { color: '#ef4444' } },
      { id: 'DOC1', name: 'کوتاژ ۹۹۸۴ (قطعات)', category: 1, symbolSize: 30, itemStyle: { color: '#38bdf8' } },
      { id: 'DOC2', name: 'کوتاژ ۹۹۸۰ (بدنه)', category: 1, symbolSize: 30, itemStyle: { color: '#38bdf8' } },
      { id: 'ACC1', name: 'حساب واسط ملت', category: 2, symbolSize: 32, itemStyle: { color: '#10b981' } },
      { id: 'TEL1', name: 'دکل مخابراتی BTS', category: 3, symbolSize: 28, itemStyle: { color: '#f59e0b' } }
    ];

    const links = [
      { source: 'ROOT', target: 'DOC1', value: 'اظهار واردات' },
      { source: 'ROOT', target: 'DOC2', value: 'اظهار واردات' },
      { source: 'ROOT', target: 'ACC1', value: 'تراکنش پایا/ساتنا' },
      { source: 'ROOT', target: 'TEL1', value: 'فعال‌سازی خط' }
    ];

    this.entityChart.setOption({
      backgroundColor: '#070b12',
      tooltip: {},
      series: [{
        type: 'graph',
        layout: 'force',
        data: nodes,
        links: links,
        roam: true,
        label: { show: true, position: 'bottom', color: '#f8fafc', fontSize: 10 },
        force: { repulsion: 120, edgeLength: 90 },
        lineStyle: { color: '#334155', width: 2, curveness: 0.1 }
      }]
    });
  }

  closeModal(): void {
    if (this.entityChart) {
      this.entityChart.dispose();
      this.entityChart = null;
    }
    this.closeRequested.emit();
  }
}