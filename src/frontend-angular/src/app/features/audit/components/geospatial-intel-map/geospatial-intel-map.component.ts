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
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import * as echarts from 'echarts';
import { AuditService, TacticalGatewayDto } from '../../../../core/services/audit.service';

@Component({
  selector: 'app-geospatial-intel-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="gis-map-container">
      <div class="map-hud-overlay">
        <div class="hud-left">
          <span class="hud-title">🌍 پایش ژئودتیک و رهگیری ترانزیت فرامرزی</span>
          <span class="status-live">سامانه برخط GIS</span>
        </div>
        <div class="hud-right">
          <span class="stat-tag">پایگاه‌های مکانی فعال: <strong>{{ gatewayCount }}</strong></span>
          <span class="stat-tag danger" *ngIf="isInspected">مسیر کوتاژ انتخابی: <strong>هایلایت تاکتیکال</strong></span>
        </div>
      </div>

      <div *ngIf="mapLoading" class="map-loader-overlay">
        <div class="tactical-spin"></div>
        <span>در حال بارگذاری نقشه جغرافیایی ایران و اتصال به پایگاه‌های مکانی...</span>
      </div>

      <div #mapCanvas class="map-canvas"></div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
    }

    .gis-map-container {
      width: 100%;
      height: 100%;
      position: relative;
      background: #06090f;
      overflow: hidden;
    }

    .map-canvas {
      width: 100%;
      height: 100%;
      min-height: 480px;
    }

    .map-loader-overlay {
      position: absolute;
      inset: 0;
      background: rgba(6, 9, 15, 0.85);
      z-index: 20;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: #38bdf8;
      font-size: 0.75rem;
      font-family: inherit;

      .tactical-spin {
        width: 32px;
        height: 32px;
        border: 3px solid rgba(56, 189, 248, 0.2);
        border-top-color: #38bdf8;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
    }

    .map-hud-overlay {
      position: absolute;
      top: 10px;
      left: 10px;
      right: 10px;
      z-index: 10;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(11, 17, 30, 0.94);
      border: 1px solid #1e293b;
      padding: 0.4rem 0.9rem;
      border-radius: 6px;
      font-size: 0.72rem;
      backdrop-filter: blur(8px);
      direction: rtl;

      .hud-left {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        .hud-title { color: #f8fafc; font-weight: bold; }
        .status-live {
          font-size: 0.62rem;
          background: rgba(16, 185, 129, 0.2);
          border: 1px solid #10b981;
          color: #34d399;
          padding: 1px 6px;
          border-radius: 3px;
        }
      }

      .hud-right {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        .stat-tag {
          color: #94a3b8;
          strong { color: #38bdf8; font-family: monospace; }
          &.danger strong { color: #ef4444; }
        }
      }
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `]
})
export class GeospatialIntelMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapCanvas') mapCanvas!: ElementRef<HTMLDivElement>;

  @Input() currentDomain = 'CUSTOMS';
  @Input() targetNationalId = '';
  @Input() isInspected = false;
  @Input() inspectedItem: any = null;
  @Input() highlightedTimelineId: string | null = null;
  @Input() currentLogs: any[] = [];
  @Output() nodeSelected = new EventEmitter<any>();

  private http = inject(HttpClient);
  private auditService = inject(AuditService);

  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;

  gatewayCount = 0;
  gateways: TacticalGatewayDto[] = [];
  mapLoading = true;
  private static isMapRegistered = false;

  private readonly defaultBaseGateways: TacticalGatewayDto[] = [
    {
      id: 'GW-RAJAEE',
      name: 'گمرک شهید رجایی بندرعباس (مبادی ورودی کانتینری)',
      code: 'C-BND-01',
      domain: 'CUSTOMS',
      latitude: 27.1408,
      longitude: 56.0624,
      riskScore: 98,
      trafficVolume: 850,
      anomalyDetected: true
    },
    {
      id: 'GW-BUSHEHR',
      name: 'منطقه ویژه اقتصادی بندر بوشهر',
      code: 'C-BSH-02',
      domain: 'CUSTOMS',
      latitude: 28.9234,
      longitude: 50.8203,
      riskScore: 92,
      trafficVolume: 420,
      anomalyDetected: true
    },
    {
      id: 'GW-TEHRAN-HUB',
      name: 'هاب انبار مرکزی شهریار تهران (مقصد ترانزیت)',
      code: 'C-THR-HUB',
      domain: 'CUSTOMS',
      latitude: 35.6892,
      longitude: 51.3890,
      riskScore: 96,
      trafficVolume: 1200,
      anomalyDetected: true
    },
    {
      id: 'GW-BAZARGAN',
      name: 'گمرک مرزی بازرگان',
      code: 'C-BZG-03',
      domain: 'CUSTOMS',
      latitude: 39.3908,
      longitude: 44.3833,
      riskScore: 78,
      trafficVolume: 310,
      anomalyDetected: false
    },
    {
      id: 'GW-SARAKHS',
      name: 'منطقه ویژه اقتصادی سرخس',
      code: 'C-SRX-04',
      domain: 'CUSTOMS',
      latitude: 36.5447,
      longitude: 61.1575,
      riskScore: 82,
      trafficVolume: 290,
      anomalyDetected: false
    },
    {
      id: 'GW-MEHRAN',
      name: 'پایانه مرزی تجاری مهران',
      code: 'C-MHR-05',
      domain: 'CUSTOMS',
      latitude: 33.1222,
      longitude: 46.1644,
      riskScore: 85,
      trafficVolume: 360,
      anomalyDetected: false
    },
    {
      id: 'GW-CHABAHAR',
      name: 'بندر آزاد چابهار (ترانزیت اقیانوسی)',
      code: 'C-CHB-06',
      domain: 'CUSTOMS',
      latitude: 25.2969,
      longitude: 60.6430,
      riskScore: 88,
      trafficVolume: 510,
      anomalyDetected: true
    },
    {
      id: 'GW-ISFAHAN',
      name: 'هاب لجستیک و انبار ترانزیت اصفهان',
      code: 'C-ESF-07',
      domain: 'CUSTOMS',
      latitude: 32.6546,
      longitude: 51.6660,
      riskScore: 84,
      trafficVolume: 640,
      anomalyDetected: false
    },
    {
      id: 'GW-SHIRAZ',
      name: 'پایانه میانی بارانداز شیراز',
      code: 'C-SHR-08',
      domain: 'CUSTOMS',
      latitude: 29.5918,
      longitude: 52.5836,
      riskScore: 80,
      trafficVolume: 430,
      anomalyDetected: false
    }
  ];

  ngAfterViewInit(): void {
    setTimeout(() => this.loadMapAndInit(), 60);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentDomain'] || changes['targetNationalId'] || changes['inspectedItem']) {
      this.loadGateways();
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

  private loadMapAndInit(): void {
    if (GeospatialIntelMapComponent.isMapRegistered) {
      this.initChartInstance();
      return;
    }

    this.http.get('/maps/iran.json').subscribe({
      next: (geoJson: any) => {
        echarts.registerMap('iran', geoJson);
        GeospatialIntelMapComponent.isMapRegistered = true;
        this.initChartInstance();
      },
      error: (err) => {
        console.warn('عدم امکان بارگذاری /maps/iran.json، استفاده از محدوده وکتوری فال‌بک:', err);
        const fallbackIranJson: any = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { name: 'ایران' },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [44.0, 39.5], [45.0, 39.8], [47.0, 39.4], [48.5, 38.4], [49.5, 37.5],
                    [50.5, 37.0], [53.5, 37.0], [54.0, 37.5], [56.0, 38.0], [59.0, 37.5],
                    [61.0, 35.5], [60.5, 34.0], [61.0, 31.5], [62.0, 29.5], [61.5, 27.0],
                    [61.0, 25.2], [57.0, 25.5], [56.5, 27.2], [54.5, 26.5], [52.5, 27.5],
                    [50.5, 29.5], [49.0, 30.0], [48.0, 31.0], [46.0, 32.5], [45.5, 35.5],
                    [44.5, 37.0], [44.0, 39.5]
                  ]
                ]
              }
            }
          ]
        };
        echarts.registerMap('iran', fallbackIranJson);
        GeospatialIntelMapComponent.isMapRegistered = true;
        this.initChartInstance();
      }
    });
  }

  private initChartInstance(): void {
    if (!this.mapCanvas?.nativeElement) return;
    if (this.chart) {
      this.chart.dispose();
    }

    this.chart = echarts.init(this.mapCanvas.nativeElement);
    this.resizeObserver = new ResizeObserver(() => {
      this.chart?.resize();
    });
    this.resizeObserver.observe(this.mapCanvas.nativeElement);

    this.mapLoading = false;
    this.loadGateways();
  }

  private loadGateways(): void {
    const domain = this.currentDomain || 'CUSTOMS';
    const nid = this.targetNationalId || '';

    this.auditService.getTacticalGateways(domain, nid).subscribe({
      next: (res: TacticalGatewayDto[]) => {
        if (res && res.length > 0) {
          this.gateways = res;
        } else {
          this.gateways = [...this.defaultBaseGateways];
        }
        this.gatewayCount = this.gateways.length;
        this.renderMap();
      },
      error: () => {
        this.gateways = [...this.defaultBaseGateways];
        this.gatewayCount = this.gateways.length;
        this.renderMap();
      }
    });
  }

  private renderMap(): void {
    if (!this.chart || this.mapLoading) return;

    const scatterData = this.gateways.map(g => ({
      name: g.name,
      value: [g.longitude, g.latitude, g.riskScore],
      itemStyle: {
        color: g.anomalyDetected ? '#ef4444' : '#38bdf8',
        shadowBlur: g.anomalyDetected ? 18 : 8,
        shadowColor: g.anomalyDetected ? '#ef4444' : '#38bdf8'
      }
    }));

    const transitLines = [
      {
        coords: [
          [56.0624, 27.1408],
          [52.5836, 29.5918],
          [51.6660, 32.6546],
          [51.3890, 35.6892]
        ],
        lineStyle: { color: '#f59e0b', width: 2.8 }
      },
      {
        coords: [
          [50.8203, 28.9234],
          [51.6660, 32.6546],
          [51.3890, 35.6892]
        ],
        lineStyle: { color: '#38bdf8', width: 2.2 }
      },
      {
        coords: [
          [60.6430, 25.2969],
          [56.0624, 27.1408]
        ],
        lineStyle: { color: '#a855f7', width: 1.8 }
      }
    ];

    const centerCoord = this.isInspected ? [53.2, 31.5] : [53.6880, 32.4279];
    const zoomLevel = this.isInspected ? 1.45 : 1.25;

    const option: echarts.EChartsOption = {
      backgroundColor: '#06090f',
      geo: {
        map: 'iran',
        roam: true,
        center: centerCoord as [number, number],
        zoom: zoomLevel,
        label: {
          show: false
        },
        itemStyle: {
          areaColor: '#0c1524',
          borderColor: '#1e293b',
          borderWidth: 1.5
        },
        emphasis: {
          itemStyle: {
            areaColor: '#172554'
          },
          label: {
            show: true,
            color: '#f8fafc'
          }
        }
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(8, 12, 20, 0.95)',
        borderColor: '#38bdf8',
        textStyle: { color: '#f8fafc', fontSize: 11, fontFamily: 'Vazirmatn, sans-serif' },
        formatter: (params: any) => {
          if (params.seriesType === 'effectScatter') {
            return `
              <div style="direction: rtl; text-align: right; font-family: Vazirmatn, sans-serif; font-size: 11px;">
                <strong style="color: #38bdf8;">${params.name}</strong><br/>
                مختصات جغرافیایی: [${params.value[0]}, ${params.value[1]}]<br/>
                شاخص ریسک تخلف: <strong style="color: #ef4444;">${params.value[2]}% (سطح بحرانی)</strong>
              </div>
            `;
          }
          return params.name || '';
        }
      },
      series: [
        {
          name: 'پایگاه‌های مکانی و گمرکات مرزی',
          type: 'effectScatter',
          coordinateSystem: 'geo',
          data: scatterData,
          symbolSize: (val: any) => Math.max(12, Math.min(22, (val[2] || 80) / 4.5)),
          showEffectOn: 'render',
          rippleEffect: {
            brushType: 'stroke',
            scale: 3.5,
            period: 4
          },
          label: {
            show: true,
            formatter: '{b}',
            position: 'right',
            color: '#cbd5e1',
            fontSize: 10,
            fontFamily: 'Vazirmatn, sans-serif'
          },
          zlevel: 2
        },
        {
          name: 'جریان ترانزیت کانتینری و محموله‌ها',
          type: 'lines',
          coordinateSystem: 'geo',
          data: transitLines,
          effect: {
            show: true,
            period: 5,
            trailLength: 0.65,
            color: '#fbbf24',
            symbolSize: 4.5
          },
          lineStyle: {
            curveness: 0.18,
            opacity: 0.8
          },
          zlevel: 3
        }
      ]
    };

    this.chart.setOption(option, true);
  }
}