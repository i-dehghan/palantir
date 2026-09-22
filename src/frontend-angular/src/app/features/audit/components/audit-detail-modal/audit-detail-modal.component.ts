import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiscrepancyLog } from '../../../../core/models/discrepancy.model';

@Component({
  selector: 'app-audit-detail-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './audit-detail-modal.component.html',
  styleUrl: './audit-detail-modal.component.scss'
})
export class AuditDetailModalComponent {
  @Input({ required: true }) log!: DiscrepancyLog;
  @Output() close = new EventEmitter<void>();

  getRiskClass(score: number): string {
    if (score >= 90) return 'badge-critical';
    if (score >= 70) return 'badge-high';
    return 'badge-medium';
  }
}