import { InjectionToken } from "@angular/core";
import { Observable } from "rxjs";

import { ApiResponse } from "@shared/model/api_response.model";
import { DashboardSummary } from "../model/dashboard.model";

/** Contract shared by the HTTP and mock repositories (pure data access). */
export interface IDashboardRepository {
  /** GET /dashboard/summary?branchId= */
  getSummary(branchId?: number): Observable<ApiResponse<DashboardSummary>>;
}

/** DI token: `app.providers*.ts` decides whether the API or the mock implementation backs it. */
export const DASHBOARD_REPOSITORY = new InjectionToken<IDashboardRepository>(
  "DASHBOARD_REPOSITORY",
);
