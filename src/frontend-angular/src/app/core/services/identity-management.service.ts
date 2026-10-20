import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface IdentityRoleRef { id: string; name: string; }
export interface IdentityUser { id: string; userName: string; isActive: boolean; createdAtUtc: string; rolesVersion: number; roles: IdentityRoleRef[]; }
export interface IdentityRole { id: string; name: string; permissionsVersion: number; permissions: string[]; }
export interface IdentityPermission { id: string; code: string; description: string | null; }

@Injectable({ providedIn: 'root' })
export class IdentityManagementService {
  private readonly http = inject(HttpClient);
  private readonly base = 'http://localhost:5191/api/identity-management';

  getUsers(): Observable<IdentityUser[]> { return this.http.get<IdentityUser[]>(`${this.base}/users`); }
  getRoles(): Observable<IdentityRole[]> { return this.http.get<IdentityRole[]>(`${this.base}/roles`); }
  getPermissions(): Observable<IdentityPermission[]> { return this.http.get<IdentityPermission[]>(`${this.base}/permissions`); }
  createUser(userName: string, password: string, roleIds: string[]): Observable<IdentityUser> {
    return this.http.post<IdentityUser>(`${this.base}/users`, { userName, password, roleIds });
  }
  setActive(userId: string, isActive: boolean, expectedVersion: number): Observable<void> {
    return this.http.put<void>(`${this.base}/users/${encodeURIComponent(userId)}/active`, { isActive, expectedVersion });
  }
  setUserRoles(userId: string, roleIds: string[], expectedVersion: number): Observable<void> {
    return this.http.put<void>(`${this.base}/users/${encodeURIComponent(userId)}/roles`, { roleIds, expectedVersion });
  }
  createRole(name: string): Observable<IdentityRole> {
    return this.http.post<IdentityRole>(`${this.base}/roles`, { name });
  }
  setRolePermissions(roleId: string, permissionCodes: string[], expectedVersion: number): Observable<void> {
    return this.http.put<void>(`${this.base}/roles/${encodeURIComponent(roleId)}/permissions`, { permissionCodes, expectedVersion });
  }
}
