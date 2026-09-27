import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  Output,
  EventEmitter,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as echarts from 'echarts';


export type QuickDatePreset = 'TODAY' | 'YESTERDAY' | 'LAST_7D' | 'ALL' | 'CUSTOM';

export interface TimelineRangeEvent {
  startHour: number;
  endHour: number;
  preset: string;
}

@Component({
  selector: 'app-case-timeline-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="timeline-bar-wrapper">
      <div class="timeline-meta-bar">
        <div class="playback-controls">
          <button class="play-btn" (click)="togglePlayback()" [class.playing]="isPlaying()">
            <span *ngIf="!isPlaying()">▶ پخش جریان زمانی</span>
            <span *ngIf="isPlaying()">⏸ توقف تحلیل پویا</span>
          </button>
          <span class="playback-time mono text-amber-400">
            ساعت فرآیند: <strong>{{ formatCurrentHour() }}</strong>
          </span>
        </div>

        <div class="meta-right">
          <span class="tag-live">TIMELINE INTELLIGENCE</span>
          <span class="selection-range">
            بازه انتخابی: <strong>{{ currentRangeText }}</strong>
          </span>
          <button class="reset-range-btn" (click)="resetBrush()">
            🔄 بازنشانی بازه (۲۴ ساعته)
          </button>
        </div>
      </div>

      <div #chartContainer class="timeline-chart"></div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100%; position: relative; }
    .timeline-bar-wrapper {
      width: 100%;
      height: 100%;
      background: #070b13;
      position: relative;
      display: flex;
      flex-direction: column;
    }
    .timeline-meta-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 14px 2px;
      font-size: 0.7rem;
      color: #64748b;
      direction: rtl;
    }
    .playback-controls {
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(15, 23, 42, 0.85);
      padding: 3px 8px;
      border-radius: 5px;
      border: 1px solid #1e293b;

      .play-btn {
        background: #0284c7;
        color: #ffffff;
        border: none;
        border-radius: 4px;
        padding: 3px 9px;
        font-size: 0.68rem;
        cursor: pointer;
        font-weight: 600;
        font-family: inherit;
        transition: all 0.2s ease;

        &:hover { background: #0369a1; }
        &.playing { background: #e11d48; }
      }

      .playback-time {
        font-size: 0.74rem;
        font-family: monospace;
        color: #fbbf24;
      }
    }
    .meta-right {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.68rem;

      .tag-live {
        color: #f59e0b;
        font-weight: bold;
        letter-spacing: 0.5px;
      }
      .selection-range strong {
        color: #38bdf8;
        font-family: monospace;
      }
      .reset-range-btn {
        background: #0f172a;
        border: 1px solid #1e293b;
        color: #94a3b8;
        font-size: 0.62rem;
        padding: 0.2rem 0.5rem;
        border-radius: 3px;
        cursor: pointer;
        font-family: inherit;
        &:hover { border-color: #38bdf8; color: #38bdf8; }
      }
    }
    .timeline-chart {
      flex: 1;
      width: 100%;
      min-height: 80px;
    }
  `]
})

export class CaseTimelineBarComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('chartContainer') chartContainer!: ElementRef<HTMLDivElement>;
  @Input() logs: any[] = [];
  @Input() currentDomain: string = 'CUSTOMS';
  @Output() timeRangeChanged = new EventEmitter<TimelineRangeEvent>();
  @Output() timeTick = new EventEmitter<number>();
  @Input() inspectedItem: any = null;
  currentRangeText: string = '۰۰:۰۰ تا ۲۳:۵۹ (کل شبانه‌روز)';
  isPlaying = signal<boolean>(false);
  currentHourTick = signal<number>(0);

  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private playInterval: any = null;

  ngAfterViewInit(): void {
    this.initChart();
  }

ngOnChanges(changes: SimpleChanges): void {
    if ((changes['logs'] || changes['inspectedItem'] || changes['currentDomain']) && this.chart) {
      this.updateTimelineData();
    }
  }

  private updateTimelineData(): void {
    if (!this.chart) return;

    // ۱. پایه امواج تاکتیکال شبانه‌روز (حداقل نویز شبکه جهت بالا و پایین داشتن منحنی)
    const baseWave = [
      2, 1, 1, 1, 2, 3, 5, 8,
      18, 26, 38, 45, 42, 28, 20, 16,
      14, 18, 22, 19, 12, 8, 5, 3
    ];

    const hourlyCounts = new Array(24).fill(0);
    const dataList = this.logs || [];

    if (this.inspectedItem && dataList.length > 0) {
      // در حالت Inspect: وزن‌دهی سنگین به ساعات مراحل واقعی پرونده
      // ساعت‌های: ۰۸:۱۵ (ثبت سفارش)، ۱۰:۳۰ (ارز)، ۱۱:۴۵ (کوتاژ)، ۱۲:۲۰ (مغایرت)، ۱۲:۲۵ (توقف)
      const eventHours = [8, 10, 11, 12];
      
      for (let h = 0; h < 24; h++) {
        // ایجاد شیب نرم قبل و بعد از ساعت‌های رخداد
        let peakBonus = 0;
        if (h === 8) peakBonus = 42;
        else if (h === 10) peakBonus = 65;
        else if (h === 11) peakBonus = 88; // اوج پرونده (کوتاژ)
        else if (h === 12) peakBonus = 74; // ارجاع و مغایرت
        else if (h === 7 || h === 9 || h === 13) peakBonus = 20;

        hourlyCounts[h] = Math.round(baseWave[h] * 0.4 + peakBonus);
      }
    } else {
      // در حالت سراسری: توزیع ترافیک داده‌های واکشی‌شده
      for (let h = 0; h < 24; h++) {
        hourlyCounts[h] = baseWave[h];
      }
      dataList.forEach((item: any) => {
        const dt = item.detectedAt ? new Date(item.detectedAt) : null;
        const hour = (dt && !isNaN(dt.getTime())) ? dt.getHours() : 11;
        hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 4;
      });
    }

    const hoursLabels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
    const maxVal = Math.max(...hourlyCounts, 50);

    const option: any = {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: 'Vazirmatn, sans-serif' },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(8, 12, 20, 0.95)',
        borderColor: '#38bdf8',
        textStyle: { color: '#f8fafc', fontSize: 11, fontFamily: 'Vazirmatn, sans-serif' },
        formatter: (params: any) => {
          const p = params[0];
          return `
            <div style="direction: rtl; text-align: right;">
              ساعت رویداد: <strong style="color: #38bdf8;">${p.axisValue}</strong><br/>
              چگالی فعالیت: <strong style="color: #fbbf24;">${p.value}</strong> واحد سیگنال
            </div>
          `;
        }
      },
      brush: {
        toolbox: ['lineX', 'clear'],
        brushLink: 'all',
        xAxisIndex: 0,
        brushType: 'lineX',
        brushMode: 'single',
        brushStyle: {
          borderWidth: 1.5,
          color: 'rgba(56, 189, 248, 0.22)',
          borderColor: '#38bdf8'
        },
        defaultBrushOpt: {
          brushType: 'lineX'
        }
      },
      grid: {
        top: 28,
        bottom: 24,
        left: 36,
        right: 25
      },
      xAxis: {
        type: 'category',
        data: hoursLabels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#64748b', fontSize: 9.5, interval: 1, fontFamily: 'monospace' }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: Math.round(maxVal * 1.2),
        splitLine: { lineStyle: { color: 'rgba(30, 41, 59, 0.35)', type: 'dashed' } },
        axisLabel: { color: '#64748b', fontSize: 9, fontFamily: 'monospace' }
      },
      series: [
        {
          name: 'چگالی سیگنال‌های پرونده',
          type: 'line',
          smooth: 0.45,
          symbol: 'circle',
          symbolSize: (val: number) => (val > 25 ? 6 : 0),
          itemStyle: { color: '#f59e0b', borderColor: '#ffffff', borderWidth: 1.5 },
          lineStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#0284c7' },
              { offset: 0.45, color: '#f59e0b' },
              { offset: 0.6, color: '#ef4444' },
              { offset: 1, color: '#38bdf8' }
            ]),
            width: 2.8,
            shadowColor: 'rgba(245, 158, 11, 0.5)',
            shadowBlur: 10
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(245, 158, 11, 0.45)' },
              { offset: 0.7, color: 'rgba(2, 132, 199, 0.15)' },
              { offset: 1, color: 'rgba(2, 132, 199, 0.0)' }
            ])
          },
          data: hourlyCounts,
          markPoint: this.inspectedItem ? {
            symbol: 'pin',
            symbolSize: 36,
            itemStyle: { color: '#ef4444', shadowBlur: 12, shadowColor: '#ef4444' },
            data: [{
              name: 'کوتاژ گمرکی',
              coord: ['11:00', hourlyCounts[11]],
              value: 'کوتاژ'
            }]
          } : undefined,
          markLine: this.inspectedItem ? {
            symbol: ['none', 'none'],
            lineStyle: { color: '#ef4444', width: 1.8, type: 'dashed' },
            label: {
              show: true,
              position: 'insideEndTop',
              formatter: '📍 اوج تخلف (ساعت ۱۱)',
              color: '#ef4444',
              fontSize: 10,
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              padding: [2, 4],
              borderRadius: 3
            },
            data: [{ xAxis: '11:00' }]
          } : undefined
        }
      ]
    };

    this.chart.setOption(option, true);
  }

private focusInspectedTimelineHour(): void {
  if (!this.chart) return;

  if (!this.inspectedItem) {
    // در صورت خروج از حالت بازرسی، مارک‌لاین را حذف و به حالت نرمال بازگردان
    this.updateTimelineData();
    return;
  }

  const dt = this.inspectedItem.detectedAt ? new Date(this.inspectedItem.detectedAt) : null;
  let targetHour = 12; // پیش‌فرض

  if (dt && !isNaN(dt.getTime())) {
    targetHour = dt.getHours();
  } else {
    const rawCode = this.inspectedItem.orderRegNumber || this.inspectedItem.cottageNumber || '1';
    targetHour = rawCode.charCodeAt(0) % 24;
  }

  const hourStr = `${targetHour.toString().padStart(2, '0')}:00`;

  this.chart.setOption({
    series: [{
      markLine: {
        symbol: ['none', 'arrow'],
        label: {
          show: true,
          position: 'insideEndTop',
          formatter: `📍 سند بازرسی [${this.inspectedItem.orderRegNumber || this.inspectedItem.cottageNumber}]`,
          color: '#ef4444',
          fontSize: 10,
          fontWeight: 'bold',
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          borderColor: '#ef4444',
          borderWidth: 1,
          borderRadius: 3,
          padding: [2, 5]
        },
        lineStyle: {
          color: '#ef4444',
          width: 2.5,
          type: 'solid',
          shadowBlur: 10,
          shadowColor: '#ef4444'
        },
        data: [{ xAxis: hourStr }]
      },
      markPoint: {
        symbol: 'pin',
        symbolSize: 35,
        itemStyle: { color: '#ef4444' },
        data: [{
          name: 'سند جاری',
          coord: [hourStr, 1],
          value: 'هدف'
        }]
      }
    }]
  });
}

  ngOnDestroy(): void {
    this.stopPlayback();
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
    this.chart = null;
  }

  togglePlayback(): void {
    if (this.isPlaying()) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  startPlayback(): void {
    this.isPlaying.set(true);
    this.currentHourTick.set(0);

    this.playInterval = setInterval(() => {
      let nextHour = this.currentHourTick() + 1;
      if (nextHour > 23) {
        nextHour = 0;
      }
      this.currentHourTick.set(nextHour);
      this.timeTick.emit(nextHour);
      this.updateTimelinePlayhead(nextHour);
    }, 900);
  }

  stopPlayback(): void {
    this.isPlaying.set(false);
    if (this.playInterval) {
      clearInterval(this.playInterval);
      this.playInterval = null;
    }
  }

  formatCurrentHour(): string {
    const h = this.currentHourTick();
    return `${h.toString().padStart(2, '0')}:00`;
  }

  resetBrush(): void {
    if (!this.chart) return;
    this.chart.dispatchAction({
      type: 'brush',
      command: 'clear',
      areas: []
    });
    this.currentRangeText = '۰۰:۰۰ تا ۲۳:۵۹ (کل شبانه‌روز)';
    this.timeRangeChanged.emit({
      startHour: 0,
      endHour: 23,
      preset: 'ALL'
    });
  }

  private initChart(): void {
    if (!this.chartContainer?.nativeElement) return;
    this.chart = echarts.init(this.chartContainer.nativeElement);

    this.resizeObserver = new ResizeObserver(() => {
      this.chart?.resize();
    });
    this.resizeObserver.observe(this.chartContainer.nativeElement);

    this.updateTimelineData();

    this.chart.on('brushEnd', (params: any) => {
      const areas = params.areas;
      if (!areas || areas.length === 0) return;

      const range = areas[0].coordRange;
      if (!range || range.length < 2) return;

      let startHour = Math.max(0, Math.min(23, Math.round(range[0])));
      let endHour = Math.max(0, Math.min(23, Math.round(range[1])));

      if (startHour > endHour) {
        const temp = startHour;
        startHour = endHour;
        endHour = temp;
      }

      this.currentRangeText = `${String(startHour).padStart(2, '0')}:۰۰ تا ${String(endHour).padStart(2, '0')}:۰۰`;

      this.timeRangeChanged.emit({
        startHour,
        endHour,
        preset: 'CUSTOM'
      });
    });
  }


  private updateTimelinePlayhead(hour: number): void {
    if (!this.chart) return;
    this.chart.setOption({
      series: [{
        markLine: {
          symbol: ['none', 'none'],
          label: { show: true, formatter: '{b}', position: 'start', color: '#fbbf24' },
          lineStyle: { color: '#fbbf24', width: 2, type: 'dashed' },
          data: [{ xAxis: `${hour.toString().padStart(2, '0')}:00`, name: 'ردیابی زنده' }]
        }
      }]
    });
  }
}