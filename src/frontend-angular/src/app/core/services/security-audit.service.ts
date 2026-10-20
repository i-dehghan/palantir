import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SecurityAuditEvent {
  id: number;
  occurredAtUtc: string;
  eventType: string;
  actorUserId: string | null;
  target: string | null;
  outcome: string;
  correlationId: string;
  previousHash: string;
  entryHash: string;
}
export interface SecurityAuditVerification {
  valid: boolean;
  checkedEvents: number;
  firstInvalidEventId: number | null;
}

@Injectable({ providedIn: 'root' })
export class SecurityAuditService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:5191/api/security-audit';

  getEvents(take = 50, eventType = ''): Observable<SecurityAuditEvent[]> {
    let params = new HttpParams().set('take', String(take));
    if (eventType.trim()) params = params.set('eventType', eventType.trim());
    return this.http.get<SecurityAuditEvent[]>(`${this.apiUrl}/events`, { params });
  }
  verify(): Observable<SecurityAuditVerification> {
    return this.http.get<SecurityAuditVerification>(`${this.apiUrl}/verify`);
  }
}
