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
  inject,
  Output,
  EventEmitter
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import * as echarts from 'echarts';
import { AuditService } from '../../../../core/services/audit.service';

const TEHRAN_COORDS: [number, number] = [51.3890, 35.6892];

@Component({
  selector: 'app-geospatial-intel-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="gis-map-container">
      <div class="map-hud-overlay">
        <div class="hud-item">
          <span class="hud-label">COORDINATE SYSTEM:</span>
          <strong>IRAN TACTICAL GIS (OFFICIAL GEOJSON)</strong>
        </div>
        <div class="hud-item">
          <span class="hud-label">TARGET NID:</span>
          <strong class="amber-text">{{ targetNationalId || 'ALL TARGETS' }}</strong>
        </div>
        <div class="hud-item">
          <span class="hud-label">MODE:</span>
          <strong [style.color]="isInspected ? '#ef4444' : '#10b981'">
            {{ isInspected ? 'FOCUSED ENTITY TRACK' : 'GLOBAL SURVEILLANCE' }}
          </strong>
        </div>
        <div class="hud-item">
          <span class="hud-label">ACTIVE TRACKS:</span>
          <strong class="count-pill">{{ loadedPointsCount }} NODES</strong>
        </div>
      </div>
      <div #mapCanvas class="map-canvas"></div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100%; position: relative; }
    .gis-map-container {
      width: 100%; height: 100%;
      background: radial-gradient(circle at 50% 50%, #0c1424 0%, #05080e 100%);
      position: relative;
    }
    .map-canvas { width: 100%; height: 100%; }
    .map-hud-overlay {
      position: absolute; top: 10px; left: 10px; display: flex; gap: 0.8rem;
      background: rgba(10, 14, 22, 0.92); border: 1px solid #1e293b;
      padding: 0.35rem 0.75rem; border-radius: 4px; z-index: 5; font-size: 0.65rem;
      .hud-label { color: #64748b; margin-right: 0.25rem; font-weight: bold; }
      .amber-text { color: #f59e0b; font-family: monospace; }
      .count-pill { color: #38bdf8; font-family: monospace; }
      strong { color: #e2e8f0; font-family: monospace; }
    }
  `]
})
export class GeospatialIntelMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapCanvas') mapCanvas!: ElementRef<HTMLDivElement>;
  @Input() isInspected: boolean = false;
  @Input() inspectedItem: any = null;
  @Input() targetNationalId: string = '';
  @Input() currentDomain: string = 'CUSTOMS';
  @Input() currentLogs: any[] = [];
  @Output() nodeSelected = new EventEmitter<any>();
  @Input() highlightedTimelineId: string | null = null;
  private http = inject(HttpClient);
  private auditService = inject(AuditService);

  loadedPointsCount: number = 0;
  private chart: echarts.ECharts | null = null;
  private isMapRegistered: boolean = false;
  private cachedGateways: any[] = [];

  ngAfterViewInit(): void {
    this.http.get('/maps/iran.json').subscribe({
      next: (geoJson: any) => {
        echarts.registerMap('iran_official', geoJson);
        this.isMapRegistered = true;
        this.initChart();
      },
      error: (err) => console.error('خطا در بارگذاری نقشه ایران:', err)
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if(changes['highlightedTimelineId']){
      this.applyTimelineFocusOnMap()
    }
    if (this.chart && this.isMapRegistered) {
      if (changes['isInspected'] || changes['inspectedItem'] || changes['targetNationalId'] || changes['currentDomain']) {
        this.fetchAndRenderMap();
      } else if (changes['currentLogs']) {
        this.renderTacticalMap(this.cachedGateways);
      }
    }
  }
private applyTimelineFocusOnMap(): void {
    if (!this.chart) return;
    const opt = this.chart.getOption() as any;
    if (!opt?.series) return;

    const raw = this.highlightedTimelineId;

    // ۱. اگر انتخابی نبود، اندازه و شفافیت نقاط را عادی کن
    if (!raw) {
      const scatterSeries = opt.series.find((s: any) => s.type === 'scatter');
      if (scatterSeries && scatterSeries.data) {
        scatterSeries.data = scatterSeries.data.map((pt: any) => ({
          ...pt,
          itemStyle: { ...(pt.itemStyle || {}), opacity: 0.9 },
          symbolSize: 9
        }));
      }
      this.chart.setOption(opt);
      return;
    }

    // ۲. هایلایت کردن نقطه گمرک/مبدأ با پالس درشت
    const scatterSeries = opt.series.find((s: any) => s.type === 'scatter');
    if (scatterSeries && scatterSeries.data) {
      scatterSeries.data = scatterSeries.data.map((pt: any, idx: number) => {
        // نود مبدأ (غیراز تهران) را درشت و درخشان کن
        const isTargetGateway = idx > 0;
        return {
          ...pt,
          itemStyle: {
            ...(pt.itemStyle || {}),
            opacity: isTargetGateway ? 1 : 0.35,
            shadowBlur: isTargetGateway ? 30 : 5,
            shadowColor: '#38bdf8'
          },
          symbolSize: isTargetGateway ? 18 : 10
        };
      });
    }

    // ۳. شتاب دادن به انیمیشن حرکت ذرات ترانزیت روی نقشه
    const linesSeries = opt.series.find((s: any) => s.type === 'lines');
    if (linesSeries) {
      linesSeries.effect = {
        ...(linesSeries.effect || {}),
        show: true,
        period: 1.8, // حرکت سریع‌تر جریان ترانزیت
        trailLength: 0.8,
        symbolSize: 8,
        color: '#38bdf8'
      };
    }

    this.chart.setOption(opt);
  }
  ngOnDestroy(): void {
    this.chart?.dispose();
    this.chart = null;
  }

  @HostListener('window:resize')
  onResize(): void {
    this.chart?.resize();
  }

  private initChart(): void {
    if (!this.mapCanvas?.nativeElement) return;
    this.chart = echarts.init(this.mapCanvas.nativeElement);
    this.fetchAndRenderMap();
  }

  private fetchAndRenderMap(): void {
    const domain = (this.currentDomain || 'CUSTOMS').toUpperCase();
    const nid = this.isInspected ? this.targetNationalId : undefined;

    this.auditService.getTacticalGateways(domain, nid).subscribe({
      next: (res) => {
        const rawPoints = res.points || res.Points || [];
        this.cachedGateways = rawPoints;
        this.renderTacticalMap(rawPoints);
      },
      error: (err) => {
        console.error('خطا در واکشی پایگاه‌های جغرافیایی:', err);
        this.renderTacticalMap([]);
      }
    });
  }

  private renderTacticalMap(gatewaysFromDb: any[]): void {
    if (!this.chart || !this.isMapRegistered) return;

    const curDomain = (this.currentDomain || 'CUSTOMS').toUpperCase();
    const centralControl = {
      name: `مرکز فرماندهی و پایش ${curDomain} (تهران)`,
      coord: TEHRAN_COORDS,
      risk: 99
    };

    const validGateways = gatewaysFromDb
      .map((g: any) => {
        const lng = Number(g.longitude ?? g.Longitude ?? g.rawLongitude ?? g.RawLongitude);
        const lat = Number(g.latitude ?? g.Latitude ?? g.rawLatitude ?? g.RawLatitude);
        return {
          code: g.code || g.Code || '',
          name: g.name || g.Name || 'پایگاه تاکتیکال',
          province: g.province || g.Province || '',
          coord: [lng, lat] as [number, number],
          risk: Number(g.riskScore ?? g.RiskScore ?? 85)
        };
      })
      .filter(g => !isNaN(g.coord[0]) && !isNaN(g.coord[1]) && g.coord[0] > 40 && g.coord[1] > 20);

    let activePoints: any[] = [];
    let corridorLines: any[] = [];

    // سناریوی ۱: بازرسی سطر خاص (Inspect)
    if (this.isInspected && this.inspectedItem) {
      const item = this.inspectedItem;
      const refCode = String(item.orderRegNumber || item.cottageNumber || item.id || '');

      let matchedGateway: any = null;
      if (validGateways.length > 0) {
        matchedGateway = validGateways.find(g => g.code.includes(refCode) || refCode.includes(g.code));
        if (!matchedGateway) {
          const hash = refCode.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
          matchedGateway = validGateways[hash % validGateways.length];
        }
      }

      if (matchedGateway) {
        const subjectNode = {
          name: `سوژه [${refCode}] - ${matchedGateway.name} (${matchedGateway.province})`,
          coord: matchedGateway.coord,
          risk: item.riskScore || matchedGateway.risk || 95,
          symbolSize: 13
        };

        activePoints = [centralControl, subjectNode];

        // ایجاد مسیر متحرک بین پایگاه تطبیق‌یافته و مرکز مانیتورینگ
        corridorLines = [{
          coords: [subjectNode.coord, centralControl.coord],
          name: `جریان ${curDomain}: ${subjectNode.name} ⟵ ${centralControl.name}`,
          color: curDomain === 'BANKING' ? '#10b981' : (curDomain === 'TELECOM' ? '#38bdf8' : '#f59e0b')
        }];
      } else {
        activePoints = [centralControl];
      }
    } 
    // سناریوی ۲: حالت سراسری (بر اساس لاگ‌های جدول)
    else {
      activePoints = [centralControl];

      const currentLogsList = this.currentLogs || [];
      currentLogsList.slice(0, 15).forEach((log: any, idx: number) => {
        if (validGateways.length > 0) {
          const g = validGateways[idx % validGateways.length];
          activePoints.push({
            name: `${g.name} [${log.orderRegNumber || log.cottageNumber}]`,
            coord: g.coord,
            risk: log.riskScore || g.risk || 80,
            symbolSize: 8
          });

          // اتصال خطوط فقط برای موارد پرخطر
          if ((log.riskScore || 80) >= 90) {
            corridorLines.push({
              coords: [g.coord, centralControl.coord],
              name: `مسیر رصد: ${g.name}`,
              color: curDomain === 'BANKING' ? '#10b981' : (curDomain === 'TELECOM' ? '#38bdf8' : '#f59e0b')
            });
          }
        }
      });
    }

    this.loadedPointsCount = activePoints.length;

    const scatterData = activePoints.map(p => ({
      name: p.name,
      value: [p.coord[0], p.coord[1], p.risk],
      itemStyle: {
        color: p.risk >= 95 ? '#ef4444' : p.risk >= 90 ? '#f59e0b' : '#38bdf8',
        shadowBlur: 12,
        shadowColor: p.risk >= 90 ? '#ef4444' : '#38bdf8'
      },
      symbolSize: p.symbolSize || 9
    }));

    const linesData = corridorLines.map(l => ({
      coords: l.coords,
      name: l.name,
      lineStyle: {
        color: l.color,
        width: 2.2,
        opacity: 0.7,
        curveness: 0.18
      }
    }));

    const option: any = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(13, 18, 28, 0.95)',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc', fontSize: 11, fontFamily: 'Vazirmatn, sans-serif' },
        formatter: (params: any) => {
          if (params.seriesType === 'scatter' || params.seriesType === 'effectScatter') {
            const risk = params.value[2];
            return `
              <div style="padding: 2px 4px; direction: rtl; text-align: right;">
                <strong style="color: #38bdf8;">${params.name}</strong><br/>
                <span>مختصات: [${params.value[0].toFixed(2)}, ${params.value[1].toFixed(2)}]</span><br/>
                <span>شاخص ریسک: <strong style="color: ${risk >= 90 ? '#ef4444' : '#f59e0b'}">${risk}%</strong></span>
              </div>
            `;
          }
          if (params.seriesType === 'lines') {
            return `<div style="direction: rtl; text-align: right;">${params.data.name}</div>`;
          }
          return '';
        }
      },
      geo: {
        map: 'iran_official',
        roam: true,
        zoom: 1.25,
        aspectScale: 0.88,
        center: [53.68, 32.42],
        label: { show: false },
        itemStyle: {
          areaColor: '#0c1524',
          borderColor: '#1e3a5f',
          borderWidth: 1.2,
          shadowColor: 'rgba(30, 58, 95, 0.4)',
          shadowBlur: 15
        },
        emphasis: {
          itemStyle: { areaColor: '#132138' }
        }
      },
      series: [
        {
          type: 'lines',
          coordinateSystem: 'geo',
          zlevel: 1,
          effect: {
            show: corridorLines.length > 0,
            period: 3.8,
            trailLength: 0.6,
            symbol: 'arrow',
            symbolSize: 6,
            color: '#fbbf24'
          },
          data: linesData
        },
        {
          type: 'scatter',
          coordinateSystem: 'geo',
          zlevel: 2,
          data: scatterData,
          emphasis: {
            scale: 2,
            label: {
              show: true,
              formatter: '{b}',
              position: 'top',
              color: '#f8fafc',
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              borderColor: '#38bdf8',
              borderWidth: 1,
              padding: [3, 6],
              borderRadius: 3
            }
          }
        },
        {
          type: 'effectScatter',
          coordinateSystem: 'geo',
          zlevel: 3,
          rippleEffect: { brushType: 'stroke', scale: 4, period: 2.5 },
          symbolSize: 13,
          itemStyle: {
            color: '#ef4444',
            shadowBlur: 20,
            shadowColor: '#ef4444'
          },
          data: [{
            name: centralControl.name,
            value: [centralControl.coord[0], centralControl.coord[1], 99]
          }]
        }
      ]
    };

    this.chart.setOption(option, true);
  }
}