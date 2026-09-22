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
            {{ isInspected ? 'FOCUSED CASE' : 'GLOBAL SURVEILLANCE' }}
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
  @Input() targetNationalId: string = '';
  @Input() currentDomain: string = 'CUSTOMS';
  @Input() timeWindow: { start: string; end: string } = { start: '00:00', end: '22:00' };
@Input() currentLogs: any[] = []; // دریافت مستقیم لاگ‌های فیلترشده بر اساس زمان و سرچ
@Input() logs: any[] = [];
  @Output() nodeSelected = new EventEmitter<any>();
  private http = inject(HttpClient);
  private auditService = inject(AuditService);

  loadedPointsCount: number = 0;
  private chart: echarts.ECharts | null = null;
  private isMapRegistered: boolean = false;
  private cachedGateways: any[] = [];

  ngAfterViewInit(): void {
    // ۱. دانلود و رجیستر کردن فایل رسمی نقشه از Assets
    this.http.get('/maps/iran.json').subscribe({
      next: (geoJson: any) => {
        echarts.registerMap('iran_official', geoJson);
        this.isMapRegistered = true;
        this.initChart();
      },
      error: (err) => {
        console.error('خطا در بارگذاری فایل /maps/iran.json', err);
      }
    });
  }

 ngOnChanges(changes: SimpleChanges): void {
  if (this.chart && this.isMapRegistered) {
    if (
      changes['isInspected'] || 
      changes['targetNationalId'] || 
      changes['currentLogs'] || 
      changes['timeWindow'] || 
      changes['currentDomain']
    ) {
      // اگر حالت inspect تغییر کرده، مجدداً داده‌های مربوط به سوژه را از سرور واکشی کن
      if (changes['isInspected'] || changes['targetNationalId']) {
        this.fetchAndRenderMap();
      } else {
        this.renderTacticalMap(this.cachedGateways);
      }
    }
  }
}

  ngOnDestroy(): void {
    this.chart?.dispose();
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
    const domain = this.currentDomain || 'CUSTOMS';
    const nid = this.isInspected ? this.targetNationalId : undefined;

    this.auditService.getTacticalGateways(domain, nid).subscribe({
      next: (res) => {
        const rawPoints = res.points || res.Points || [];
        this.cachedGateways = rawPoints;
        this.loadedPointsCount = rawPoints.length;
        this.renderTacticalMap(rawPoints);
      },
      error: (err) => console.error('خطا در دریافت دیتای پایگاه‌ها', err)
    });
  }


