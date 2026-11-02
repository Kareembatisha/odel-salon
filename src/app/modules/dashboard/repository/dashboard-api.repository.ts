import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { ApiResponse } from '@shared/model/api_response.model';
import { DashboardSummary } from '../model/dashboard.model';
import { IDashboardRepository } from './dashboard.repository';

@Injectable({ providedIn: 'root' })
export class DashboardApiRepository implements IDashboardRepository {
  private readonly http = inject(HttpClient);

  getSummary(branchId?: number): Observable<ApiResponse<DashboardSummary>> {
    let params = new HttpParams();
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<ApiResponse<DashboardSummary>>(`${environment.apiUrl}/dashboard/summary`, { params });
  }
}
