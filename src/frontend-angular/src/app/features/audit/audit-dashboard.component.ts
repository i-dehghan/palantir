// مسیر کامل فایل: src/app/features/audit/audit-dashboard.component.ts
import { Component, OnInit, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { AuditService } from '../../core/services/audit.service';
import { DiscrepancyLog, CkdCase, DomainType, DomainOption } from '../../core/models/discrepancy.model';
import { DossierService, MultiHopDossierGraph } from '../../core/services/dossier.service';
import { PalantirDossierStudioComponent } from './components/palantir-dossier-studio/palantir-dossier-studio.component';
import { GeospatialIntelMapComponent } from './components/geospatial-intel-map/geospatial-intel-map.component';
import { CaseTimelineBarComponent, TimelineRangeEvent } from './components/case-timeline-bar/case-timeline-bar.component';
import { ForensicReportModalComponent } from './components/forensic-report-modal/forensic-report-modal.component';
import { CkdGraphComponent } from './components/ckd-graph/ckd-graph.component';
import { GraphCommunitiesResult } from '../../core/services/graph-communities.service';
import { GraphCommunitiesComponent } from './components/graph-communities/graph-communities.component';

@Component({
  selector: 'app-audit-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    PalantirDossierStudioComponent,
    GeospatialIntelMapComponent,
    CaseTimelineBarComponent,
    ForensicReportModalComponent,
    CkdGraphComponent,
    GraphCommunitiesComponent
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

  readonly auth = inject(AuthService);
  private auditService = inject(AuditService);
  private dossierService = inject(DossierService);

  readonly communityAnalysis = signal<GraphCommunitiesResult | null>(null);
  readonly selectedCommunityId = signal<number | null>(null);

  activeRightView = signal<'MAP' | 'GRAPH' | 'CKD'>('GRAPH');
  protected readonly Math = Math;

  logs = signal<DiscrepancyLog[]>([]);
  loading = signal<boolean>(false);
  isRegressionRunning = signal<boolean>(false);
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

  inspectedItem = signal<any | null>(null);
  isReportModalOpen = signal(false);
  selectedTableItem = signal<DiscrepancyLog | any | null>(null);
  highlightedTimelineId = signal<string | null>(null);
  isDossierLoading = signal<boolean>(false);
  isTimelineLoading = signal<boolean>(false);
  inspectingRowId = signal<string | null>(null);

  investigationTargets = signal<{ id: string; value: string }[]>([
    { id: 'target_1', value: '' },
    { id: 'target_2', value: '' }
  ]);

  noLinkWarning = signal<string | null>(null);
  selectedRelationTypes = signal<{ banking: boolean; telecom: boolean; customs: boolean }>({
    banking: true,
    telecom: true,
    customs: true
  });

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

  runRegressionAnalysis(): void {
    this.isRegressionRunning.set(true);
    this.auditService.runRegressionReconciliation().subscribe({
      next: () => {
        this.isRegressionRunning.set(false);
        this.fetchLogs();
      },
      error: (err) => {
        console.error('خطا در اجرای رگرسیون:', err);
        this.isRegressionRunning.set(false);
      }
    });
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
                ruleName: 'پیوند زنجیره‌ای سوژه‌ها (رگرسیون و تراکنش مشترک)',
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
    this.selectedOrderForCkd.set(item?.orderRegNumber || null);

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

  clearInspection(): void {
    this.inspectedItem.set(null);
    this.focusedNationalId.set('');
    this.focusedOrderInGalaxy.set(null);
    this.selectedOrderForCkd.set(null);
    this.highlightedTimelineId.set(null);
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

        this.selectedTableItem.set(null);
        this.focusedNationalId.set('');
        this.inspectedItem.set(null);
        this.currentDossierData.set(null);
      },
      error: () => this.loading.set(false)
    });
  }

  selectedCkdCase = computed<CkdCase | null>(() => {
    const currentLogs = this.filteredLogs();
    if (currentLogs.length === 0 || !this.inspectedItem()) return null;

    const domain = this.currentDomain();
    const targetLog = this.selectedOrderForCkd()
      ? currentLogs.find(l => l.orderRegNumber === this.selectedOrderForCkd()) || this.inspectedItem()
      : this.inspectedItem();

    if (!targetLog) return null;

    const relatedLogs = currentLogs.filter(l => l.importerNationalId === targetLog.importerNationalId);

    return {
      importerName: `شرکت بازرگانی با شناسه ملی ${targetLog.importerNationalId}`,
      importerId: targetLog.importerNationalId,
      targetProduct: 'کالای کامل مشکوک به تفکیک به قطعات منفصله (قاعده ۲-الف)',
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
    const rawCode = item.orderRegNumber || item.cottageNumber || 'DOC-01';
    const risk = item.riskScore || 95;

    return [
      { id: `STEP_ORDER_${rawCode}`, targetDocId: rawCode, time: '۰۸:۱۵', title: 'ثبت سفارش در سامانه صمت', domain: domain, risk: 20, statusDesc: 'ثبت پرونده تحت ردیف قطعات منفصله' },
      { id: `STEP_FX_${rawCode}`, targetDocId: rawCode, time: '۱۰:۳۰', title: 'تخصیص و تأمین ارز نیمایی', domain: domain, risk: 45, statusDesc: 'تأیید گواهی ثبت آماری توسط بانک عامل' },
      { id: `STEP_DECL_${rawCode}`, targetDocId: rawCode, time: '۱۱:۴۵', title: `اظهار و صدور کوتاژ ${item.cottageNumber || rawCode}`, domain: domain, risk: 70, statusDesc: 'ورود محموله به گمرک مقصد/مرزی' },
      { id: `STEP_ANOMALY_${rawCode}`, targetDocId: rawCode, time: '۱۲:۲۰', title: item.ruleName || 'کشف مغایرت رگرسیون و هوش مصنوعی', domain: domain, risk: risk, statusDesc: 'انطباق آماری با مدل‌های مرجع' },
      { id: `STEP_FLAG_${rawCode}`, targetDocId: rawCode, time: '۱۲:۲۵', title: 'ارجاع به کارتابل بازرسی و توقف ترخیص', domain: domain, risk: risk, statusDesc: 'صدور اخطار کم‌اظهاری حقوق ورودی' }
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
      targets: targets.length >= 2 ? targets : [this.focusedNationalId()],
      dossierGraph: this.currentDossierData()
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