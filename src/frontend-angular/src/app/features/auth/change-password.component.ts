import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AccountSecurityService } from '../../core/services/account-security.service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="shell" dir="rtl">
      <section class="panel">
        <p class="eyebrow">DIDEBAN / ACCOUNT SECURITY</p>
        <h1>تغییر رمز عبور</h1>
        <p class="hint">رمز جدید باید حداقل ۱۶ و حداکثر ۱۰۲۴ نویسه باشد.</p>
        <form (ngSubmit)="submit()">
          <label>رمز فعلی<input type="password" autocomplete="current-password" name="current" [ngModel]="current()" (ngModelChange)="current.set($event)" required /></label>
          <label>رمز جدید<input type="password" autocomplete="new-password" name="next" [ngModel]="next()" (ngModelChange)="next.set($event)" required /></label>
          <label>تکرار رمز جدید<input type="password" autocomplete="new-password" name="confirm" [ngModel]="confirmation()" (ngModelChange)="confirmation.set($event)" required /></label>
          <p class="error" *ngIf="error()" role="alert">{{ error() }}</p>
          <p class="success" *ngIf="notice()" role="status">{{ notice() }}</p>
          <button type="submit" [disabled]="busy()">{{ busy() ? 'در حال ثبت...' : 'تغییر رمز' }}</button>
        </form>
        <a routerLink="/audit">بازگشت به داشبورد</a>
      </section>
    </main>
  `,
  styles: [`
    :host{display:block;min-height:100vh;background:#080e19;color:#e2e8f0}
    .shell{min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box}
    .panel{width:min(100%,440px);box-sizing:border-box;padding:30px;background:#0f1929;border:1px solid #23334a;border-radius:12px}
    .eyebrow{color:#38bdf8;font-size:11px;letter-spacing:1px}.hint{color:#94a3b8;font-size:13px}
    label{display:block;margin-top:18px;font-size:13px}input{box-sizing:border-box;display:block;width:100%;margin-top:7px;padding:12px;background:#081321;color:#e2e8f0;border:1px solid #334155;border-radius:6px}
    button{width:100%;margin:20px 0;padding:12px;background:#075985;color:white;border:1px solid #0891b2;border-radius:7px;cursor:pointer}button:disabled{opacity:.5}
    a{color:#67e8f9}.error{color:#fca5a5}.success{color:#6ee7b7}
  `]
})
export class ChangePasswordComponent {
  private readonly api = inject(AccountSecurityService);
  readonly current = signal('');
  readonly next = signal('');
  readonly confirmation = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  submit(): void {
    if (this.busy()) return;
    this.error.set(''); this.notice.set('');
    if (this.next().length < 16 || this.next().length > 1024 || this.next() !== this.confirmation()) {
      this.error.set('رمز جدید باید ۱۶ تا ۱۰۲۴ نویسه باشد و تکرار آن مطابقت داشته باشد.'); return;
    }
    this.busy.set(true);
    this.api.changePassword(this.current(), this.next()).pipe(finalize(() => this.busy.set(false))).subscribe({
      next: () => { this.current.set(''); this.next.set(''); this.confirmation.set(''); this.notice.set('رمز عبور با موفقیت تغییر کرد.'); },
      error: err => this.error.set(err?.status === 400 ? 'رمز فعلی نادرست است یا رمز جدید معتبر نیست.' : err?.status === 401 ? 'نشست معتبر نیست؛ دوباره وارد شوید.' : 'تغییر رمز انجام نشد. وضعیت سرور را بررسی کنید.')
    });
  }
}
