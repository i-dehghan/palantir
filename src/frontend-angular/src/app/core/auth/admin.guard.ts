import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.getAccessToken()) return router.createUrlTree(['/login']);
  // Revalidate identity on navigation rather than trusting a cached UI role.
  return auth.loadIdentity().pipe(
    map(identity => identity.roles.includes('Admin') ? true : router.createUrlTree(['/audit'])),
    catchError(() => of(router.createUrlTree(['/audit'])))
  );
};
