import { Injectable, computed, inject, signal, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';

export interface LoginResponse { accessToken: string; expiresAtUtc: string; tokenType: string; }
export interface AuthIdentity { userId: string | null; userName: string | null; roles: string[]; }

@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly apiUrl = 'http://localhost:5191/api/auth';
  private readonly tokenState = signal<string | null>(null);
  private readonly expiryState = signal(0);
  private readonly identityState = signal<AuthIdentity | null>(null);
  private refreshInFlight: Observable<LoginResponse> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionGeneration = 0;

  readonly identity = this.identityState.asReadonly();
  readonly isAuthenticated = computed(() => !!this.tokenState() && Date.now() < this.expiryState());
  readonly isAdmin = computed(() => this.identityState()?.roles.includes('Admin') ?? false);

  getAccessToken(): string | null {
    return this.tokenState() && Date.now() < this.expiryState() ? this.tokenState() : null;
  }

  private accept(response: LoginResponse, generation: number): void {
    const expiry = Date.parse(response.expiresAtUtc);
    if (!response.accessToken || !Number.isFinite(expiry) || expiry <= Date.now()) {
      throw new Error('Invalid authentication response');
    }
    if (generation !== this.sessionGeneration) return;
    this.tokenState.set(response.accessToken);
    this.expiryState.set(expiry);
    this.scheduleRefresh();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const delay = Math.max(1000, this.expiryState() - Date.now() - 60_000);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refresh().subscribe({ error: () => this.clearSession() });
    }, delay);
  }

  login(userName: string, password: string): Observable<LoginResponse> {
    const generation = ++this.sessionGeneration;
    this.clearLocalState();
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, { userName, password }, { withCredentials: true }).pipe(
      tap(response => { this.identityState.set(null); this.accept(response, generation); })
    );
  }

  refresh(): Observable<LoginResponse> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const generation = this.sessionGeneration;
    const request$ = this.http.post<LoginResponse>(`${this.apiUrl}/refresh`, {}, { withCredentials: true }).pipe(
      tap(response => this.accept(response, generation)),
      finalize(() => { if (this.refreshInFlight === request$) this.refreshInFlight = null; }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.refreshInFlight = request$;
    return request$;
  }

  ensureSession(): Observable<boolean> {
    if (this.getAccessToken()) return of(true);
    return this.refresh().pipe(map(() => !!this.getAccessToken()), catchError(() => of(false)));
  }

  loadIdentity(): Observable<AuthIdentity> {
    return this.http.get<AuthIdentity>(`${this.apiUrl}/me`).pipe(tap(identity => this.identityState.set(identity)));
  }

  private clearLocalState(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.tokenState.set(null);
    this.expiryState.set(0);
    this.identityState.set(null);
  }

  clearSession(): void { ++this.sessionGeneration; this.clearLocalState(); }

  logout(): void {
    ++this.sessionGeneration;
    this.clearLocalState();
    // Keep the HttpOnly cookie available to the server until revocation completes.
    this.http.post(`${this.apiUrl}/logout`, {}, { withCredentials: true }).subscribe({
      next: () => void this.router.navigateByUrl('/login'),
      error: () => void this.router.navigateByUrl('/login')
    });
  }

  ngOnDestroy(): void { if (this.refreshTimer) clearTimeout(this.refreshTimer); }
}
