import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
  AfterViewInit,
  HostListener,
  Output,
  EventEmitter
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as echarts from 'echarts';
import { DiscrepancyLog } from '../../../../core/models/discrepancy.model';

interface GraphNode {
  id: string;
  name: string;
  category: number;
  symbolSize: number;
  itemStyle: { color: string; borderColor?: string; borderWidth?: number };
  properties?: Record<string, string>;
  label: { show: boolean; color: string; fontSize: number };
}

interface GraphLink {
  source: string;
  target: string;
  value?: number;
  label?: {
    show: boolean;
    formatter: string;
    fontSize?: number;
    color?: string;
  };
  lineStyle?: { width?: number; color?: string; curveness?: number; type?: 'solid' | 'dashed' };
}

@Component({
  selector: 'app-galaxy-graph',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="galaxy-card">
      <div class="galaxy-header">
        <div class="header-titles">
          <h3>
            <span class="icon">🌐</span>
            {{ focusedOrder ? 'اطلس تجمیعی سوژه: ' + focusedOrder : 'شبکه هوشمند تقاطع داده‌های سه‌گانه (گمرک | بانک | مخابرات)' }}
          </h3>
          <p>ردیابی خودکار اتصالات پنهان ذی‌نفعان واحد با تغییر بردار فیلترها</p>
        </div>

        <div class="header-actions" *ngIf="focusedOrder">
          <button class="reset-focus-btn" (click)="clearFocus.emit()">
            بازگشت به نمای سراسری ✕
          </button>
        </div>
      </div>

      <div #chartContainer class="galaxy-chart"></div>
    </div>
  `,
  styles: [`
    .galaxy-card {
      background: #060b14;
      border: 1px solid #1e293b;
      border-radius: 12px;
      margin-top: 1.5rem;
      padding: 1.25rem;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
      direction: rtl;
    }
    .galaxy-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.8rem;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 0.75rem;

      h3 {
        margin: 0;
        font-size: 1.05rem;
        color: #f8fafc;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      p {
        margin: 0.25rem 0 0;
        font-size: 0.8rem;
        color: #94a3b8;
      }
    }
    .reset-focus-btn {
      background: #1e293b;
      color: #38bdf8;
      border: 1px solid #0284c7;
      padding: 0.35rem 0.8rem;
      border-radius: 6px;
      font-size: 0.78rem;
      cursor: pointer;
      transition: all 0.2s;
      &:hover {
        background: #0284c7;
        color: #fff;
      }
    }
    .galaxy-chart {
      width: 100%;
      height: 540px;
    }
  `]
})
export class GalaxyGraphComponent implements AfterViewInit, OnChanges {
  @ViewChild('chartContainer') chartContainer!: ElementRef<HTMLDivElement>;
  @Input() logs: DiscrepancyLog[] = [];
  @Input() focusedOrder: string | null = null;
  @Input() projectionConfig: any = null;
  @Output() clearFocus = new EventEmitter<void>();

  private chart: echarts.ECharts | null = null;

  ngAfterViewInit(): void {
    this.chart = echarts.init(this.chartContainer.nativeElement);
    this.renderGraph();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['logs'] || changes['focusedOrder'] || changes['projectionConfig']) && this.chart) {
      this.renderGraph();
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.chart?.resize();
  }

  private renderGraph(): void {
    if (!this.chart) return;

    const cfg = this.projectionConfig || {
      customs: { orderNo: true, cottageNo: true, totalUsd: true, goodsDescription: true },
      banking: { sourceAccount: true, destAccount: true, amount: true, rrn: true },
      telecom: { callerMsisdn: true, receiverMsisdn: true, duration: true, cellId: true }
    };

    // شمارش تعداد فیلترهای فعال جهت تنظیم چگالی و انیمیشن
    const activeFiltersCount = 
      Object.values(cfg.customs || {}).filter(Boolean).length +
      Object.values(cfg.banking || {}).filter(Boolean).length +
      Object.values(cfg.telecom || {}).filter(Boolean).length;

    // استخراج کدهای ملی شاخص موجود در لاگ‌ها (۳ شخص برتر برای دمو)
    const uniquePersons = Array.from(new Set(this.logs.map(l => l.importerNationalId))).slice(0, 3);

    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const addedNodes = new Set<string>();
// در renderGraph داخل galaxy-graph.component.ts:
const typeColors: Record<string, { color: string; border: string }> = {
  PERSON: { color: '#f59e0b', border: '#fde68a' },     // سوژه اصلی: رنگ طلایی/آمبر پالانتیر
  BANK: { color: '#38bdf8', border: '#7dd3fc' },       // حساب بانکی: آبی سایبری
  MULE: { color: '#ef4444', border: '#fca5a5' },       // واسط/پولشویی: قرمز بحرانی
  TELECOM: { color: '#10b981', border: '#6ee7b7' },    // سیم‌کارت و دکل: سبز تاکتیکال
  CUSTOMS: { color: '#a855f7', border: '#d8b4fe' }     // گمرک: بنفش تیره
};
    uniquePersons.forEach((nid, pIdx) => {
      const nidKey = `PERSON_${nid}`;
      
      // ۱. گره مرکزی هر خوشه: هویت فرد (کد ملی)
      nodes.push({
        id: nidKey,
        name: `کد ملی:\n${nid}`,
        category: 0,
        symbolSize: this.focusedOrder ? 65 : 52,
        itemStyle: { color: '#ef4444', borderColor: '#fca5a5', borderWidth: 2 },
        properties: { 'کد ملی': nid, 'سطح ریسک': 'کانون بحرانی' },
        label: { show: true, color: '#f8fafc', fontSize: 11 }
      });
      addedNodes.add(nidKey);

      // ۲. مجموعه گمرکی (Customs)
      if (cfg.customs?.orderNo) {
        const orderKey = `ORD_${nid}_${pIdx}`;
        nodes.push({
          id: orderKey,
          name: `ثبت‌سفارش:\nORD-880${pIdx + 1}`,
          category: 1,
          symbolSize: 34,
          itemStyle: { color: '#8b5cf6', borderColor: '#c4b5fd', borderWidth: 1 },
          properties: { 'سند ثبت‌سفارش': `ORD-880${pIdx + 1}`, 'حوزه': 'گمرک' },
          label: { show: true, color: '#e2e8f0', fontSize: 9 }
        });
        links.push({
          source: nidKey,
          target: orderKey,
          label: { show: true, formatter: 'واردکننده', fontSize: 8, color: '#a78bfa' },
          lineStyle: { width: 1.8, color: '#7c3aed' }
        });

        if (cfg.customs?.cottageNo) {
          const cotKey = `COT_${nid}_${pIdx}`;
          nodes.push({
            id: cotKey,
            name: `کوتاژ:\nCOT-94${pIdx + 1}`,
            category: 1,
            symbolSize: 26,
            itemStyle: { color: '#a855f7' },
            properties: { 'کوتاژ گمرکی': `COT-94${pIdx + 1}` },
            label: { show: true, color: '#cbd5e1', fontSize: 8 }
          });
          links.push({
            source: orderKey,
            target: cotKey,
            label: { show: cfg.customs?.totalUsd, formatter: '$180K', fontSize: 8, color: '#c084fc' },
            lineStyle: { width: 1.4, color: '#9333ea', type: 'dashed' }
          });
        }
      }

      // ۳. مجموعه بانکی (Banking)
      if (cfg.banking?.sourceAccount) {
        const accKey = `ACC_${nid}_${pIdx}`;
        nodes.push({
          id: accKey,
          name: `حساب اصلی:\n5022..${pIdx + 10}`,
          category: 2,
          symbolSize: 34,
          itemStyle: { color: '#10b981', borderColor: '#6ee7b7', borderWidth: 1 },
          properties: { 'حساب مبدأ': `5022..${pIdx + 10}`, 'بانک': 'سامان' },
          label: { show: true, color: '#e2e8f0', fontSize: 9 }
        });
        links.push({
          source: nidKey,
          target: accKey,
          label: { show: true, formatter: 'صاحب حساب', fontSize: 8, color: '#34d399' },
          lineStyle: { width: 2, color: '#059669' }
        });

        if (cfg.banking?.destAccount) {
          const muleKey = `MULE_HUB_${pIdx}`;
          if (!addedNodes.has(muleKey)) {
            nodes.push({
              id: muleKey,
              name: `حساب واسط (Mule):\n6037..99${pIdx}`,
              category: 2,
              symbolSize: 30,
              itemStyle: { color: '#f59e0b', borderColor: '#fde68a', borderWidth: 1 },
              properties: { 'حساب واسط': `6037..99${pIdx}`, 'تراکنش': 'واریز مشکوک تجمیعی' },
              label: { show: true, color: '#fde68a', fontSize: 8 }
            });
            addedNodes.add(muleKey);
          }
          links.push({
            source: accKey,
            target: muleKey,
            label: { show: cfg.banking?.amount, formatter: '۹۵۰ م ت', fontSize: 8, color: '#fbbf24' },
            lineStyle: { width: 2, color: '#d97706' }
          });
        }
      }

      // ۴. مجموعه مخابراتی (Telecom)
      if (cfg.telecom?.callerMsisdn) {
        const simKey = `SIM_${nid}_${pIdx}`;
        nodes.push({
          id: simKey,
          name: `خط فعال:\n0912..${pIdx + 20}`,
          category: 3,
          symbolSize: 34,
          itemStyle: { color: '#06b6d4', borderColor: '#67e8f9', borderWidth: 1 },
          properties: { 'شماره خط': `0912..${pIdx + 20}`, 'اپراتور': 'همراه اول' },
          label: { show: true, color: '#cffafe', fontSize: 9 }
        });
        links.push({
          source: nidKey,
          target: simKey,
          label: { show: true, formatter: 'شاهکار / مالک', fontSize: 8, color: '#38bdf8' },
          lineStyle: { width: 2, color: '#0891b2' }
        });

        if (cfg.telecom?.cellId) {
          const cellKey = `CELL_TEH_${pIdx + 1}`;
          if (!addedNodes.has(cellKey)) {
            nodes.push({
              id: cellKey,
              name: `دکل سلول:\nTEH-${104 + pIdx}`,
              category: 3,
              symbolSize: 26,
              itemStyle: { color: '#0284c7' },
              properties: { 'موقعیت': `دکل مرکزی منطقه ${pIdx + 2}` },
              label: { show: true, color: '#bae6fd', fontSize: 8 }
            });
            addedNodes.add(cellKey);
          }
          links.push({
            source: simKey,
            target: cellKey,
            label: { show: cfg.telecom?.duration, formatter: 'ترافیک دکل', fontSize: 7, color: '#38bdf8' },
            lineStyle: { width: 1.4, color: '#0284c7', type: 'dashed' }
          });
        }
      }
    });

    // ۵. ایجاد یال‌های تقاطع چندحوزه‌ای (Cross-Domain Bridges) هنگام کاهش فیلترها
    // وقتی کاربر تیک‌ها را کمتر می‌کند، تمرکز روی اتصال بین‌حوزه‌ای بالا می‌رود
    if (activeFiltersCount < 10 && nodes.length > 2) {
      // اتصال حساب واسط بانکی به خط مخابراتی متصل به همان دکل
      const simNode = nodes.find(n => n.id.startsWith('SIM_'));
      const muleNode = nodes.find(n => n.id.startsWith('MULE_'));
      const orderNode = nodes.find(n => n.id.startsWith('ORD_'));

      if (simNode && muleNode) {
        links.push({
          source: muleNode.id,
          target: simNode.id,
          label: { show: true, formatter: '⚡ تطبیق شماره تماس کارت', fontSize: 9, color: '#f43f5e' },
          lineStyle: { width: 2.5, color: '#f43f5e', type: 'dashed', curveness: 0.25 }
        });
      }

      if (orderNode && muleNode) {
        links.push({
          source: orderNode.id,
          target: muleNode.id,
          label: { show: true, formatter: '⚡ تأمین مالی ثبت‌سفارش', fontSize: 9, color: '#f59e0b' },
          lineStyle: { width: 2.2, color: '#f59e0b', type: 'dashed', curveness: -0.2 }
        });
      }
    }

    const categories = [
      { name: 'هویت و کدملی' },
      { name: 'اسناد گمرک' },
      { name: 'تراکنش بانکی' },
      { name: 'دیتای مخابرات' }
    ];

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      legend: {
        data: categories.map(c => c.name),
        textStyle: { color: '#94a3b8', fontSize: 11 },
        top: 8,
        right: 15
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const data = params.data;
          if (data && data.properties) {
            return Object.entries(data.properties)
              .map(([k, v]) => `<b>${k}:</b> ${v}`)
              .join('<br/>');
          }
          return data?.label?.formatter || data?.name || '';
        }
      },
      series: [
        {
          type: 'graph',
          layout: 'force',
          roam: true,
          categories: categories,
          label: { position: 'bottom' },
          edgeSymbol: ['circle', 'arrow'],
          edgeSymbolSize: [3, 7],
          animationDurationUpdate: 900,
          animationEasingUpdate: 'quinticInOut',
          force: {
            repulsion: activeFiltersCount < 8 ? 580 : 380,
            edgeLength: activeFiltersCount < 8 ? [120, 200] : [70, 130],
            gravity: 0.12
          },
          data: nodes,
          links: links
        }
      ]
    };

    this.chart.setOption(option, true);
  }
}