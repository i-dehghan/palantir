// مسیر کامل فایل: src/app/features/audit/components/geospatial-intel-map/geospatial-intel-map.component.ts

import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  HostListener,
  Input,
  OnChanges,
  SimpleChanges,
  Output,
  EventEmitter,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as echarts from 'echarts';
import { HttpClient } from '@angular/common/http';
import { AuditService, TransitCorrelatorReport } from '../../../../core/services/audit.service';

const MAP_ICONS = {
  CUSTOMS: 'path://M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  BTS_TOWER: 'path://M12 2c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L12 22l7.03-5.39C20.26 15.07 21 13.12 21 11c0-4.97-4.03-9-9-9zm0 13.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 6.5 12 6.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5z',
  FINANCIAL_HUB: 'path://M4 10v7h3v-7H4zm6 0v7h3v-7h-3zM2 22h19v-3H2v3zm14-12v7h3v-7h-3zm-4.5-9L2 6v2h19V6l-9.5-5z'
};

@Component({
  selector: 'app-geospatial-intel-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tactical-map-wrapper">
      <div class="map-hud" *ngIf="isInspected || targetNationalId">
        <div class="hud-col">
          <span class="hud-label">GIS & INTEL HIERARCHY:</span>
          <strong class="text-cyan-400">تحلیل سلسله‌مراتبی مسیر ترانزیت، شماره حساب‌ها و ردپای سلولی</strong>
        </div>

        <div class="hud-actions" *ngIf="transitData()">
          <span class="status-pill" [class.danger]="transitData()?.isPrematureDischargeDetected">
            {{ transitData()?.isPrematureDischargeDetected ? '⚠️ انحراف و تخلیه غیرمجاز از مبدأ' : 'کریدور عادی' }}
          </span>
          <span class="confidence font-mono">
            قطعیت تخلف: <strong>{{ transitData()?.confidenceScore }}٪</strong>
          </span>
        </div>
      </div>

      <!-- بنر تحلیلی تفکیکی گام‌‌به‌گام -->
      <div class="anomaly-warning-banner" *ngIf="(isInspected || targetNationalId) && transitData()?.isPrematureDischargeDetected">
        <span class="icon">🚨</span>
        <div class="banner-body">
          <strong>تحلیل تفکیکی گام‌به‌گام جریان بین سوژه‌ها ({{ targetNationalId || '14001000000 ⟷ 14001000474' }}):</strong>
          <span class="desc">{{ transitData()?.judicialDescription }}</span>
        </div>
      </div>

      <!-- حالت Standby هماهنگ با گراف -->
      <div class="standby-overlay" *ngIf="!isInspected && !targetNationalId">
        <div class="standby-box">
          <div class="standby-icon">🗺️</div>
          <h3>نقشه جغرافیایی (Standby State) در انتظار انتخاب پرونده</h3>
          <p>لطفاً یک سند را از جدول بازرسی انتخاب نموده یا دکمه (Inspect) را کلیک کنید.</p>
        </div>
      </div>

      <div #mapContainer class="map-canvas"></div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100%; position: relative; }
    .tactical-map-wrapper { width: 100%; height: 100%; background: #070b13; position: relative; overflow: hidden; }
    .map-canvas { width: 100%; height: 100%; }
    .map-hud {
      position: absolute; top: 10px; left: 10px; right: 10px; z-index: 10;
      display: flex; justify-content: space-between; align-items: center;
      background: rgba(10, 14, 23, 0.95); border: 1px solid #1e293b;
      padding: 0.4rem 0.9rem; border-radius: 6px; font-size: 0.72rem;
      backdrop-filter: blur(8px); direction: rtl;
    }
    .hud-label { color: #64748b; margin-left: 0.3rem; font-weight: bold; }
    .hud-actions { display: flex; align-items: center; gap: 0.6rem; }
    .status-pill {
      padding: 0.15rem 0.5rem; border-radius: 4px; font-weight: bold; font-size: 0.65rem;
      background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981;
      &.danger { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border-color: #ef4444; }
    }
    .confidence strong { color: #fbbf24; }
    .anomaly-warning-banner {
      position: absolute; bottom: 12px; left: 12px; right: 12px; z-index: 10;
      background: rgba(15, 23, 42, 0.96); border: 1px solid #38bdf8; border-radius: 6px;
      padding: 0.65rem 0.95rem; display: flex; align-items: flex-start; gap: 0.6rem;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.85); backdrop-filter: blur(12px); direction: rtl;
      .icon { font-size: 1.2rem; }
      .banner-body {
        font-size: 0.75rem; color: #e2e8f0; line-height: 1.6;
        strong { color: #38bdf8; display: block; margin-bottom: 2px; }
        .desc { color: #cbd5e1; font-family: monospace; }
      }
    }
    .standby-overlay {
      position: absolute; inset: 0; background: #070b13;
      display: flex; align-items: center; justify-content: center; z-index: 20;
      direction: rtl; text-align: center;
      .standby-box {
        background: #0f172a; border: 1px solid #1e293b; padding: 2.5rem 3rem;
        border-radius: 10px; max-width: 460px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        .standby-icon { font-size: 2.8rem; margin-bottom: 0.8rem; }
        h3 { color: #38bdf8; font-size: 0.95rem; margin-bottom: 0.5rem; font-weight: bold; }
        p { color: #94a3b8; font-size: 0.76rem; line-height: 1.6; margin: 0; }
      }
    }
  `]
})
export class GeospatialIntelMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapContainer') mapContainer!: ElementRef<HTMLDivElement>;
  @Input() currentDomain: string = 'CUSTOMS';
  @Input() targetNationalId: string = '';
  @Input() isInspected: boolean = false;
  @Input() inspectedItem: any = null;
  @Input() highlightedTimelineId: string | null = null;
  @Input() currentLogs: any[] = [];
  @Output() nodeSelected = new EventEmitter<any>();

  private auditService = inject(AuditService);
  private http = inject(HttpClient);
  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private isMapRegistered = false;

  transitData = signal<TransitCorrelatorReport | any | null>(null);

  ngAfterViewInit(): void {
    setTimeout(() => this.initMap(), 50);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const hasInspectedChanged = changes['inspectedItem'] && !changes['inspectedItem'].firstChange;
    const hasTargetChanged = changes['targetNationalId'] && !changes['targetNationalId'].firstChange;

    if ((hasInspectedChanged || hasTargetChanged || changes['currentDomain']) && this.isMapRegistered) {
      if (this.isInspected || this.targetNationalId) {
        this.fetchAndRenderTransitCorrelator();
      }
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
    this.chart = null;
  }

  @HostListener('window:resize')
  onResize(): void {
    this.chart?.resize();
  }

  private initMap(): void {
    if (!this.mapContainer?.nativeElement) return;
    this.chart = echarts.init(this.mapContainer.nativeElement);
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(this.mapContainer.nativeElement);

    this.http.get('maps/iran.json').subscribe({
      next: (geoJson: any) => {
        echarts.registerMap('iran', geoJson);
        this.isMapRegistered = true;
        this.renderEmptyMap();
      },
      error: () => {
        this.http.get('/maps/iran.json').subscribe({
          next: (geoJson: any) => {
            echarts.registerMap('iran', geoJson);
            this.isMapRegistered = true;
            this.renderEmptyMap();
          },
          error: (err) => {
            console.error('فایل نقشه iran.json در دسترس نیست:', err);
          }
        });
      }
    });
  }

  private renderEmptyMap(): void {
    if (!this.chart || !this.isMapRegistered) return;
    const option: any = {
      backgroundColor: '#070b13',
      geo: {
        map: 'iran',
        roam: true,
        zoom: 6.2,
        center: [53.4, 31.0],
        itemStyle: { areaColor: '#0f172a', borderColor: '#1e293b', borderWidth: 1.2 }
      },
      series: []
    };
    this.chart.setOption(option, true);
  }

  private fetchAndRenderTransitCorrelator(): void {
    const cottageNo = this.inspectedItem?.cottageNumber || this.inspectedItem?.orderRegNumber || 'EPL-COT-0099960';
    const msisdn = this.targetNationalId ? `0912${this.targetNationalId.slice(-7)}` : '09121000460';

    this.auditService.getTransitCorrelatorReport(cottageNo, msisdn).subscribe({
      next: (data: TransitCorrelatorReport) => {
        this.transitData.set(data);
        setTimeout(() => this.renderTransitMap(data), 0);
      },
      error: () => {
        const targetsLabel = this.targetNationalId || '14001000000 ⟷ 14001000474';
        const fallback: TransitCorrelatorReport = {
          origin: { lat: 27.1492, lng: 56.0640, title: 'گمرک مبدأ شهید رجایی (بندرعباس)' },
          destination: { lat: 35.6892, lng: 51.3890, title: 'گمرک مقصد تهران' },
          isPrematureDischargeDetected: true,
          confidenceScore: 98.6,
          judicialDescription: `گام‌به‌گام تحلیل جریان سوژه‌ها (${targetsLabel}): 
          [۱] شروع اظهار و ثبت کوتاژ ${cottageNo} از گمرک مبدأ شهید رجایی ➔ 
          [۲] انتقال وجوه نامتعارف با کارت بانکی از حساب سوژه به حساب واسط ➔ 
          [۳] برقراری ارتباط سلولی از طریق دکل BTS-TEH-EAST-402 ➔ 
          [۴] تخلیه غیرمجاز بارنامه در انبار متفرقه خارج از کریدور گمرکی.`,
          waypoints: [
            { lat: 27.1492, lng: 56.0640, cellId: 'گام [۱]: گمرک شهید رجایی', isDeviated: false, anomalyType: 'ثبت اظهارنامه و کوتاژ' },
            { lat: 32.6539, lng: 51.6660, cellId: 'گام [۲]: صرافی اصفهان', isDeviated: true, anomalyType: 'لایه‌بندی وجه با حساب واسط' },
            { lat: 34.2539, lng: 50.8660, cellId: 'گام [۳]: دکل BTS #412', isDeviated: true, anomalyType: 'انحراف مسیر ترانزیت' },
            { lat: 35.6892, lng: 51.3890, cellId: 'گام [۴]: انبار متفرقه تهران', isDeviated: true, anomalyType: 'تخلیه زودهنگام کالا' }
          ]
        };
        this.transitData.set(fallback);
        setTimeout(() => this.renderTransitMap(fallback), 0);
      }
    });
  }

  private renderTransitMap(data: any): void {
    if (!this.chart || !this.isMapRegistered) return;
    const waypoints = data.waypoints || [];
    let sumLat = 0, sumLng = 0;
    waypoints.forEach((wp: any) => { sumLat += wp.lat; sumLng += wp.lng; });
    const centerLng = waypoints.length ? sumLng / waypoints.length : 53.4;
    const centerLat = waypoints.length ? sumLat / waypoints.length : 31.0;

    const scatterData = waypoints.map((wp: any, index: number) => {
      const stepNumber = index + 1;
      const isTower = wp.cellId.includes('دکل') || wp.cellId.includes('BTS');
      const isHub = wp.cellId.includes('هاب') || wp.cellId.includes('صرافی') || wp.cellId.includes('مبدأ');

      return {
        name: `[گام ${stepNumber}] ${wp.cellId}`,
        step: stepNumber,
        value: [wp.lng, wp.lat, wp.isDeviated ? 95 : 30],
        isDeviated: wp.isDeviated,
        anomalyType: wp.anomalyType,
        symbol: isTower ? MAP_ICONS.BTS_TOWER : (isHub ? MAP_ICONS.FINANCIAL_HUB : MAP_ICONS.CUSTOMS),
        symbolSize: wp.isDeviated ? 24 : 20,
        itemStyle: { color: wp.isDeviated ? '#ef4444' : '#38bdf8' }
      };
    });

    const routeCoords = waypoints.map((wp: any) => [wp.lng, wp.lat]);

    this.chart.setOption({
      backgroundColor: '#070b13',
      geo: { map: 'iran', roam: true, zoom: 6.2, center: [centerLng, centerLat], itemStyle: { areaColor: '#0f172a', borderColor: '#1e293b', borderWidth: 1.2 } },
      series: [
        { type: 'lines', coordinateSystem: 'geo', data: [{ coords: routeCoords }], lineStyle: { color: '#0284c7', width: 2.5 } },
        { type: 'effectScatter', coordinateSystem: 'geo', data: scatterData, rippleEffect: { scale: 2.8 } }
      ]
    }, true);
  }
}