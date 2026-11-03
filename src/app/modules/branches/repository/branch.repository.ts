import { Observable } from "rxjs";

import { ApiResponse } from "@shared/model/api_response.model";
import { BranchListItem, BranchesQuery } from "../model/branch.model";
import { InjectionToken } from "@angular/core";

/** Contract shared by the HTTP and mock repositories (pure data access). */
export interface IBranchRepository {
  /** GET /branches */
  getBranches(query: BranchesQuery): Observable<ApiResponse<BranchListItem[]>>;
}

export const BRANCH_REPOSITORY = new InjectionToken<IBranchRepository>(
  "BRANCH_REPOSITORY",
);
