import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const backendOrigin = 'http://localhost:5191';

export const jwtInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  let url: URL;
  try {
    url = new URL(request.url, backendOrigin);
  } catch {
    return next(request);
  }

  // Never forward DIDEBAN's .NET JWT to Python, external services or other ports.
  const internalApi = url.origin === backendOrigin &&
    (url.pathname.toLowerCase() === '/api' || url.pathname.toLowerCase().startsWith('/api/'));
  if (!internalApi) return next(request);

  const isLogin = url.pathname.toLowerCase() === '/api/auth/login';
  const token = !isLogin ? auth.getAccessToken() : null;
  const outgoing = token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !isLogin && token) {
        // Only invalidate if this response belongs to the current session.
        if (auth.getAccessToken() === token) {
          auth.clearSession();
          void router.navigateByUrl('/login');
        }
      }
      return throwError(() => error);
    })
  );
};
