import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const backendOrigin = 'http://localhost:5191';
export const jwtInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  let url: URL;
  try { url = new URL(request.url, backendOrigin); } catch { return next(request); }
  if (url.origin !== backendOrigin || !url.pathname.toLowerCase().startsWith('/api/')) return next(request);
  const path = url.pathname.toLowerCase();
  const authEndpoint = ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout'].includes(path);
  const token = authEndpoint ? null : auth.getAccessToken();
  const outgoing = token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
  return next(outgoing).pipe(catchError((error: unknown) => {
    if (!(error instanceof HttpErrorResponse) || error.status !== 401 || authEndpoint) return throwError(() => error);
    return auth.refresh().pipe(
      switchMap(() => {
        const renewed = auth.getAccessToken();
        if (!renewed) return throwError(() => new Error('No valid access token after refresh'));
        return next(request.clone({ setHeaders: { Authorization: `Bearer ${renewed}` } }));
      }),
      catchError(refreshError => {
        auth.clearSession();
        void router.navigateByUrl('/login');
        return throwError(() => refreshError);
      })
    );
  }));
};
