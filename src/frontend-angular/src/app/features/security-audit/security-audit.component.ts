import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SecurityAuditEvent, SecurityAuditService, SecurityAuditVerification } from '../../core/services/security-audit.service';

@Component({
  selector: 'app-security-audit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DatePipe],
  templateUrl: './security-audit.component.html',
  styleUrl: './security-audit.component.scss'
})
export class SecurityAuditComponent implements OnInit {
  private readonly api = inject(SecurityAuditService);
  readonly auth = inject(AuthService);
  readonly events = signal<SecurityAuditEvent[]>([]);
  readonly verification = signal<SecurityAuditVerification | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly take = signal(50);
  readonly eventType = signal('');
  readonly search = signal('');
  readonly selected = signal<SecurityAuditEvent | null>(null);
  readonly types = ['','Auth.LoginSucceeded','Auth.LoginFailed','Auth.AccessDenied','Identity.UserCreated','Identity.UserActiveChanged','Identity.RoleCreated','Identity.UserRolesChanged','Identity.RolePermissionsChanged'];
  readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.events().filter(e => !q || [e.eventType,e.actorUserId,e.target,e.outcome,e.correlationId,String(e.id)].some(x => (x ?? '').toLowerCase().includes(q)));
  });
  ngOnInit(): void { this.refresh(); }
  refresh(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    forkJoin({events:this.api.getEvents(this.take(),this.eventType()), verification:this.api.verify()}).subscribe({
      next: ({events,verification}) => {
        this.events.set(events);
        this.verification.set(verification);
        this.selected.set(null);
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err.status === 403 ? 'دسترسی به گزارش امنیتی مجاز نیست.' : err.status === 401 ? 'نشست شما منقضی شده است.' : 'دریافت اطلاعات امنیتی ناموفق بود. اتصال Backend را بررسی کنید.');
      }
    });
  }
  trackEvent(_index: number, event: SecurityAuditEvent): number { return event.id; }
}
