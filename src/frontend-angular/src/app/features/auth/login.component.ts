import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly form = new FormGroup({
    userName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  });

  submit(): void {
    if (this.busy()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.busy.set(true);
    const { userName, password } = this.form.getRawValue();
    this.auth.login(userName.trim(), password).pipe(
      switchMap(() => this.auth.loadIdentity()),
      finalize(() => this.busy.set(false)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: () => {
        this.form.controls.password.reset();
        void this.router.navigateByUrl('/audit');
      },
      error: (err: unknown) => {
        this.auth.clearSession();
        if (err instanceof HttpErrorResponse) {
          this.error.set(err.status === 401 ? 'نام کاربری یا رمز عبور صحیح نیست.' :
            err.status === 429 ? 'تعداد تلاش‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.' :
            err.status === 0 ? 'ارتباط با سرور برقرار نشد. وضعیت Backend و CORS را بررسی کنید.' :
            'ورود انجام نشد. لطفاً دوباره تلاش کنید.');
        } else {
          this.error.set('پاسخ ورود معتبر نبود.');
        }
      }
    });
  }
}
