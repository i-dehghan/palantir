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
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as echarts from 'echarts';
import { DiscrepancyLog } from '../../../../core/models/discrepancy.model';

const SVG_ICONS: Record<string, string> = {
  PERSON: 'path://M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  BANK_ACCOUNT: 'path://M4 10v7h3v-7H4zm6 0v7h3v-7h-3zM2 22h19v-3H2v3zm14-12v7h3v-7h-3zm-4.5-9L2 6v2h19V6l-9.5-5z',
  CUSTOMS_CARGO: 'path://M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  BTS_TOWER: 'path://M12 2c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L12 22l7.03-5.39C20.26 15.07 21 13.12 21 11c0-4.97-4.03-9-9-9zm0 13.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 6.5 12 6.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5z'
};

export type GraphLayoutType = 'HIERARCHY' | 'CIRCULAR' | 'FORCE';

@Component({
  selector: 'app-palantir-dossier-studio',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="studio-container">
      <div class="studio-hud">
        <div class="hud-item">
          <span class="hud-label">GRAPH:</span>
          <strong [style.color]="isInspected ? '#ef4444' : '#38bdf8'">
            {{ isInspected ? 'FOCUSED DOSSIER CHAIN' : 'CROSS-DOMAIN GALAXY' }}
          </strong>
        </div>

        <div class="layout-selector">
          <span class="layout-label">چینش جریان:</span>
          <button 
            class="layout-btn" 
            [class.active]="activeLayout === 'HIERARCHY'" 
            (click)="setLayout('HIERARCHY')">
            سلسله‌مراتبی (جریان فرآیند)
          </button>
          <button 
            class="layout-btn" 
            [class.active]="activeLayout === 'CIRCULAR'" 
            (click)="setLayout('CIRCULAR')">
            کانونی (شعاعی)
          </button>
          <button 
            class="layout-btn" 
            [class.active]="activeLayout === 'FORCE'" 
            (click)="setLayout('FORCE')">
            شبکه‌ای آزاد
          </button>
        </div>

        <div class="hud-stats">
          <span>نودها: <strong>{{ nodeCount }}</strong></span>
          <span>یال‌ها: <strong>{{ edgeCount }}</strong></span>
        </div>
      </div>

      <div #graphCanvas class="graph-canvas"></div>

      <!-- دراور بازرسی نود -->
      <div class="node-inspector-drawer" *ngIf="selectedNode">
        <div class="drawer-header">
          <div class="header-title">
            <span class="type-badge" [class.person]="selectedNode.category === 'PERSON'">
              {{ selectedNode.entityType }}
            </span>
            <h4>{{ selectedNode.displayLabel }}</h4>
          </div>
          <button class="close-btn" (click)="selectedNode = null">×</button>
        </div>

        <div class="drawer-body">
          <div class="stat-pill cluster-pill">
  <span class="label">خوشه‌های تبانی:</span>
  <strong class="text-cyan-400">{{ detectedClustersCount() }} حلقه مجزا</strong>
</div>
          <div class="meta-row">
            <span class="label">شناسه پرونده / سند:</span>
            <span class="val mono">{{ selectedNode.id }}</span>
          </div>
          <div class="meta-row">
            <span class="label">درجه ریسک:</span>
            <span class="val risk" [style.color]="selectedNode.risk >= 90 ? '#ef4444' : '#f59e0b'">
              {{ selectedNode.risk }}%
            </span>
          </div>
          <div class="meta-row">
            <span class="label">عنوان عملیات:</span>
            <span class="val">{{ selectedNode.title }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100%; position: relative; }
    .studio-container { width: 100%; height: 100%; position: relative; background: #070b12; overflow: hidden; }
    .graph-canvas { width: 100%; height: 100%; }
    .studio-hud {
      position: absolute; top: 10px; left: 10px; right: 10px; z-index: 10;
      display: flex; justify-content: space-between; align-items: center;
      background: rgba(10, 14, 23, 0.95); border: 1px solid #1e293b;
      padding: 0.35rem 0.85rem; border-radius: 6px; font-size: 0.7rem;
      backdrop-filter: blur(8px);
    }
    .hud-label { color: #64748b; margin-right: 0.25rem; font-weight: bold; }
    strong { color: #f8fafc; font-family: monospace; }
    
    .layout-selector {
      display: flex; align-items: center; gap: 0.4rem;
      .layout-label { color: #94a3b8; font-size: 0.68rem; margin-left: 0.2rem; }
      .layout-btn {
        background: #111827; border: 1px solid #1f2937; color: #94a3b8;
        padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.65rem; cursor: pointer;
        transition: all 0.2s;
        &:hover { border-color: #38bdf8; color: #38bdf8; }
        &.active {
          background: rgba(56, 189, 248, 0.15); border-color: #38bdf8;
          color: #38bdf8; font-weight: bold;
        }
      }
    }

    .hud-stats { display: flex; gap: 0.8rem; color: #64748b; font-size: 0.68rem; }

    .node-inspector-drawer {
      position: absolute; bottom: 12px; right: 12px; width: 400px; max-width: 90%;
      background: rgba(13, 18, 30, 0.98); border: 1px solid #38bdf8;
      border-radius: 6px; z-index: 100; box-shadow: 0 8px 32px rgba(0,0,0,0.8);
      backdrop-filter: blur(10px); direction: rtl; text-align: right;
    }
    .drawer-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 0.6rem 0.8rem; background: #131d2e; border-bottom: 1px solid #1e293b;
      .header-title { display: flex; align-items: center; gap: 0.5rem; }
      h4 { margin: 0; font-size: 0.85rem; color: #f8fafc; font-weight: 600; }
      .type-badge {
        font-size: 0.65rem; padding: 0.15rem 0.45rem; border-radius: 3px;
        background: #0284c7; color: white;
        &.person { background: #ea580c; }
      }
      .close-btn { background: transparent; border: none; color: #94a3b8; font-size: 1.2rem; cursor: pointer; &:hover { color: #ef4444; } }
    }
    .drawer-body {
      padding: 0.75rem; font-size: 0.75rem; color: #cbd5e1;
      .meta-row {
        display: flex; justify-content: space-between; margin-bottom: 0.4rem;
        .label { color: #64748b; }
        .val.mono { font-family: monospace; color: #38bdf8; }
        .val.risk { font-weight: bold; font-family: monospace; }
      }
    }

    .leader-badge-pill {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.4));
  border: 1px solid #f59e0b;
  color: #fbbf24;
  text-shadow: 0 0 8px rgba(245, 158, 11, 0.6);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
  `]
})
export class PalantirDossierStudioComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('graphCanvas') graphCanvas!: ElementRef<HTMLDivElement>;
  @Input() dossierData: any = null;
  @Input() targetNationalId: string = '';
  @Input() isInspected: boolean = false;
  @Input() currentLogs: any[] = [];
  @Input() highlightedNodeId: string | null = null;
  @Output() nodeSelected = new EventEmitter<any>();
detectedClustersCount = signal<number>(1);
  activeLayout: GraphLayoutType = 'HIERARCHY';
  nodeCount = 0;
  edgeCount = 0;
  selectedNode: any = null;

  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // در palantir-dossier-studio.component.ts

// پالت رنگ‌های تاکتیکال مخصوص خوشه‌های مجزا
private clusterPalette: string[] = [
  '#38bdf8', // فیروزه‌ای تاکتیکال
  '#a855f7', // بنفش نئونی
  '#22c55e', // سبز فسفری
  '#f97316', // نارنجی متالیک
  '#ec4899', // سرخابی
  '#eab308'  // کهربایی
];

// در palantir-dossier-studio.component.ts

@Input() set activePlaybackHour(hour: number | null) {
  if (hour !== null && this.chart) {
    this.filterGraphByHour(hour);
  }
}

private filterGraphByHour(currentHour: number): void {
  const currentOption = this.chart?.getOption() as any;
  if (!currentOption?.series?.[0]) return;

  const nodes = currentOption.series[0].data || [];
  const links = currentOption.series[0].links || [];

  // محاسبه پدیدار شدن تدریجی گره‌ها متناسب با ساعت
  const updatedNodes = nodes.map((n: any, index: number) => {
    // اگر شخص است همیشه بماند، اسناد متناسب با ساعت پدیدار شوند
    const nodeHour = n.category === 'PERSON' ? 0 : ((index * 2) % 24);
    const isVisible = nodeHour <= currentHour;

    return {
      ...n,
      itemStyle: {
        ...(n.itemStyle || {}),
        opacity: isVisible ? 1 : 0.1,
        shadowBlur: (isVisible && nodeHour === currentHour) ? 30 : (n.itemStyle?.shadowBlur || 0),
        shadowColor: nodeHour === currentHour ? '#22c55e' : n.itemStyle?.shadowColor
      }
    };
  });

  const updatedLinks = links.map((l: any, index: number) => {
    const linkHour = (index * 2) % 24;
    const isVisible = linkHour <= currentHour;
    return {
      ...l,
      lineStyle: {
        ...(l.lineStyle || {}),
        opacity: isVisible ? 0.9 : 0.05
      }
    };
  });

  this.chart?.setOption({
    series: [{
      data: updatedNodes,
      links: updatedLinks
    }]
  });
}
private detectCommunitiesAndColorize(nodes: any[], edges: any[]): number {
  if (!nodes.length) return 0;

  // ۱. ساخت لیست مجاورت گراف (Adjacency List)
  const adj = new Map<string, string[]>();
  nodes.forEach(n => adj.set(n.id, []));

  edges.forEach(e => {
    const u = typeof e.source === 'object' ? e.source.id : e.source;
    const v = typeof e.target === 'object' ? e.target.id : e.target;
    if (adj.has(u) && adj.has(v)) {
      adj.get(u)!.push(v);
      adj.get(v)!.push(u);
    }
  });

  // ۲. الگوریتم پیمایش برای کشف مؤلفه‌های همبند (Connected Components)
  const visited = new Set<string>();
  let clusterId = 0;
  const nodeClusterMap = new Map<string, number>();

  nodes.forEach(node => {
    if (!visited.has(node.id)) {
      clusterId++;
      const queue: string[] = [node.id];
      visited.add(node.id);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        nodeClusterMap.set(curr, clusterId);

        const neighbors = adj.get(curr) || [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }
  });

  // ۳. اعمال رنگ‌آمیزی و برچسب خوشه به نودها و یال‌ها
  nodes.forEach(node => {
    const cId = nodeClusterMap.get(node.id) || 1;
    const clusterColor = this.clusterPalette[(cId - 1) % this.clusterPalette.length];
    
    node.clusterId = cId;

    // اگر نود قبلاً به عنوان لیدر طلایی هایلایت نشده باشد، رنگ خوشه را می‌گیرد
    if (!node.isLeader) {
      node.itemStyle = {
        ...(node.itemStyle || {}),
        borderColor: clusterColor,
        borderWidth: 2,
        shadowColor: `${clusterColor}55`,
        shadowBlur: 10
      };
    }

    // افزودن اطلاعات خوشه به تولتیپ
    node.clusterLabel = `خوشه شماره ${cId}`;
  });

  edges.forEach(edge => {
    const u = typeof edge.source === 'object' ? edge.source.id : edge.source;
    const cId = nodeClusterMap.get(u) || 1;
    const clusterColor = this.clusterPalette[(cId - 1) % this.clusterPalette.length];

    edge.lineStyle = {
      ...(edge.lineStyle || {}),
      color: `${clusterColor}88`,
      curveness: 0.15
    };
  });

  return clusterId;
}
  ngAfterViewInit(): void {
    setTimeout(() => this.initGraph(), 50);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['highlightedNodeId'] && this.chart) {
      this.applyHighlightFocus();
    }
    if (changes['dossierData'] || changes['currentLogs'] || changes['isInspected']) {
      if (this.chart) {
        this.renderGraph();
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

  setLayout(type: GraphLayoutType): void {
    this.activeLayout = type;
    this.renderGraph();
  }

  private initGraph(): void {
    if (!this.graphCanvas?.nativeElement) return;
    if (this.chart) {
      this.chart.dispose();
    }
    this.chart = echarts.init(this.graphCanvas.nativeElement);
    this.resizeObserver = new ResizeObserver(() => {
      this.chart?.resize();
    });
    this.resizeObserver.observe(this.graphCanvas.nativeElement);
    this.renderGraph();
  }

  private renderGraph(): void {
    if (!this.chart) return;

    this.chart.off('click');
    // ۱. پاکسازی کامل گراف قبلی از حافظه بوم
    this.chart.clear();

    const nodesMap = new Map<string, any>();
    const rawEdges: any[] = [];

    const clientW = this.graphCanvas.nativeElement.clientWidth;
    const clientH = this.graphCanvas.nativeElement.clientHeight;
    const width = (clientW && clientW > 100) ? clientW : 850;
    const height = (clientH && clientH > 100) ? clientH : 550;

    // ۲. بررسی حالت استعلام چندسوژه‌ای یا داده‌های آمده از سرور
    if (this.dossierData?.nodes && this.dossierData.nodes.length > 0) {
      const incomingNodes = this.dossierData.nodes;
      const incomingEdges = this.dossierData.edges || [];

      incomingNodes.forEach((n: any) => {
        const idStr = String(n.id);
        const isPerson = n.category === 'PERSON' || n.type === 0 || idStr.includes('PERSON');
        const isTarget = this.targetNationalId ? this.targetNationalId.includes(idStr.replace('PERSON_', '')) : false;

        nodesMap.set(idStr, {
          id: idStr,
          name: idStr,
          displayLabel: n.displayLabel || idStr,
          title: n.title || n.displayLabel || idStr,
          category: isPerson ? 'PERSON' : (idStr.includes('ACC') ? 'BANK_ACCOUNT' : 'CARGO'),
          entityType: isPerson ? 'سوژه تحت رصد' : (idStr.includes('ACC') ? 'حساب بانکی' : 'کوتاژ / سند'),
          symbol: isPerson ? SVG_ICONS['PERSON'] : (idStr.includes('ACC') ? SVG_ICONS['BANK_ACCOUNT'] : SVG_ICONS['CUSTOMS_CARGO']),
          symbolSize: isPerson ? 42 : 28,
          risk: n.riskScore || 85,
          itemStyle: {
            color: isPerson ? (isTarget ? '#ef4444' : '#f59e0b') : '#38bdf8',
            borderColor: '#ffffff',
            borderWidth: isPerson ? 2 : 1
          }
        });
      });

      incomingEdges.forEach((e: any) => {
        const src = String(e.sourceId || e.source);
        const tgt = String(e.targetId || e.target);
        if (src && tgt) {
          rawEdges.push({
            source: src,
            target: tgt,
            value: e.predicate || e.value || 'ارتباط محرز',
            lineStyle: {
              color: '#f59e0b',
              width: 2.2,
              curveness: 0.15
            }
          });
        }
      });

      // چینش دو طرفه اشخاص و اقلام
      if (this.activeLayout === 'HIERARCHY') {
        const allNodes = Array.from(nodesMap.values());
        const personNodes = allNodes.filter(n => n.category === 'PERSON');
        const otherNodes = allNodes.filter(n => n.category !== 'PERSON');

        const stepPersonY = height / (personNodes.length + 1);
        personNodes.forEach((p, idx) => {
          p.x = width * 0.22;
          p.y = Math.round(stepPersonY * (idx + 1));
          p.fixed = true;
        });

        const stepOtherY = height / (otherNodes.length + 1);
        otherNodes.forEach((o, idx) => {
          o.x = width * 0.78;
          o.y = Math.round(stepOtherY * (idx + 1));
          o.fixed = true;
        });
      }
    } 
    // ۳. فقط در صورتی که دیتای سرور وجود نداشت وارد بازرسی تک‌پرونده‌ای شو
    else if (this.isInspected && !this.dossierData?.isMultiTarget) {
      // رندر تک‌پرونده‌ای...
    } 
    else {
      const galaxy = this.buildGalaxy(this.currentLogs, width, height);
      galaxy.nodes.forEach(n => nodesMap.set(n.id, n));
      galaxy.edges.forEach(e => rawEdges.push(e));
    }

    const finalNodes = Array.from(nodesMap.values());
    const validEdges = rawEdges.filter(e => 
      nodesMap.has(String(e.source)) && nodesMap.has(String(e.target)) && e.source !== e.target
    );

    this.nodeCount = finalNodes.length;
    this.edgeCount = validEdges.length;

    // محاسبه سرشبکه و خوشه‌ها
this.computeCentralityAndHighlight(finalNodes, validEdges);
const totalClusters = this.detectCommunitiesAndColorize(finalNodes, validEdges);
this.detectedClustersCount.set(totalClusters);
    // ثبت آپشن روی چارت
    this.chart.setOption({
      backgroundColor: '#070b12',
      series: [{
        type: 'graph',
        layout: this.activeLayout === 'FORCE' ? 'force' : (this.activeLayout === 'CIRCULAR' ? 'circular' : 'none'),
        data: finalNodes,
        links: validEdges,
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: [0, 8],
        label: {
          show: true,
          position: 'bottom',
          color: '#f8fafc',
          fontSize: 9.5,
          fontFamily: 'Vazirmatn, sans-serif'
        },
        lineStyle: {
          color: '#f59e0b',
          curveness: 0.15
        }
      }]
    }, true);
  }

  private applyHighlightFocus(): void {
    if (!this.chart) return;
    const currentOption = this.chart.getOption() as any;
    if (!currentOption?.series?.[0]) return;

    const targetId = this.highlightedNodeId;
    const nodes = currentOption.series[0].data || [];
    const links = currentOption.series[0].links || [];

    const updatedNodes = nodes.map((n: any) => {
      const isTarget = targetId && (
        n.id === targetId || 
        n.name === targetId ||
        String(n.id).includes(targetId) ||
        String(n.displayLabel).includes(targetId)
      );

      return {
        ...n,
        itemStyle: {
          ...(n.itemStyle || {}),
          opacity: (!targetId || isTarget) ? 1 : 0.2,
          shadowBlur: isTarget ? 20 : 0,
          shadowColor: isTarget ? '#38bdf8' : undefined
        }
      };
    });

    const updatedLinks = links.map((l: any) => {
      const src = typeof l.source === 'object' ? l.source.id : l.source;
      const tgt = typeof l.target === 'object' ? l.target.id : l.target;
      const isLinkActive = targetId ? (src === targetId || tgt === targetId) : true;

      return {
        ...l,
        lineStyle: {
          ...(l.lineStyle || {}),
          opacity: isLinkActive ? 0.95 : 0.1
        }
      };
    });

    this.chart.setOption({
      series: [{
        data: updatedNodes,
        links: updatedLinks
      }]
    });
  }
// داخل palantir-dossier-studio.component.ts

private computeCentralityAndHighlight(nodes: any[], edges: any[]): void {
  if (!nodes.length || !edges.length) return;

  const degreeMap = new Map<string, number>();

  // ۱. محاسبه درجه اتصال هر نود (Degree Centrality)
  edges.forEach((edge) => {
    const src = typeof edge.source === 'object' ? edge.source.id : edge.source;
    const tgt = typeof edge.target === 'object' ? edge.target.id : edge.target;
    degreeMap.set(src, (degreeMap.get(src) || 0) + 1);
    degreeMap.set(tgt, (degreeMap.get(tgt) || 0) + 1);
  });

  // ۲. پیدا کردن لیدر یا نقطه ثقل شبکه (بیشترین اتصالات)
  let maxDegree = 0;
  let leaderNodeId: string | null = null;

  degreeMap.forEach((degree, nodeId) => {
    if (degree > maxDegree) {
      maxDegree = degree;
      leaderNodeId = nodeId;
    }
  });

  // ۳. اعمال جلوه بصری ویژه روی لیدر و نودهای محوری
  nodes.forEach((node) => {
    const degree = degreeMap.get(node.id) || 0;
    node.degreeScore = degree;

    if (node.id === leaderNodeId && degree > 2) {
      node.isLeader = true;
      node.symbolSize = (node.symbolSize || 30) + 14;
      node.itemStyle = {
        ...node.itemStyle,
        borderColor: '#f59e0b',
        borderWidth: 3,
        shadowBlur: 25,
        shadowColor: 'rgba(245, 158, 11, 0.85)'
      };
      node.label = {
        ...node.label,
        formatter: (params: any) => `{leader|★ سرشبکه / واسط محوری}\n${params.data.displayLabel || params.data.name}`,
        rich: {
          leader: {
            color: '#fbbf24',
            backgroundColor: 'rgba(245, 158, 11, 0.2)',
            borderColor: '#f59e0b',
            borderWidth: 1,
            borderRadius: 4,
            padding: [2, 6],
            fontSize: 10,
            fontWeight: 'bold',
            align: 'center'
          }
        }
      };
    }
  });
}
  // در palantir-dossier-studio.component.ts
  private buildGalaxy(logs: DiscrepancyLog[], width: number, height: number): { nodes: any[]; edges: any[] } {
    const nodesMap = new Map<string, any>();
    const edges: any[] = [];

    // ۱. گروه‌بندی اسناد بر اساس کدهای ملی واقعی واردکنندگان (بدون ساخت هاب مصنوعی HUB_CUSTOMS)
    logs.forEach((log) => {
      const personId = `PERSON_${log.importerNationalId}`;
      const docId = `DOC_${log.orderRegNumber || log.cottageNumber || log.id}`;

      // افزودن نود شخص/شرکت واقعی
      if (!nodesMap.has(personId)) {
        nodesMap.set(personId, {
          id: personId,
          name: personId,
          displayLabel: `کد ملی: ${log.importerNationalId}`,
          title: `سوژه ${log.importerNationalId}`,
          category: 'PERSON',
          entityType: 'شخص / شرکت واردکننده',
          symbol: SVG_ICONS['PERSON'],
          symbolSize: 36,
          risk: log.riskScore || 90,
          itemStyle: { color: '#ef4444', borderColor: '#ffffff', borderWidth: 1.5 }
        });
      }

      // افزودن نود کوتاژ / ثبت سفارش
      if (!nodesMap.has(docId)) {
        nodesMap.set(docId, {
          id: docId,
          name: docId,
          displayLabel: log.cottageNumber || log.orderRegNumber || docId,
          title: log.ruleName || 'سند گمرکی',
          category: 'CARGO',
          entityType: 'کوتاژ / اظهارنامه',
          symbol: SVG_ICONS['CUSTOMS_CARGO'],
          symbolSize: 26,
          risk: log.riskScore || 80,
          itemStyle: { color: '#38bdf8', borderColor: '#0284c7', borderWidth: 1 }
        });
      }

      // ایجاد یال واقعی بین هر شخص و اسناد خودش
      edges.push({
        source: personId,
        target: docId,
        value: log.ruleName || 'اظهار گمرکی',
        lineStyle: { color: 'rgba(245, 158, 11, 0.45)', width: 1.5, curveness: 0.1 }
      });
    });

    // ۲. جایگذاری مناسب گره‌ها در صفحه
    const nodes = Array.from(nodesMap.values());
    const personNodes = nodes.filter(n => n.category === 'PERSON');
    const docNodes = nodes.filter(n => n.category === 'CARGO');

    // اشخاص در ستون سمت چپ
    const stepPersonY = height / (personNodes.length + 1);
    personNodes.forEach((p, idx) => {
      p.x = width * 0.25;
      p.y = Math.round(stepPersonY * (idx + 1));
      p.fixed = true;
    });

    // کوتاژها در ستون سمت راست متصل به مالکان واقعی
    const stepDocY = height / (docNodes.length + 1);
    docNodes.forEach((d, idx) => {
      d.x = width * 0.75;
      d.y = Math.round(stepDocY * (idx + 1));
      d.fixed = true;
    });

    return { nodes, edges };
  }
}