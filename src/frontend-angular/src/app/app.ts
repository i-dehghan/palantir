import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuditDashboardComponent } from './features/audit/audit-dashboard.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, AuditDashboardComponent],
  template: `
    <app-audit-dashboard></app-audit-dashboard>
  `,
  styles: [`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      margin: 0;
      padding: 0;
    }
  `]
})
export class App {
  title = 'dideban-platform';
}

// جهت سازگاری با ایمپورت‌های احتمالی دیگر در پروژه
export { App as AppComponent };