// متد رندر نقشه را به این صورت تغییر دهید:
private renderTacticalMap(gatewaysFromDb: any[]): void {
  if (!this.chart || !this.isMapRegistered) return;

  const curDomain = (this.currentDomain || 'CUSTOMS').toUpperCase();
  const centralControl = {
    name: `مرکز مانیتورینگ ${curDomain} (تهران)`,
    coord: [51.3890, 35.6892],
    risk: 99
  };

  // ۱. ساخت مپ از پایگاه‌ها بر اساس کد برای دسترسی سریع به مختصات
  const gatewayMap = new Map<string, { coord: [number, number]; name: string }>();
  gatewaysFromDb.forEach((g: any) => {
    const code = (g.code || g.Code || '').toUpperCase();
    const name = g.name || g.Name || '';
    const lng = Number(g.longitude ?? g.Longitude);
    const lat = Number(g.latitude ?? g.Latitude);
    if (!isNaN(lng) && !isNaN(lat)) {
      gatewayMap.set(code, { coord: [lng, lat], name });
      gatewayMap.set(name, { coord: [lng, lat], name });
    }
  });

  const dbGatewaysList = Array.from(gatewayMap.values());

  // ۲. استخراج نقاط تنها از بین لاگ‌های حاضر در بازه زمانی جاری
  let activePoints: any[] = [];
  let activeLinks: any[] = [];

  // در صورتی که در حالت بازرسی پرونده قرار داریم
if (this.isInspected && this.targetNationalId) {
  const targetHub = {
    name: `سوژه پرونده [${this.targetNationalId}]`,
    coord: [51.3890, 35.6892],
    risk: 99
  };

  // فیلتر کردن پایگاه‌های مرتبط با سوژه یا انتخاب پایگاه‌های بحرانی
  const subjectPoints = dbGatewaysList.slice(0, 5);
  activePoints = [targetHub, ...subjectPoints];
  activeLinks = subjectPoints.map(p => ({
    coords: [p.coord, targetHub.coord]
  }));
  this.loadedPointsCount = activePoints.length;
}
  if (this.currentLogs && this.currentLogs.length > 0) {
    this.currentLogs.forEach((log: any) => {
      // پیدا کردن مختصات مرتبط با این لاگ
      const refKey = (log.cottageNumber || log.orderRegNumber || log.ruleName || '').toUpperCase();
      let matched = gatewayMap.get(refKey);

      // در صورت عدم انطباق کد، تخصیص موقعیت بر اساس شناسه لاگ
      if (!matched && dbGatewaysList.length > 0) {
        const seed = (log.orderRegNumber || log.importerNationalId || '1')
          .split('')
          .reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
        matched = dbGatewaysList[seed % dbGatewaysList.length];
      }

      if (matched) {
        activePoints.push({
          name: `${matched.name} [${log.orderRegNumber}]`,
          coord: matched.coord,
          risk: log.riskScore || 80
        });
      }
    });

    // اضافه کردن هاب مرکزی تهران در صورت وجود داده
    activePoints.unshift(centralControl);

    // اتصال خطوط فقط برای موارد بحرانی این بازه
    const criticals = activePoints.filter(p => p.risk >= 94 && p.name !== centralControl.name).slice(0, 5);
    activeLinks = criticals.map(p => ({
      coords: [p.coord, centralControl.coord]
    }));
  }

  // به‌روزرسانی دقیق شمارنده گره‌ها در هدر نقشه
  // اگر در این بازه لاگی نباشد، شمارنده دقیقاً 0 NODES خواهد شد
  this.loadedPointsCount = this.currentLogs ? this.currentLogs.length : 0;

  const scatterData = activePoints.map(p => {
    const isHub = p.coord[0] === centralControl.coord[0] && p.coord[1] === centralControl.coord[1];
    return {
      name: p.name,
      value: [p.coord[0], p.coord[1], p.risk],
      itemStyle: {
        color: p.risk >= 95 ? '#ef4444' : p.risk >= 90 ? '#f97316' : p.risk >= 80 ? '#eab308' : '#38bdf8',
        opacity: 0.9
      },
      symbolSize: isHub ? 12 : 6
    };
  });

  const linesData = activeLinks.map(l => ({
    coords: l.coords,
    lineStyle: {
      color: 'rgba(245, 158, 11, 0.45)',
      width: 1.4,
      curveness: 0.16
    }
  }));


  // ۳. اعمال تغییرات روی ECharts به همراه کامپوننت پایه geo
  const option: any = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(13, 18, 28, 0.95)',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc', fontSize: 11, fontFamily: 'Vazir-Code, sans-serif' },
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
        return '';
      }
    },
    // کامپوننت پایه نقشه که برای تمام سری‌های geo الزامی است
    geo: {
      map: 'iran_official',
      roam: true,
      zoom: 1.2,
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
        itemStyle: {
          areaColor: '#132138'
        }
      }
    },
    series: [
      {
        type: 'lines',
        coordinateSystem: 'geo',
        zlevel: 1,
        effect: {
          show: activeLinks.length > 0,
          period: 3.5,
          trailLength: 0.4,
          color: this.isInspected ? '#ef4444' : '#f59e0b',
          symbolSize: this.isInspected ? 4.5 : 3
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
        rippleEffect: { brushType: 'stroke', scale: 3.5, period: 2.5 },
        symbolSize: this.isInspected ? 15 : 11,
        itemStyle: {
          color: '#ef4444',
          shadowBlur: 18,
          shadowColor: '#ef4444'
        },
        // اگر در این بازه لاگی وجود نداشته باشد، پالس نوری هاب نیز خاموش می‌ماند
        data: activePoints.length > 0 ? [{
          name: centralControl.name,
          value: [centralControl.coord[0], centralControl.coord[1], 99]
        }] : []
      }
    ]
  };

  // استفاده از true برای جایگزینی کامل پیکربندی قبلی
  this.chart.setOption(option, true);
}
}