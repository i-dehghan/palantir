import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guards';
import { adminGuard } from './core/auth/admin.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'audit',
    canActivate: [authGuard],
    loadComponent: () => import('./features/audit/audit-dashboard.component').then(m => m.AuditDashboardComponent)
  },
  {
    path: 'security-audit',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/security-audit/security-audit.component').then(m => m.SecurityAuditComponent)
  },
  {
    path: 'identity-management',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/identity-management/identity-management.component').then(m => m.IdentityManagementComponent)
  },
  {
    path: 'change-password',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/change-password.component').then(m => m.ChangePasswordComponent)
  },
  { path: '', pathMatch: 'full', redirectTo: 'audit' },
  { path: '**', redirectTo: 'audit' }
];
