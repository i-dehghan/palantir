import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, inject, signal, computed } from '@angular/core';
import { Subscription } from 'rxjs';
import { MultiHopDossierGraph } from '../../../../core/services/dossier.service';
import { GraphCommunitiesResult, GraphCommunitiesService } from '../../../../core/services/graph-communities.service';

@Component({
  selector: 'app-graph-communities',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="community-panel" [class.collapsed]="collapsed()" dir="rtl" aria-label="تحلیل اجتماع‌های گراف">
      <header class="community-header">
        <div><strong>COMMUNITY INTELLIGENCE</strong><small>تحلیل ساختار ارتباطات · Louvain local-moving</small></div>
        <div class="header-actions"><button type="button" (click)="collapsed.set(!collapsed())" [attr.aria-expanded]="!collapsed()">{{ collapsed() ? 'بازکردن' : 'جمع‌کردن' }}</button><button type="button" (click)="refresh()" [disabled]="loading() || !graph?.nodes?.length">بازتحلیل</button></div>
      </header>
      <ng-container *ngIf="!collapsed()">
      <p *ngIf="!graph?.nodes?.length" class="muted">برای مشاهده خوشه‌ها ابتدا یک پرونده یا چند موجودیت را بررسی کنید.</p>
      <p *ngIf="loading()" class="muted" role="status">در حال تحلیل خوشه‌های ارتباطی...</p>
      <p *ngIf="error()" class="error" role="alert">{{ error() }}</p>
      <ng-container *ngIf="result() as data">
        <div class="metrics">
          <span>خوشه‌ها <b>{{ communityIds().length }}</b></span>
          <span>Modularity <b>{{ data.modularity | number:'1.3-3' }}</b></span>
          <span>گره رابط <b>{{ data.bridgeNodeIds.length }}</b></span>
        </div>
        <div class="community-filters">
          <button type="button" [class.active]="selectedCommunity() === null" (click)="selectCommunity(null)">همه</button>
          <button *ngFor="let id of communityIds(); trackBy: trackId" type="button"
            [class.active]="selectedCommunity() === id" (click)="selectCommunity(id)">
            <span class="dot" [style.background]="color(id)"></span> خوشه {{ id + 1 }} ({{ data.communitySizes[id] }})
          </button>
        </div>
        <input class="node-search" type="search" [value]="search()" (input)="search.set($any($event.target).value)" placeholder="جست‌وجوی شناسه یا عنوان گره" aria-label="جست‌وجوی گره" />
        <div class="community-nodes">
          <div *ngFor="let node of visibleNodes(); trackBy: trackNode" class="node-row"
               [style.borderRightColor]="color(data.assignments[node.id])">
            <span class="node-name">{{ node.displayLabel || node.id }}</span>
            <small>{{ node.id }}</small>
            <span *ngIf="bridgeIds().has(node.id)" class="bridge">رابط بین خوشه‌ها</span>
          </div>
        </div>
        <p class="disclaimer">عضویت در خوشه صرفاً یک ویژگی ساختاری شبکه است و نشانه تخلف یا ریسک فردی نیست.</p>
      </ng-container>
      </ng-container>
    </section>
  `,
  styles: [`
    :host { display:block; position:absolute; bottom:12px; left:12px; width:min(390px,calc(100% - 24px)); z-index:25; }
    .community-panel { color:#e2e8f0; background:rgba(8,15,27,.97); border:1px solid #284052; border-radius:12px; box-shadow:0 16px 45px #0009; padding:12px; font-size:12px; max-height:min(48vh,430px); display:flex; flex-direction:column; gap:9px; }
    .header-actions { display:flex; gap:5px; }
    .community-panel.collapsed { max-height:unset; }
    .node-search { width:100%; box-sizing:border-box; border:1px solid #31506a; border-radius:6px; background:#0c1929; color:#e2e8f0; padding:8px; }
    .community-header { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .community-header strong { font-size:12px; color:#67e8f9; letter-spacing:.08em; }
    .community-header small { display:block; color:#94a3b8; margin-top:4px; }
    button { border:1px solid #31506a; border-radius:7px; background:#122338; color:#d6efff; padding:6px 9px; cursor:pointer; font:inherit; }
    button:disabled { opacity:.5; cursor:default; } button.active { border-color:#22d3ee; background:#164054; }
    .metrics,.community-filters { display:flex; gap:6px; flex-wrap:wrap; }
    .metrics span { background:#132336; padding:7px; border-radius:6px; flex:1; white-space:nowrap; }
    .metrics b { color:#67e8f9; margin-inline-start:5px; }
    .community-filters { overflow:auto; max-height:85px; }
    .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-left:4px; }
    .community-nodes { overflow-y:auto; min-height:0; max-height:160px; display:grid; gap:5px; }
    .node-row { border-right:3px solid; background:#111e30; padding:7px; border-radius:5px; display:flex; gap:5px; flex-wrap:wrap; align-items:center; }
    .node-name { font-weight:600; } .node-row small { color:#94a3b8; overflow-wrap:anywhere; }
    .bridge { color:#fbbf24; margin-right:auto; } .muted,.disclaimer { color:#94a3b8; margin:0; }
    .disclaimer { font-size:10px; line-height:1.6; } .error { color:#fca5a5; }
  `]
})
export class GraphCommunitiesComponent implements OnChanges, OnDestroy {
  @Input() graph: MultiHopDossierGraph | null = null;
  @Output() analysisChanged = new EventEmitter<GraphCommunitiesResult | null>();
  @Output() communitySelected = new EventEmitter<number | null>();
  readonly collapsed = signal(false);
  readonly search = signal('');
  selectCommunity(id: number | null): void { this.selectedCommunity.set(id); this.communitySelected.emit(id); }
  private readonly api = inject(GraphCommunitiesService);
  private request?: Subscription;
  readonly result = signal<GraphCommunitiesResult | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly selectedCommunity = signal<number | null>(null);
  readonly communityIds = computed(() => Object.keys(this.result()?.communitySizes ?? {}).map(Number).sort((a,b) => a-b));
  readonly bridgeIds = computed(() => new Set(this.result()?.bridgeNodeIds ?? []));
  readonly visibleNodes = computed(() => {
    const data = this.result();
    if (!data) return [];
    const selected = this.selectedCommunity();
    const query = this.search().trim().toLowerCase();
    return (this.graph?.nodes ?? []).filter(n => data.assignments[n.id] !== undefined &&
      (selected === null || data.assignments[n.id] === selected) &&
      (!query || `${n.displayLabel || ''} ${n.id}`.toLowerCase().includes(query)));
  });
  ngOnChanges(): void { this.refresh(); }
  ngOnDestroy(): void { this.request?.unsubscribe(); }
  refresh(): void {
    this.request?.unsubscribe();
    this.result.set(null);
    this.analysisChanged.emit(null);
    this.selectCommunity(null);
    this.error.set('');
    if (!this.graph?.nodes?.length) { this.loading.set(false); return; }
    this.loading.set(true);
    this.request = this.api.analyze(this.graph).subscribe({
      next: result => { this.result.set(result); this.analysisChanged.emit(result); this.loading.set(false); },
      error: err => { this.error.set(err.status === 403 ? 'مجوز مشاهده تحلیل گراف وجود ندارد.' : 'تحلیل خوشه‌ها ناموفق بود. داده یا ارتباط API را بررسی کنید.'); this.loading.set(false); }
    });
  }
  color(id: number): string { return ['#22d3ee','#a78bfa','#f59e0b','#34d399','#fb7185','#60a5fa'][Math.abs(id) % 6]; }
  trackId(_index: number, id: number): number { return id; }
  trackNode(_index: number, node: { id: string }): string { return node.id; }
}
