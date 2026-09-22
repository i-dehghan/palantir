import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RulesService } from '../../core/services/rules.service';
import { ReconciliationRule, CreateRuleDto, MatchingStrategy } from '../../core/models/rule.model';

@Component({
  selector: 'app-rules-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rules-management.component.html',
  styleUrl: './rules-management.component.scss'
})
export class RulesManagementComponent implements OnInit {
  private rulesService = inject(RulesService);
  private cdr = inject(ChangeDetectorRef);

  rules: ReconciliationRule[] = [];
  loading = false;
  saving = false;

  newRule: CreateRuleDto = {
    ruleName: '',
    sourceTableA: 'ntsw_orders',
    sourceFieldA: 'hs_code',
    sourceTableB: 'epl_declarations',
    sourceFieldB: 'declared_hs_code',
    strategy: MatchingStrategy.Exact,
    toleranceOrThreshold: 1.0
  };

  ngOnInit(): void {
    this.fetchRules();
  }

  fetchRules(): void {
    this.loading = true;
    this.cdr.markForCheck();

    this.rulesService.getRules().subscribe({
      next: (data) => {
        this.rules = data || [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  createRule(): void {
    if (!this.newRule.ruleName.trim()) {
      alert('عنوان قانون الزامی است.');
      return;
    }

    this.saving = true;
    const payload = {
      ...this.newRule,
      strategy: Number(this.newRule.strategy),
      toleranceOrThreshold: Number(this.newRule.toleranceOrThreshold)
    };

    this.rulesService.createRule(payload).subscribe({
      next: () => {
        this.saving = false;
        this.newRule.ruleName = '';
        this.fetchRules();
      },
      error: () => {
        this.saving = false;
        alert('خطا در ثبت قانون جدید!');
      }
    });
  }

  toggleRule(id: number): void {
    this.rulesService.toggleRuleStatus(id).subscribe(() => this.fetchRules());
  }

  deleteRule(id: number): void {
    if (!confirm('آیا از حذف این قانون اطمینان دارید؟')) return;
    this.rulesService.deleteRule(id).subscribe(() => this.fetchRules());
  }

  getStrategyTitle(strategy: MatchingStrategy): string {
    switch (Number(strategy)) {
      case MatchingStrategy.Exact: return 'تطابق مستقیم (Exact)';
      case MatchingStrategy.NumericTolerance: return 'تلورانس عددی (Tolerance)';
      case MatchingStrategy.FuzzyText: return 'تطبیق فازی/هوشمند (Fuzzy/NLP)';
      default: return 'سایر';
    }
  }
}