import { Component, OnInit, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { AuditService } from '../../core/services/audit.service';
import {
  DiscrepancyLog,
  CkdCase,
  DomainType,
  DomainOption,
  WaybillCorrelationReport
} from '../../core/models/discrepancy.model';
import { DossierService, MultiHopDossierGraph } from '../../core/services/dossier.service';
import { PalantirDossierStudioComponent } from './components/palantir-dossier-studio/palantir-dossier-studio.component';
import { GeospatialIntelMapComponent } from './components/geospatial-intel-map/geospatial-intel-map.component';
import { CaseTimelineBarComponent, TimelineRangeEvent } from './components/case-timeline-bar/case-timeline-bar.component';
import { ForensicReportModalComponent } from './components/forensic-report-modal/forensic-report-modal.component';
import { CkdGraphComponent } from './components/ckd-graph/ckd-graph.component';

@Component({
  selector: 'app-audit-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PalantirDossierStudioComponent,
    GeospatialIntelMapComponent,
    CaseTimelineBarComponent,
    ForensicReportModalComponent,
    CkdGraphComponent
  ],
  templateUrl: './audit-dashboard.component.html',
  styleUrl: './audit-dashboard.component.scss'
})
export class AuditDashboardComponent implements OnInit {
  @ViewChild(PalantirDossierStudioComponent) dossierStudio?: PalantirDossierStudioComponent;
  @ViewChild(CaseTimelineBarComponent) timelineBar!: CaseTimelineBarComponent;
  @ViewChild('iranMapCanvas') iranMapCanvas!: ElementRef<HTMLDivElement>;

  activePlaybackHour = signal<number | null>(null);
  timelineFilter = signal<{ startHour: number; endHour: number; active: boolean }>({
    startHour: 0,
    endHour: 23,
    active: false
  });

  private auditService = inject(AuditService);
  private dossierService = inject(DossierService);

  activeRightView = signal<'MAP' | 'GRAPH' | 'CKD' | 'OCR'>('GRAPH');
  protected readonly Math = Math;

  logs = signal<DiscrepancyLog[]>([]);
  loading = signal<boolean>(false);
  searchTerm = signal<string>('');
  minRiskFilter = signal<number>(0);
  selectedLogForModal = signal<DiscrepancyLog | null>(null);
  activeProjectionFields = signal<any>(null);

  currentPage = signal<number>(1);
  pageSize = signal<number>(10);
  pageSizeOptions = [10, 25, 50, 100];
  selectedOrderForCkd = signal<string | null>(null);
  currentDomain = this.auditService.activeDomain;
  currentDossierData = signal<MultiHopDossierGraph | any>(null);

  // وضعیت‌های هوش مصنوعی و بینایی ماشین بارنامه
  isOcrProcessing = signal<boolean>(false);
  ocrResult = signal<any | null>(null);
  fullDocumentDossier = signal<any | null>(null);
  graphInjectionData = signal<any | null>(null);
  isGraphInjected = signal<boolean>(false);
  selectedOcrFile = signal<File | null>(null);
  ocrImagePreviewUrl = signal<string | null>(null);
  ocrErrorMessage = signal<string | null>(null);

  // نتایج تطبیق تاریخی سوابق
  historicalCorrelationReport = signal<WaybillCorrelationReport | null>(null);
  isCorrelatingHistory = signal<boolean>(false);

  domainOptions: readonly DomainOption[] = [
    { id: 'CUSTOMS', label: '🛃 گمرک و تجارت خارجی', desc: 'صمت، بانک مرکزی و کوتاژهای گمرک' },
    { id: 'BANKING', label: '💳 تراکنش‌های بانکی و AML', desc: 'سوئیچ شتاب، پولشویی و مغایرت هسته' },
    { id: 'TELECOM', label: '📡 ارتباطات و دیتای CDR', desc: 'سوئیچ مخابرات، سیم‌باکس و شاهکار' }
  ] as const;

  showGalaxyGraph = signal<boolean>(false);
  focusedNationalId = signal<string>('');
  focusedOrderInGalaxy = signal<string | null>(null);

  inspectedItem = signal<any | null>(null);
  isReportModalOpen = signal(false);
  selectedTableItem = signal<DiscrepancyLog | any | null>(null);
  highlightedTimelineId = signal<string | null>(null);
  isDossierLoading = signal<boolean>(false);
  isTimelineLoading = signal<boolean>(false);
  inspectingRowId = signal<string | null>(null);

