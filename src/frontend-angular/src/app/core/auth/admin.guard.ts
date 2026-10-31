import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.ensureSession().pipe(
    switchMap(ok => ok ? auth.loadIdentity().pipe(
      map(identity => identity.roles.includes('Admin') ? true : router.createUrlTree(['/audit']))
    ) : of(router.createUrlTree(['/login']))),
    catchError(() => of(router.createUrlTree(['/audit'])))
  );
};
