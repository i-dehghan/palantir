import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuditService } from './core/services/audit.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, AuditDashboardComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  public auditService = inject(AuditService);

  activeTab: 'audit' | 'rules' = 'audit';
  runningAudit = false;
  actionMessage = '';

  runAuditEngine(): void {
    this.runningAudit = true;
    const current = this.auditService.activeDomain();
    this.actionMessage = `در حال اجرای موتور انطباق برای حوزه ${current}...`;

    this.auditService.runAudit(current).subscribe({
      next: (res) => {
        this.actionMessage = `انطباق حوزه ${res.domain || current} پایان یافت. تعداد تخلفات ثبت‌شده: ${res.totalViolations ?? 0}`;
        this.runningAudit = false;
      },
      error: (err) => {
        this.actionMessage = err.error || 'خطا در ارتباط با سرور دات‌نت';
        this.runningAudit = false;
      }
    });
  }
}