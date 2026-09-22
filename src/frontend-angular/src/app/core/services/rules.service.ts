import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ReconciliationRule, CreateRuleDto } from '../models/rule.model';

@Injectable({
  providedIn: 'root'
})
export class RulesService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:5191/api/Rules';

  getRules(): Observable<ReconciliationRule[]> {
    return this.http.get<ReconciliationRule[]>(this.apiUrl);
  }

  createRule(dto: CreateRuleDto): Observable<ReconciliationRule> {
    return this.http.post<ReconciliationRule>(this.apiUrl, dto);
  }

  toggleRuleStatus(ruleId: number): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/${ruleId}/toggle-status`, {});
  }

  deleteRule(ruleId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${ruleId}`);
  }
}