import { Component, OnInit, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { AuditService } from '../../core/services/audit.service';
import { DiscrepancyLog, CkdCase, DomainType, DomainOption, MultiEntityLinkGraph } from '../../core/models/discrepancy.model';
import { DossierService, MultiHopDossierGraph } from '../../core/services/dossier.service';
import { PalantirDossierStudioComponent } from './components/palantir-dossier-studio/palantir-dossier-studio.component';
import { GeospatialIntelMapComponent } from './components/geospatial-intel-map/geospatial-intel-map.component';
import { CaseTimelineBarComponent, QuickDatePreset, TimelineRangeEvent } from './components/case-timeline-bar/case-timeline-bar.component';
import { ForensicReportModalComponent } from './components/forensic-report-modal/forensic-report-modal.component';
import { CkdGraphComponent } from './components/ckd-graph/ckd-graph.component'; // <-- اضافه شده

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
    CkdGraphComponent // <-- اضافه شده
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

  // حالت‌های نمای راست: گراف پیوندی | نقشه وکتوری | ساختار درختی تفکیک قطعات (CKD)
  activeRightView = signal<'MAP' | 'GRAPH' | 'CKD'>('GRAPH');
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

  domainOptions: readonly DomainOption[] = [
    { id: 'CUSTOMS', label: '🛃 گمرک و تجارت خارجی', desc: 'صمت، بانک مرکزی و کوتاژهای گمرک' },
    { id: 'BANKING', label: '💳 تراکنش‌های بانکی و AML', desc: 'سوئیچ شتاب، پولشویی و مغایرت هسته' },
    { id: 'TELECOM', label: '📡 ارتباطات و دیتای CDR', desc: 'سوئیچ مخابرات، سیم‌باکس و شاهکار' }
  ] as const;

  showGalaxyGraph = signal<boolean>(false);
  focusedNationalId = signal<string>('');
  focusedOrderInGalaxy = signal<string | null>(null);

  selectedTimeWindow = signal<{
    preset: 'TODAY' | 'YESTERDAY' | 'LAST_7D' | 'ALL';
    startHour: string;
    endHour: string;
    start: string;
    end: string;
  }>({
    preset: 'TODAY',
    startHour: '00:00',
    endHour: '22:00',
    start: '00:00',
    end: '22:00'
  });

  inspectedItem = signal<any | null>(null);
  isReportModalOpen = signal(false);
  selectedTableItem = signal<DiscrepancyLog | any | null>(null);
  highlightedTimelineId = signal<string | null>(null);
  isDossierLoading = signal<boolean>(false);
  isTimelineLoading = signal<boolean>(false);
  inspectingRowId = signal<string | null>(null);

  searchQuery = signal<string>(''); // کدملی یا شماره همراه واردشده
  selectedAnalysisDepth = signal<number>(2); // عمق رابطه (1-Hop یا 2-Hop)
  linkFilterDomains = signal<DomainType[]>(['CUSTOMS', 'BANKING', 'TELECOM']);

  // در audit-dashboard.component.ts

// ۱. نگهداری اهداف با شناسه یکتا برای تثبیت در DOM
investigationTargets = signal<{ id: string; value: string }[]>([
  { id: 'target_1', value: '' },
  { id: 'target_2', value: '' }
]);

noLinkWarning = signal<string | null>(null);
// در audit-dashboard.component.ts

// تابع ردیابی اختصاصی برای ngFor
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
// افزودن سوژه جدید با کلید اختصاصی
addTargetInput(): void {
  this.investigationTargets.update(list => [
    ...list,
    { id: `target_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, value: '' }
  ]);
}

// حذف یک ورودی بدون تخریب بقیه عناصر
removeTargetInput(index: number): void {
  if (this.investigationTargets().length > 2) {
    this.investigationTargets.update(list => list.filter((_, i) => i !== index));
  }
}

// به‌روزرسانی مقدار بدون ساخت مجدد آبجکت و بدون دستکاری رفرنس
updateTargetInput(index: number, event: Event): void {
  const inputEl = event.target as HTMLInputElement;
  const list = this.investigationTargets();
  if (list[index]) {
    list[index].value = inputEl.value;
  }
}
selectedRelationTypes = signal<{ banking: boolean; telecom: boolean; customs: boolean }>({
  banking: true,
  telecom: true,
  customs: true
});
// خواندن مقادیر هنگام ارسال به سرور
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

    // ۱. پاک‌سازی صریح وضعیت پرونده تک‌نفره قبلی
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

        // ۲. بازنشانی کامل شیء پرونده با کلیدهای یکتا جهت تحریک ngOnChanges
        this.currentDossierData.set({
          isMultiTarget: true,
          targetNid: cleanIds.join(' ⟷ '),
          nodes: [...rawNodes],
          edges: [...rawEdges],
          timestamp: Date.now()
        });

        // ۳. ساخت لاگ‌های جدول از روی نودها و یال‌های بازگشتی
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

        // هدایت صریح به نمای گراف
        this.activeRightView.set('GRAPH');
        this.isDossierLoading.set(false);
        this.isTimelineLoading.set(false);
      },
      error: (err) => {
        console.error('خطا در واکشی استعلام:', err);
        this.isDossierLoading.set(false);
        this.isTimelineLoading.set(false);
      }
    });
  }

  private currentDossierSub: any = null;

  ngOnInit(): void {
    this.fetchLogs();
  }

  switchRightView(view: 'MAP' | 'GRAPH' | 'CKD'): void {
    this.activeRightView.set(view);
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
    this.selectedOrderForCkd.set(item?.orderRegNumber || null); // اتصال به درخت CKD

    if (this.currentDossierSub) {
      this.currentDossierSub.unsubscribe();
    }

    setTimeout(() => {
      this.isTimelineLoading.set(false);
    }, 200);

    this.currentDossierSub = this.dossierService.getDossier(targetNid, 2).subscribe({
      next: (data: any) => {
        this.currentDossierData.set({
          ...data,
          targetNid: targetNid,
          inspectedRecord: { ...item },
          nodes: [...(data?.nodes || [])],
          edges: [...(data?.edges || [])]
        } as any);

        this.isDossierLoading.set(false);
        this.inspectingRowId.set(null);
      },
      error: () => {
        // Fallback خودکار: اگر اندپوینت بک‌اند برای این NID داده ندهد، داده‌های پیش‌فرض محلی تولید می‌شود
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

  executePersonLinkAnalysis(identifier: string): void {
    const cleanId = (identifier || '').trim();
    if (!cleanId) return;

    this.isDossierLoading.set(true);
    this.focusedNationalId.set(cleanId);
    this.activeRightView.set('GRAPH');

    this.dossierService.getMultiHopEntityLinks(cleanId, 2).subscribe({
      next: (graphData: MultiHopDossierGraph) => {
        // تبدیل نودهای بک‌اند به استایل نودهای گراف
        const formattedNodes = (graphData.nodes || []).map(node => {
          const isTarget = node.id === cleanId || node.id === graphData.rootEntityId;
          const isPhone = node.id.startsWith('09') || node.type === 4;
          const isBank = node.type === 2 || node.id.startsWith('IR') || node.displayLabel.includes('حساب');

          let iconType = 'PERSON';
          let nodeColor = isTarget ? '#ef4444' : '#f59e0b';

          if (isPhone) {
            iconType = 'BTS_TOWER';
            nodeColor = '#38bdf8';
          } else if (isBank) {
            iconType = 'BANK_ACCOUNT';
            nodeColor = '#10b981';
          }

          return {
            id: node.id,
            name: node.id,
            displayLabel: node.displayLabel || node.id,
            category: iconType,
            entityType: isPhone ? 'شماره همراه / ارتباط مخابراتی' : isBank ? 'حساب بانکی / تراکنش AML' : 'سوژه انسانی / شرکت',
            risk: node.riskScore || 85,
            title: node.displayLabel,
            symbolSize: isTarget ? 42 : 28,
            itemStyle: {
              color: nodeColor,
              borderColor: isTarget ? '#38bdf8' : '#ffffff',
              borderWidth: isTarget ? 3 : 1
            }
          };
        });

        // تبدیل یال‌های ارتباطی (تماس، ساتنا، کوتاژ)
        const formattedEdges = (graphData.edges || []).map(edge => {
          const pred = edge.predicate || '';
          let edgeColor = '#94a3b8';

          if (pred.includes('تماس') || pred.includes('پیامک') || pred.includes('سلولی')) {
            edgeColor = '#38bdf8'; // مخابرات
          } else if (pred.includes('واریز') || pred.includes('ساتنا') || pred.includes('انتقال')) {
            edgeColor = '#10b981'; // بانکی
          } else if (pred.includes('گمرک') || pred.includes('کوتاژ') || pred.includes('سفارش')) {
            edgeColor = '#f59e0b'; // گمرک
          }

          return {
            source: edge.sourceId,
            target: edge.targetId,
            value: edge.predicate,
            lineStyle: {
              color: edgeColor,
              width: Math.min(4, Math.max(1.5, (edge.weight || 20) / 25)),
              curveness: 0.12
            }
          };
        });

        this.currentDossierData.set({
          targetNid: cleanId,
          rootEntityId: graphData.rootEntityId,
          nodes: formattedNodes,
          edges: formattedEdges
        });

        this.isDossierLoading.set(false);
      },
      error: () => {
        this.isDossierLoading.set(false);
      }
    });
  }

  selectRowItem(item: DiscrepancyLog): void {
    this.selectedTableItem.set(item);
    this.inspectCase(item);
  }

  clearInspection(): void {
    this.inspectedItem.set(null);
    this.focusedNationalId.set('');
    this.focusedOrderInGalaxy.set(null);
    this.selectedOrderForCkd.set(null);
    this.highlightedTimelineId.set(null);
    this.loadGlobalDossier();
  }

  loadGlobalDossier(): void {
    this.inspectedItem.set(null);
    this.focusedNationalId.set('');
    this.focusedOrderInGalaxy.set(null);
    this.buildGlobalDomainGraph(this.currentDomain(), this.logs());
  }

  private buildGlobalDomainGraph(domain: DomainType, rawLogs?: DiscrepancyLog[]): void {
    const currentLogs = rawLogs && rawLogs.length > 0 ? rawLogs : this.logs();
    if (!currentLogs || currentLogs.length === 0) return;

    const topLogs = currentLogs.slice(0, 10);
    const nodes: any[] = [];
    const edges: any[] = [];
    const addedNodeIds = new Set<string>();

    const domainHubId = `HUB_${domain}`;
    const hubLabels: Record<DomainType, string> = {
      CUSTOMS: 'سامانه جامع پایش گمرک',
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
      const rawList = Array.isArray(data) ? data : (data?.items || []);
      const records = Array.isArray(rawList) ? rawList : [];

      this.logs.set(records);
      this.currentPage.set(1);
      this.loading.set(false);

      // پاک کردن انتخاب‌های قبلی در لود اولیه
      this.selectedTableItem.set(null);
      this.focusedNationalId.set('');
      this.inspectedItem.set(null);

      // در صورت تمایل می‌توانید گراف کلی شبکه را با کل رکوردها رسم کنید 
      // یا بوم گراف را تا زمان اقدام کاربر خالی بگذارید:
      if (records.length > 0) {
        this.buildGlobalDomainGraph(domain, records);
      }
    },
    error: () => this.loading.set(false)
  });
}
  // محاسبه درختی اطلاعات پرونده تفکیک قطعات بر اساس سطر انتخاب‌شده
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
    const hour = (dt && !isNaN(dt.getTime())) ? dt.getHours() : 0;
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
    const id = item.orderRegNumber || item.cottageNumber || 'DOC-01';
    const risk = item.riskScore || 95;

    if (domain === 'CUSTOMS') {
      return [
        { id: `STEP_ORDER_${id}`, time: '۰۸:۱۵', title: 'ثبت سفارش در سامانه صمت', domain: 'CUSTOMS', risk: 20, statusDesc: 'ثبت پرونده تحت ردیف قطعات منفصله' },
        { id: `STEP_FX_${id}`, time: '۱۰:۳۰', title: 'تخصیص و تأمین ارز نیمایی', domain: 'CUSTOMS', risk: 45, statusDesc: 'تأیید گواهی ثبت آماری توسط بانک عامل' },
        { id: `STEP_DECL_${id}`, time: '۱۱:۴۵', title: `اظهار و صدور کوتاژ ${item.cottageNumber || id}`, domain: 'CUSTOMS', risk: 70, statusDesc: 'ورود محموله به گمرک شهید رجایی' },
        { id: `STEP_ANOMALY_${id}`, time: '۱۲:۲۰', title: item.ruleName || 'کشف مغایرت قاعده ۲-الف (CKD)', domain: 'CUSTOMS', risk: risk, statusDesc: 'انطباق اجزا با کالای کامل' },
        { id: `STEP_FLAG_${id}`, time: '۱۲:۲۵', title: 'ارجاع به کارتابل بازرسی و توقف ترخیص', domain: 'CUSTOMS', risk: risk, statusDesc: 'صدور اخطار کم‌اظهاری حقوق ورودی' }
      ];
    }
    if (domain === 'BANKING') {
      return [
        { id: `STEP_INFLOW_${id}`, time: '۰۹:۰۵', title: 'واریز خرد از حساب‌های متعدد', domain: 'BANKING', risk: 60, statusDesc: 'الگوی ساختارشکنی مبالغ (Smurfing)' },
        { id: `STEP_CONCENTRATE_${id}`, time: '۰۹:۱۴', title: `تجمیع در حساب واسط ${id}`, domain: 'BANKING', risk: 85, statusDesc: 'افزایش ناگهانی موجودی' },
        { id: `STEP_DRAIN_${id}`, time: '۰۹:۱۸', title: item.ruleName || 'انتقال ساتنا آنی و تخلیه حساب', domain: 'BANKING', risk: risk, statusDesc: 'واریز به حساب صرافی غیرمجاز مرزی' },
        { id: `STEP_BLOCK_${id}`, time: '۰۹:۲۵', title: 'انسداد سیستمی حساب و صدور هشدار AML', domain: 'BANKING', risk: risk, statusDesc: 'پرچم‌گذاری حساب Mule در شبکه بانکی' }
      ];
    }
    return [
      { id: `STEP_REG_${id}`, time: '۰۶:۴۰', title: 'فعال‌سازی خوشه سیم‌کارت در شبکه', domain: 'TELECOM', risk: 40, statusDesc: 'اتصال همزمان ۳۲ عدد IMSI به یک دکل' },
      { id: `STEP_BURST_${id}`, time: '۰۷:۱۵', title: 'آغاز انفجار تماس‌های خروجی بین‌الملل', domain: 'TELECOM', risk: 78, statusDesc: 'ترافیک نامتعارف ۳۰۰ تماس همزمان' },
      { id: `STEP_SIMBOX_${id}`, time: '۰۷:۴۸', title: item.ruleName || 'احراز قطعیت درگاه سیم‌باکس (Bypass)', domain: 'TELECOM', risk: risk, statusDesc: 'عدم تحرک دکل (Zero Mobility Flag)' },
      { id: `STEP_TERMINATE_${id}`, time: '۰۸:۰۲', title: 'مسدودسازی شماره‌ها و گزارش به رگولاتوری', domain: 'TELECOM', risk: risk, statusDesc: 'قطع اتصال فیزیکی گیت‌وی قاچاق' }
    ];
  });

  onTimelineEventClick(eventItem: any): void {
    if (!eventItem) return;
    const targetId = eventItem.id || eventItem.rawItem?.orderRegNumber || eventItem.rawItem?.cottageNumber;
    this.highlightedTimelineId.set(this.highlightedTimelineId() === targetId ? null : targetId);
    if (this.activeRightView() !== 'GRAPH') {
      this.activeRightView.set('GRAPH');
    }
  }

  selectedTimeRange = signal<{ startHour: number; endHour: number; preset: string }>({
    startHour: 0,
    endHour: 23,
    preset: 'ALL'
  });

  // در audit-dashboard.component.ts

  onTimelineFilterChanged(event: TimelineRangeEvent): void {
    this.currentPage.set(1);
    this.selectedTimeRange.set({
      startHour: event.startHour,
      endHour: event.endHour,
      preset: event.preset
    });

    // ۱. استخراج رکوردهایی که در این بازه زمانی ثبت شده‌اند
    const activeLogs = this.filteredLogs();

    // ۲. به‌روزرسانی گراف متناسب با رکوردهای این ساعت‌ها
    if (this.currentDossierData()) {
      const activeOrderNos = new Set(activeLogs.map(l => l.orderRegNumber || l.cottageNumber));
      const activeNids = new Set(activeLogs.map(l => String(l.importerNationalId)));

      const currentNodes = this.currentDossierData().nodes || [];
      const currentEdges = this.currentDossierData().edges || [];

      // اگر بازه روی ALL نیست، نودهایی که در این ساعت‌ها فعالیتی نداشتند کم‌رنگ یا فیلتر شوند
      if (event.preset !== 'ALL' && activeLogs.length > 0) {
        const filteredNodes = currentNodes.map((n: any) => {
          const rawId = String(n.id).replace('PERSON_', '').replace('DOC_', '');
          const isRelevant = activeOrderNos.has(rawId) || activeNids.has(rawId);

          return {
            ...n,
            itemStyle: {
              ...(n.itemStyle || {}),
              opacity: isRelevant ? 1 : 0.15
            }
          };
        });

        const filteredEdges = currentEdges.map((e: any) => {
          const src = String(e.sourceId || e.source).replace('PERSON_', '').replace('DOC_', '');
          const tgt = String(e.targetId || e.target).replace('PERSON_', '').replace('DOC_', '');
          const isEdgeActive = activeOrderNos.has(tgt) || activeOrderNos.has(src) || activeNids.has(src);

          return {
            ...e,
            lineStyle: {
              ...(e.lineStyle || {}),
              opacity: isEdgeActive ? 0.95 : 0.08
            }
          };
        });

        this.currentDossierData.set({
          ...this.currentDossierData(),
          nodes: filteredNodes,
          edges: filteredEdges
        });
      } else if (event.preset === 'ALL') {
        // بازنشانی شفافیت همه نودها
        const restoredNodes = currentNodes.map((n: any) => ({
          ...n,
          itemStyle: { ...(n.itemStyle || {}), opacity: 1 }
        }));
        const restoredEdges = currentEdges.map((e: any) => ({
          ...e,
          lineStyle: { ...(e.lineStyle || {}), opacity: 0.9 }
        }));

        this.currentDossierData.set({
          ...this.currentDossierData(),
          nodes: restoredNodes,
          edges: restoredEdges
        });
      }
    }
  }

  

// در audit-dashboard.component.ts

// در audit-dashboard.component.ts
openForensicReport(): void {
  const targets = this.investigationTargets()
    .map(t => t.value.trim())
    .filter(v => v.length > 0);

  this.activeProjectionFields.set({
    isMultiTarget: targets.length >= 2,
    targets: targets.length >= 2 ? targets : [this.focusedNationalId()],
    dossierGraph: this.currentDossierData()
  });

  this.isReportModalOpen.set(true);
}
closeForensicReport(): void { this.isReportModalOpen.set(false); }

  goToPage(page: number): void { if (page >= 1 && page <= this.totalPages()) this.currentPage.set(page); }
  nextPage(): void { if (this.currentPage() < this.totalPages()) this.currentPage.update(p => p + 1); }
  prevPage(): void { if (this.currentPage() > 1) this.currentPage.update(p => p - 1); }

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