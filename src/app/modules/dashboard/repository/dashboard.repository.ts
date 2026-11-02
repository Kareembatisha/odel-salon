import { Observable } from 'rxjs';

import { ApiResponse } from '@shared/model/api_response.model';
import { DashboardSummary } from '../model/dashboard.model';

/** Contract shared by the HTTP and mock repositories (pure data access). */
export interface IDashboardRepository {
  /** GET /dashboard/summary?branchId= */
  getSummary(branchId?: number): Observable<ApiResponse<DashboardSummary>>;
}
