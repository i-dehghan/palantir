import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { IdentityManagementService, IdentityPermission, IdentityRole, IdentityUser } from '../../core/services/identity-management.service';

@Component({
  selector: 'app-identity-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './identity-management.component.html',
  styleUrl: './identity-management.component.scss'
})
export class IdentityManagementComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(IdentityManagementService);
  readonly users = signal<IdentityUser[]>([]);
  readonly roles = signal<IdentityRole[]>([]);
  readonly permissions = signal<IdentityPermission[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly tab = signal<'users' | 'roles'>('users');
  readonly search = signal('');
  readonly selectedUserId = signal('');
  readonly selectedRoleId = signal('');
  readonly userRoleIds = signal<string[]>([]);
  readonly rolePermissionCodes = signal<string[]>([]);
  readonly newUserName = signal('');
  readonly newPassword = signal('');
  readonly newUserRoleIds = signal<string[]>([]);
  readonly newRoleName = signal('');

  readonly filteredUsers = computed(() => {
    const q = this.search().trim().toLocaleLowerCase();
    return this.users().filter(u => !q || u.userName.toLocaleLowerCase().includes(q));
  });
  readonly selectedUser = computed(() => this.users().find(u => u.id === this.selectedUserId()) ?? null);
  readonly selectedRole = computed(() => this.roles().find(r => r.id === this.selectedRoleId()) ?? null);

  readonly activeCount = computed(() => this.users().filter(u => u.isActive).length);
  roleNames(user: IdentityUser): string { return user.roles.map(r => r.name).join('، '); }

  ngOnInit(): void { this.refresh(); }

  refresh(): void {
    if (this.loading() || this.saving()) return;
    this.loading.set(true);
    this.error.set('');
    forkJoin({ users: this.api.getUsers(), roles: this.api.getRoles(), permissions: this.api.getPermissions() }).subscribe({
      next: data => {
        this.users.set(data.users);
        this.roles.set(data.roles);
        this.permissions.set(data.permissions);
        this.selectUser(this.selectedUserId());
        this.selectRole(this.selectedRoleId());
        this.loading.set(false);
      },
      error: err => { this.error.set(this.describeError(err)); this.loading.set(false); }
    });
  }

  selectUser(id: string): void {
    const user = this.users().find(u => u.id === id);
    this.selectedUserId.set(user?.id ?? '');
    this.userRoleIds.set(user?.roles.map(r => r.id) ?? []);
  }
  selectRole(id: string): void {
    const role = this.roles().find(r => r.id === id);
    this.selectedRoleId.set(role?.id ?? '');
    this.rolePermissionCodes.set([...(role?.permissions ?? [])]);
  }
  toggleUserRole(id: string, checked: boolean): void {
    this.userRoleIds.update(xs => checked ? [...new Set([...xs, id])] : xs.filter(x => x !== id));
  }
  toggleNewUserRole(id: string, checked: boolean): void {
    this.newUserRoleIds.update(xs => checked ? [...new Set([...xs, id])] : xs.filter(x => x !== id));
  }
  toggleRolePermission(code: string, checked: boolean): void {
    this.rolePermissionCodes.update(xs => checked ? [...new Set([...xs, code])] : xs.filter(x => x !== code));
  }
  private describeError(err: any): string {
    if (err?.status === 403) return 'دسترسی مدیریتی مجاز نیست. نقش Admin باید در Backend فعال باشد.';
    if (err?.status === 401) return 'نشست منقضی شده است؛ دوباره وارد شوید.';
    if (err?.status === 409) return 'تعارض در تغییرات یا محدودیت امنیتی. اطلاعات را تازه‌سازی کنید و دوباره بررسی کنید. ' + (typeof err.error === 'string' ? err.error : '');
    if (err?.status === 400) return typeof err.error === 'string' ? err.error : 'داده‌های ورودی معتبر نیستند.';
    return 'عملیات ناموفق بود. اتصال Backend و لاگ سرور را بررسی کنید.';
  }
  private mutate(request: import('rxjs').Observable<unknown>, success: string, after?: () => void): void {
    if (this.saving()) return;
    this.saving.set(true); this.error.set(''); this.notice.set('');
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.notice.set(success);
        after?.();
        this.refresh();
      },
      error: err => { this.saving.set(false); if (err?.status === 409) { this.refresh(); this.notice.set('تعارض شناسایی شد؛ داده‌ها در حال تازه‌سازی هستند. تغییرات خود را دوباره بررسی کنید.'); } else { this.error.set(this.describeError(err)); } }
    });
  }
  createUser(): void {
    const name = this.newUserName().trim();
    const password = this.newPassword();
    if (!name || password.length < 16 || password.length > 1024) {
      this.error.set('نام کاربری الزامی و رمز عبور باید ۱۶ تا ۱۰۲۴ نویسه باشد.'); return;
    }
    this.mutate(this.api.createUser(name, password, this.newUserRoleIds()), 'کاربر ساخته شد.', () => {
      this.newUserName.set(''); this.newPassword.set(''); this.newUserRoleIds.set([]);
    });
  }
  createRole(): void {
    const name = this.newRoleName().trim();
    if (!name || name.length > 128) { this.error.set('نام نقش باید بین ۱ تا ۱۲۸ نویسه باشد.'); return; }
    this.mutate(this.api.createRole(name), 'نقش ساخته شد.', () => this.newRoleName.set(''));
  }
  saveUserRoles(): void {
    const user = this.selectedUser(); if (!user) return;
    if (!confirm(`نقش‌های کاربر «${user.userName}» جایگزین شوند؟`)) return;
    this.mutate(this.api.setUserRoles(user.id, this.userRoleIds(), user.rolesVersion), 'نقش‌های کاربر ذخیره شدند.');
  }
  saveRolePermissions(): void {
    const role = this.selectedRole(); if (!role || role.name.toUpperCase() === 'ADMIN') return;
    if (!confirm(`مجوزهای نقش «${role.name}» جایگزین شوند؟`)) return;
    this.mutate(this.api.setRolePermissions(role.id, this.rolePermissionCodes(), role.permissionsVersion), 'مجوزهای نقش ذخیره شدند.');
  }
  toggleActive(user: IdentityUser): void {
    if (user.id === this.auth.identity()?.userId && user.isActive) {
      this.error.set('غیرفعال‌کردن حساب خودتان مجاز نیست.'); return;
    }
    const action = user.isActive ? 'غیرفعال' : 'فعال';
    if (!confirm(`حساب «${user.userName}» ${action} شود؟`)) return;
    this.mutate(this.api.setActive(user.id, !user.isActive, user.rolesVersion), `حساب ${action} شد.`);
  }
}