  investigationTargets = signal<{ id: string; value: string }[]>([
    { id: 'target_1', value: '14001000484' },
    { id: 'target_2', value: '14001000260' }
  ]);

  noLinkWarning = signal<string | null>(null);

  selectedRelationTypes = signal<{ banking: boolean; telecom: boolean; customs: boolean }>({
    banking: true,
    telecom: true,
    customs: true
  });

  private currentDossierSub: any = null;

  ngOnInit(): void {
    this.fetchLogs();
  }

  trackByTargetId(index: number, item: { id: string; value: string }): string {
    return item.id;
  }

  onTimeRangeChanged(event: TimelineRangeEvent): void {
    if (event.preset === 'ALL') {
      this.timelineFilter.set({ startHour: 0, endHour: 23, active: false });
    } else {
      this.timelineFilter.set({
        startHour: event.startHour,
        endHour: event.endHour,
        active: true
      });
    }
  }

  addTargetInput(): void {
    this.investigationTargets.update(list => [
      ...list,
      { id: `target_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, value: '' }
    ]);
  }

  removeTargetInput(index: number): void {
    if (this.investigationTargets().length > 2) {
      this.investigationTargets.update(list => list.filter((_, i) => i !== index));
    }
  }

  updateTargetInput(index: number, event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const list = this.investigationTargets();
    if (list[index]) {
      list[index].value = inputEl.value;
    }
  }

  runMultiTargetInvestigation(): void {
    const cleanIds = this.investigationTargets()
      .map(x => x.value.trim())
      .filter(x => x.length > 0);

    if (cleanIds.length < 2) {
      alert('لطفاً حداقل دو کد ملی یا شناسه وارد کنید.');
      return;
    }

    this.noLinkWarning.set(null);
    this.isDossierLoading.set(true);
    this.isTimelineLoading.set(true);

    this.inspectedItem.set(null);
    this.selectedTableItem.set(null);
    this.focusedNationalId.set(cleanIds.join(' , '));

    const rel = this.selectedRelationTypes();
    const activeTypes: ('BANKING' | 'TELECOM' | 'CUSTOMS')[] = [];
    if (rel.banking) activeTypes.push('BANKING');
    if (rel.telecom) activeTypes.push('TELECOM');
    if (rel.customs) activeTypes.push('CUSTOMS');

    this.dossierService.queryMultiEntityLinks({
      identifiers: cleanIds,
      relationTypes: activeTypes,
      maxDepth: 2
    }).subscribe({
      next: (res: any) => {
        const rawNodes = res.nodes || [];
        const rawEdges = res.edges || [];

        this.currentDossierData.set({
          isMultiTarget: true,
          targetNid: cleanIds.join(' ⟷ '),
          nodes: [...rawNodes],
          edges: [...rawEdges],
          timestamp: Date.now()
        });

        if (rawNodes.length > 0) {
          const tableRecords: DiscrepancyLog[] = [];
          rawNodes.forEach((node: any, idx: number) => {
            const isDoc = String(node.id).startsWith('DOC_') || node.type === 3;
            const isAcc = String(node.id).startsWith('ACC_') || String(node.id).includes('IR-ACC');

            if (isDoc || isAcc) {
              const code = node.properties?.OrderRegNumber || node.id;
              tableRecords.push({
                id: node.id,
                orderRegNumber: code,
                importerNationalId: cleanIds[idx % cleanIds.length],
                cottageNumber: code,
                ruleName: 'پیوند زنجیره‌ای سوژه‌ها (تراکنش / اظهارنامه مشترک)',
                description: `مورد شناسایی‌شده در شبکه ارتباطی بین ${cleanIds.join(' و ')}`,
                riskScore: node.riskScore || 94,
                detectedAt: new Date().toISOString(),
                domainType: isAcc ? 'BANKING' : 'CUSTOMS'
              } as any);
            }
          });

          if (tableRecords.length > 0) {
            this.logs.set(tableRecords);
            this.selectedTableItem.set(tableRecords[0]);
          }
        }

        this.activeRightView.set('GRAPH');
        this.isDossierLoading.set(false);
        this.isTimelineLoading.set(false);
      },
      error: (err) => {
        console.error('خطا در واکشی استعلام چندسوژه‌ای:', err);
        this.isDossierLoading.set(false);
        this.isTimelineLoading.set(false);
      }
    });
  }

  switchRightView(view: 'MAP' | 'GRAPH' | 'CKD' | 'OCR'): void {
    this.activeRightView.set(view);
  }

  onOcrFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.selectedOcrFile.set(file);
      this.ocrErrorMessage.set(null);
      this.ocrResult.set(null);
      this.fullDocumentDossier.set(null);
      this.historicalCorrelationReport.set(null);
      this.isGraphInjected.set(false);

      const reader = new FileReader();
      reader.onload = () => {
        this.ocrImagePreviewUrl.set(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  // اجرای پیوسته و هوشمند: استخراج انتولوژی بارنامه + تطبیق خودکار سوابق تاریخی فرد
  executeDocumentOcrAudit(): void {
    const file = this.selectedOcrFile();
    if (!file) {
      this.ocrErrorMessage.set('لطفاً ابتدا تصویر بارنامه یا فاکتور کاغذی را بارگذاری نمایید.');
      return;
    }

    this.isOcrProcessing.set(true);
    this.ocrErrorMessage.set(null);

    const formData = new FormData();
    formData.append('file', file, file.name);

    const activeItem = this.inspectedItem() || (this.paginatedLogs().length > 0 ? this.paginatedLogs()[0] : null);
    const currentOrder = activeItem?.orderRegNumber || activeItem?.cottageNumber || 'NTSW-100K-100000';
    const currentDesc = activeItem?.ruleName || 'بیش‌بود ارزش / قطعات منفصله الکترونیکی';
    const importerName = activeItem?.importerNationalId ? `شرکت واردکننده ${activeItem.importerNationalId}` : 'شرکت بازرگانی واردات';

    const systemData = {
      order_reg_number: currentOrder,
      goods_description: currentDesc,
      total_usd: 85000.0,
      importer_name: importerName
    };

    formData.append('system_data_json', JSON.stringify(systemData));

    this.auditService.auditDocumentWaybill(formData).subscribe({
      next: (res) => {
        this.ocrResult.set(res);
        this.fullDocumentDossier.set(res.document_dossier);
        this.graphInjectionData.set(res.graph_injection);
        this.isOcrProcessing.set(false);

        // بلافاصله سوابق تاریخی شخص نیز واکشی می‌شود تا کاربر معطل نشود
        this.correlateWaybillWithHistoricalImports();
      },
      error: (err) => {
        console.error('خطای فراخوانی سرویس بینایی ماشین:', err);
        this.ocrErrorMessage.set('خطا در پردازش تصویر بارنامه. سرور پایتون را بررسی کنید.');
        this.isOcrProcessing.set(false);
      }
    });
  }

  correlateWaybillWithHistoricalImports(): void {
    const dossier = this.fullDocumentDossier();
    if (!dossier) return;

    this.isCorrelatingHistory.set(true);
    const targetNid = dossier.actors?.shipper?.national_code || '10102153202';
    const serial = dossier.document?.serial_number || '512776';
    const goods = dossier.cargo?.goods_description || 'انواع قطعات یدکی و واشر صنعتی';

    this.auditService.correlateWaybillHistory({
      consigneeOrShipperNationalId: targetNid,
      waybillSerial: serial,
      waybillGoodsDescription: goods
    }).subscribe({
      next: (report) => {
        this.historicalCorrelationReport.set(report);
        this.isCorrelatingHistory.set(false);
      },
      error: (err) => {
        console.error('خطا در تطبیق سوابق تاریخی از بک‌اند دات‌‌نت:', err);
        this.isCorrelatingHistory.set(false);
      }
    });
  }

  // تزریق متصل و بدون گره معلق به گراف پیوندها
  injectWaybillToGraph(): void {
    const injection = this.graphInjectionData();
    if (!injection || !injection.nodes || !injection.nodes.length) {
      alert('ابتدا باید تصویر بارنامه را تحلیل نمایید.');
      return;
    }

    const currentGraph = this.currentDossierData() || { nodes: [], edges: [] };
    const existingNodeIds = new Set(currentGraph.nodes.map((n: any) => n.id));

    const newNodes = [...currentGraph.nodes];
    injection.nodes.forEach((node: any) => {
      if (!existingNodeIds.has(node.id)) {
        newNodes.push(node);
        existingNodeIds.add(node.id);
      }
    });

    const newEdges = [...(currentGraph.edges || [])];

    // پیوند قطعی: اتصال سند بارنامه فیزیکی به گره محوری یا پرونده بازرسی‌شده
    const waybillNodeId = injection.nodes[0]?.id;
    const hubNode = currentGraph.nodes.find((n: any) => n.isLeader || n.id.startsWith('HUB_') || n.id.startsWith('ENT_') || n.id.startsWith('PERSON_'));

    if (waybillNodeId && hubNode) {
      newEdges.push({
        source: waybillNodeId,
        target: hubNode.id,
        predicate: 'CORRELATED_CARGO (محموله فیزیکی مرتبط با پرونده)',
        value: 'تطبیق فیزیکی کوتاژ',
        lineStyle: {
          color: '#f43f5e',
          width: 3.2,
          curveness: 0.2
        }
      });
    }

    injection.edges.forEach((e: any) => {
      if (existingNodeIds.has(e.source) && existingNodeIds.has(e.target)) {
        newEdges.push(e);
      }
    });

    this.currentDossierData.set({
      ...currentGraph,
      nodes: newNodes,
      edges: newEdges,
      timestamp: Date.now()
    });

    this.isGraphInjected.set(true);
    this.switchRightView('GRAPH');
  }

  inspectCase(item: any, event?: MouseEvent): void {
    event?.stopPropagation();
    if (!item) return;

    const targetNid = String(item?.importerNationalId || '14001000484');
    const caseId = item?.orderRegNumber || item?.cottageNumber;

    this.inspectingRowId.set(caseId);
    this.isDossierLoading.set(true);
    this.isTimelineLoading.set(true);

    this.selectedTableItem.set(item);
    this.inspectedItem.set({ ...item });
    this.focusedNationalId.set(targetNid);
    this.focusedOrderInGalaxy.set(caseId);
    this.selectedOrderForCkd.set(item?.orderRegNumber || null);

    if (this.currentDossierSub) {
      this.currentDossierSub.unsubscribe();
    }

    setTimeout(() => {
      this.isTimelineLoading.set(false);
    }, 150);

    this.currentDossierSub = this.dossierService.getDossier(targetNid, 2).subscribe({
      next: (data: any) => {
        const nodes = data?.nodes || [];
        const edges = data?.edges || [];

        this.currentDossierData.set({
          ...data,
          targetNid: targetNid,
          inspectedRecord: { ...item },
          nodes: [...nodes],
          edges: [...edges]
        });

        this.isDossierLoading.set(false);
        this.inspectingRowId.set(null);
      },
      error: () => {
        this.currentDossierData.set({
          targetNid: targetNid,
          inspectedRecord: { ...item },
          nodes: [],
          edges: []
        });
        this.isDossierLoading.set(false);
        this.inspectingRowId.set(null);
        this.isTimelineLoading.set(false);
      }
    });
  }

  selectRowItem(item: DiscrepancyLog): void {
    this.selectedTableItem.set(item);
    this.inspectCase(item);
  }

  clearInspection(): void {
    this.inspectedItem.set(null);
    this.focusedOrderInGalaxy.set(null);
    this.selectedOrderForCkd.set(null);
    this.highlightedTimelineId.set(null);
    this.loadGlobalDossier();
  }

  loadGlobalDossier(): void {
    this.inspectedItem.set(null);
    this.focusedOrderInGalaxy.set(null);
    this.buildGlobalDomainGraph(this.currentDomain(), this.logs());
  }

  private buildGlobalDomainGraph(domain: DomainType, rawLogs?: DiscrepancyLog[]): void {
    const currentLogs = rawLogs && rawLogs.length > 0 ? rawLogs : this.logs();
    if (!currentLogs || currentLogs.length === 0) return;

    const topLogs = currentLogs.slice(0, 15);
    const nodes: any[] = [];
    const edges: any[] = [];
    const addedNodeIds = new Set<string>();

    const domainHubId = `HUB_${domain}`;
    const hubLabels: Record<DomainType, string> = {
      CUSTOMS: 'سامانه جامع پایش گمرک و تجارت',
      BANKING: 'سامانه جامع نظارت بانکی و AML',
      TELECOM: 'سامانه نظارت ترافیک مخابرات (CDR)'
    };

    nodes.push({
      id: domainHubId,
      displayLabel: hubLabels[domain],
      type: 0,
      riskScore: 95,
      properties: { 'حوزه': domain, 'تعداد کل پرونده‌ها': currentLogs.length }
    });
    addedNodeIds.add(domainHubId);

    topLogs.forEach((item, index) => {
      const nid = item.importerNationalId || `ID_${index}`;
      const entityId = `ENT_${nid}_${index}`;
      if (!addedNodeIds.has(entityId)) {
        addedNodeIds.add(entityId);
        nodes.push({
          id: entityId,
          displayLabel: `${nid}`,
          type: domain === 'CUSTOMS' ? 3 : domain === 'BANKING' ? 2 : 4,
          riskScore: item.riskScore || 85,
          properties: {
            'شناسه پرونده': item.orderRegNumber,
            'عنوان تخلف': item.ruleName,
            'ریسک': `${item.riskScore}%`
          }
        });

        edges.push({
          sourceId: domainHubId,
          targetId: entityId,
          predicate: domain === 'CUSTOMS' ? 'اظهارنامه گمرکی' : domain === 'BANKING' ? 'گردش مالی مشکوک' : 'ترافیک سلولی',
          weight: item.riskScore || 60
        });
      }
    });

    this.currentDossierData.set({
      rootEntityId: domainHubId,
      exploredDepth: 1,
      nodes: [...nodes],
      edges: [...edges]
    });
  }

  switchDomain(domain: DomainType): void {
    this.auditService.activeDomain.set(domain);
    this.inspectedItem.set(null);
    this.focusedNationalId.set('');
    this.focusedOrderInGalaxy.set(null);
    this.currentPage.set(1);
    this.fetchLogs();
  }

  fetchLogs(): void {
    this.loading.set(true);
    const domain = this.currentDomain();

    this.auditService.getDiscrepancies(domain).subscribe({
      next: (data: any) => {
        let rawList: any[] = [];
        if (Array.isArray(data)) {
          rawList = data;
        } else if (data && Array.isArray(data.items)) {
          rawList = data.items;
        } else if (data && Array.isArray(data.data)) {
          rawList = data.data;
        }

        const records: DiscrepancyLog[] = rawList.map((item: any, idx: number) => ({
          id: item.id || item.Id || `LOG_${idx + 1}`,
          orderRegNumber: item.orderRegNumber || item.OrderRegNumber || item.order_reg_number || `ORD-${1000 + idx}`,
          importerNationalId: item.importerNationalId || item.ImporterNationalId || item.importer_national_id || '14001000484',
          cottageNumber: item.cottageNumber || item.CottageNumber || item.cottage_number || `COT-${2000 + idx}`,
          ruleName: item.ruleName || item.RuleName || item.rule_name || 'مغایرت قاعده ۲-الف در اسناد گمرکی',
          description: item.description || item.Description || item.description_text || 'شرح تخلف احراز شده توسط موتور هوش مصنوعی',
          riskScore: item.riskScore ?? item.RiskScore ?? item.risk_score ?? 90,
          detectedAt: item.detectedAt || item.DetectedAt || item.detected_at || new Date().toISOString(),
          domainType: item.domainType || item.DomainType || item.domain_type || domain
        }));

        this.logs.set(records);
        this.currentPage.set(1);
        this.loading.set(false);

        if (records.length > 0) {
          const firstItem = records[0];
          this.selectedTableItem.set(firstItem);
          this.inspectedItem.set({ ...firstItem });
          this.focusedNationalId.set(String(firstItem.importerNationalId));
          this.focusedOrderInGalaxy.set(firstItem.orderRegNumber);
          this.buildGlobalDomainGraph(domain, records);
        } else {
          this.selectedTableItem.set(null);
          this.inspectedItem.set(null);
          this.focusedNationalId.set('');
        }
      },
      error: (err) => {
        console.error('خطا در واکشی اطلاعات از دیتابیس:', err);
        this.loading.set(false);
      }
    });
  }

  selectedCkdCase = computed<CkdCase | null>(() => {
    const currentLogs = this.filteredLogs();
    if (currentLogs.length === 0) return null;

    const domain = this.currentDomain();
    const targetLog = this.selectedOrderForCkd()
      ? currentLogs.find(l => l.orderRegNumber === this.selectedOrderForCkd()) || currentLogs[0]
      : (this.inspectedItem() || currentLogs[0]);

    const relatedLogs = currentLogs.filter(l => l.importerNationalId === targetLog.importerNationalId);

    let targetTitle = 'کالای کامل مشکوک به تفکیک به قطعات منفصله (قاعده ۲-الف)';
    let roleTitle = `شرکت بازرگانی با شناسه ملی ${targetLog.importerNationalId}`;

    if (domain === 'BANKING') {
      targetTitle = 'هسته اصلی شبکه پولشویی و حساب تجمیع‌کننده (Mule Hub)';
      roleTitle = `صاحب حساب سرشاخه با کدملی ${targetLog.importerNationalId}`;
    } else if (domain === 'TELECOM') {
      targetTitle = 'خوشه مشکوک به تقلب ترافیک و دستگاه سیم‌باکس (SIM-Box Cluster)';
      roleTitle = `مشترک پرمصرف با کدملی ${targetLog.importerNationalId}`;
    }

    return {
      importerName: roleTitle,
      importerId: targetLog.importerNationalId,
      targetProduct: targetTitle,
      totalValue: relatedLogs.reduce((acc, curr) => acc + 45000, 28890000),
      parts: (relatedLogs.length > 0 ? relatedLogs : currentLogs).slice(0, 5).map((l, idx) => ({
        orderNo: l.orderRegNumber,
        hsCode: l.cottageNumber || `REF-${idx + 100}`,
        partName: l.ruleName,
        valUsd: 85000 - (idx * 15000)
      }))
    };
  });

  filteredLogs = computed(() => {
    const currentLogs = this.logs();
    const tf = this.timelineFilter();

    if (!tf.active) {
      return currentLogs;
    }

    return currentLogs.filter(log => {
      const dt = log.detectedAt ? new Date(log.detectedAt) : null;
      const hour = (dt && !isNaN(dt.getTime())) ? dt.getHours() : 12;
      return hour >= tf.startHour && hour <= tf.endHour;
    });
  });

  totalPages = computed(() => {
    const total = this.filteredLogs().length;
    const size = this.pageSize();
    return Math.max(1, Math.ceil(total / size));
  });

  paginatedLogs = computed(() => {
    const list = this.filteredLogs();
    const page = this.currentPage();
    const size = this.pageSize();
    const start = (page - 1) * size;
    return list.slice(start, start + size);
  });

  timelineFeedEvents = computed(() => {
    const item = this.selectedTableItem() || this.inspectedItem() || (this.paginatedLogs().length > 0 ? this.paginatedLogs()[0] : null);
    if (!item) return [];

    const domain = (item.domainType || this.currentDomain() || 'CUSTOMS').toUpperCase();
    const rawCode = item.orderRegNumber || item.cottageNumber || 'DOC-01';
    const risk = item.riskScore || 95;

    if (domain === 'CUSTOMS') {
      return [
        { id: `STEP_ORDER_${rawCode}`, targetDocId: rawCode, time: '۰۸:۱۵', title: 'ثبت سفارش در سامانه صمت', domain: 'CUSTOMS', risk: 20, statusDesc: 'ثبت پرونده تحت ردیف قطعات منفصله' },
        { id: `STEP_FX_${rawCode}`, targetDocId: rawCode, time: '۱۰:۳۰', title: 'تخصیص و تأمین ارز نیمایی', domain: 'CUSTOMS', risk: 45, statusDesc: 'تأیید گواهی ثبت آماری توسط بانک عامل' },
        { id: `STEP_DECL_${rawCode}`, targetDocId: rawCode, time: '۱۱:۴۵', title: `اظهار و صدور کوتاژ ${item.cottageNumber || rawCode}`, domain: 'CUSTOMS', risk: 70, statusDesc: 'ورود محموله به گمرک مقصد/مرزی' },
        { id: `STEP_ANOMALY_${rawCode}`, targetDocId: rawCode, time: '۱۲:۲۰', title: item.ruleName || 'کشف مغایرت هوش مصنوعی (قاعده ۲-الف)', domain: 'CUSTOMS', risk: risk, statusDesc: 'انطباق اجزا با کالای کامل' },
        { id: `STEP_FLAG_${rawCode}`, targetDocId: rawCode, time: '۱۲:۲۵', title: 'ارجاع به کارتابل بازرسی و توقف ترخیص', domain: 'CUSTOMS', risk: risk, statusDesc: 'صدور اخطار کم‌اظهاری حقوق ورودی' }
      ];
    }
    if (domain === 'BANKING') {
      return [
        { id: `STEP_INFLOW_${rawCode}`, targetDocId: rawCode, time: '۰۹:۰۵', title: 'واریز خرد از حساب‌های متعدد', domain: 'BANKING', risk: 60, statusDesc: 'الگوی ساختارشکنی مبالغ (Smurfing)' },
        { id: `STEP_CONCENTRATE_${rawCode}`, targetDocId: rawCode, time: '۰۹:۱۴', title: `تجمیع در حساب واسط ${rawCode}`, domain: 'BANKING', risk: 85, statusDesc: 'افزایش ناگهانی موجودی' },
        { id: `STEP_DRAIN_${rawCode}`, targetDocId: rawCode, time: '۰۹:۱۸', title: item.ruleName || 'انتقال ساتنا آنی و تخلیه حساب', domain: 'BANKING', risk: risk, statusDesc: 'واریز به حساب صرافی غیرمجاز مرزی' },
        { id: `STEP_BLOCK_${rawCode}`, targetDocId: rawCode, time: '۰۹:۲۵', title: 'انسداد سیستمی حساب و صدور هشدار AML', domain: 'BANKING', risk: risk, statusDesc: 'پرچم‌گذاری حساب Mule در شبکه بانکی' }
      ];
    }
    return [
      { id: `STEP_REG_${rawCode}`, targetDocId: rawCode, time: '۰۶:۴۰', title: 'فعال‌سازی خوشه سیم‌‌کارت در شبکه', domain: 'TELECOM', risk: 40, statusDesc: 'اتصال همزمان ۳۲ عدد IMSI به یک دکل' },
      { id: `STEP_BURST_${rawCode}`, targetDocId: rawCode, time: '۰۷:۱۵', title: 'آغاز انفجار تماس‌های خروجی بین‌الملل', domain: 'TELECOM', risk: 78, statusDesc: 'ترافیک نامتعارف ۳۰۰ تماس همزمان' },
      { id: `STEP_SIMBOX_${rawCode}`, targetDocId: rawCode, time: '۰۷:۴۸', title: item.ruleName || 'احراز قطعیت درگاه سیم‌‌باکس (Bypass)', domain: 'TELECOM', risk: risk, statusDesc: 'عدم تحرک دکل (Zero Mobility Flag)' },
      { id: `STEP_TERMINATE_${rawCode}`, targetDocId: rawCode, time: '۰۸:۰۲', title: 'مسدودسازی شماره‌ها و گزارش به رگولاتوری', domain: 'TELECOM', risk: risk, statusDesc: 'قطع اتصال فیزیکی گیت‌‌وی قاچاق' }
    ];
  });

  onTimelineEventClick(eventItem: any): void {
    if (!eventItem) return;

    const isCurrentlyActive = this.highlightedTimelineId() === eventItem.id;
    this.highlightedTimelineId.set(isCurrentlyActive ? null : eventItem.id);

    const [hStr] = (eventItem.time || '00:00').split(':');
    const parsedHour = parseInt(hStr, 10);
    if (!isNaN(parsedHour)) {
      this.activePlaybackHour.set(isCurrentlyActive ? null : parsedHour);
    }
  }

  openForensicReport(): void {
    const targets = this.investigationTargets()
      .map(t => t.value.trim())
      .filter(v => v.length > 0);

    this.activeProjectionFields.set({
      isMultiTarget: targets.length >= 2,
      targets: targets.length >= 2 ? targets : [this.focusedNationalId() || '14001000484'],
      dossierGraph: this.currentDossierData(),
      evidences: this.filteredLogs()
    });

    this.isReportModalOpen.set(true);
  }

  closeForensicReport(): void {
    this.isReportModalOpen.set(false);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) this.currentPage.set(page);
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) this.currentPage.update(p => p + 1);
  }

  prevPage(): void {
    if (this.currentPage() > 1) this.currentPage.update(p => p - 1);
  }

  exportToExcel(): void {
    const records = this.filteredLogs();
    if (records.length === 0) return;
    const data = records.map((item, idx) => ({
      'ردیف': idx + 1,
      'شناسه سند / سفارش': item.orderRegNumber,
      'شناسه ملی واردکننده': item.importerNationalId,
      'شماره کوتاژ': item.cottageNumber,
      'عنوان قانون': item.ruleName,
      'شرح مغایرت': item.description,
      'ضریب ریسک (%)': item.riskScore,
      'تاریخ کشف': new Date(item.detectedAt).toLocaleString('fa-IR')
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!views'] = [{ rightToLeft: true }];
    const wb = { Sheets: { 'مغایرت‌ها': ws }, SheetNames: ['مغایرت‌ها'] };
    XLSX.writeFile(wb, `Dideban_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  }
}