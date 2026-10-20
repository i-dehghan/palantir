import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

export interface LoginResponse {
  accessToken: string;
  expiresAtUtc: string;
  tokenType: string;
}

export interface AuthIdentity {
  userId: string | null;
  userName: string | null;
  roles: string[];
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly apiUrl = 'http://localhost:5191/api/auth';
  private readonly tokenState = signal<string | null>(null);
  private readonly expiryState = signal<number>(0);
  private readonly identityState = signal<AuthIdentity | null>(null);

  readonly identity = this.identityState.asReadonly();
  readonly isAuthenticated = computed(() => !!this.tokenState() && Date.now() < this.expiryState());
  readonly isAdmin = computed(() => this.identityState()?.roles.includes('Admin') ?? false);

  getAccessToken(): string | null {
    const token = this.tokenState();
    if (!token || Date.now() >= this.expiryState()) {
      if (token) this.clearSession();
      return null;
    }
    return token;
  }

  login(userName: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, { userName, password }).pipe(
      tap(response => {
        const expiresAt = Date.parse(response.expiresAtUtc);
        if (!response.accessToken || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
          throw new Error('پاسخ احراز هویت معتبر نیست.');
        }
        this.identityState.set(null);
        this.expiryState.set(expiresAt);
        this.tokenState.set(response.accessToken);
      })
    );
  }

  loadIdentity(): Observable<AuthIdentity> {
    return this.http.get<AuthIdentity>(`${this.apiUrl}/me`).pipe(
      tap(identity => this.identityState.set(identity))
    );
  }

  clearSession(): void {
    this.tokenState.set(null);
    this.expiryState.set(0);
    this.identityState.set(null);
  }

  logout(): void {
    this.clearSession();
    void this.router.navigateByUrl('/login');
  }
}
