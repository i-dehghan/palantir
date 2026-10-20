import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AccountLockout {
  id: string;
  userName: string;
  isActive: boolean;
  failedLoginCount: number;
  lockoutEndUtc: string | null;
}

@Injectable({ providedIn: 'root' })
export class AccountSecurityService {
  private readonly http = inject(HttpClient);
  private readonly base = 'http://localhost:5191/api/account-security';

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.base}/change-password`, { currentPassword, newPassword });
  }
  resetPassword(userId: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.base}/users/${encodeURIComponent(userId)}/reset-password`, { newPassword });
  }
  getLockouts(): Observable<AccountLockout[]> {
    return this.http.get<AccountLockout[]>(`${this.base}/users/lockouts`);
  }
  unlock(userId: string): Observable<void> {
    return this.http.post<void>(`${this.base}/users/${encodeURIComponent(userId)}/unlock`, {});
  }
}
