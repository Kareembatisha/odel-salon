import { Observable } from "rxjs";

import { ApiResponse } from "@shared/model/api_response.model";
import {
  BranchDetails,
  BranchListItem,
  DeleteBranchesRequest,
  BranchPayload,
  BranchesQuery,
} from "../model/branch.model";
import { InjectionToken } from "@angular/core";

export const BRANCH_REPOSITORY = new InjectionToken<IBranchRepository>("BRANCH_REPOSITORY");

/** Contract shared by the HTTP and mock repositories (pure data access). */
export interface IBranchRepository {
  /** GET /branches */
  getBranches(query: BranchesQuery): Observable<ApiResponse<BranchListItem[]>>;

  /** GET /branches/{id} */
  getBranchById(id: number): Observable<ApiResponse<BranchDetails>>;

  /** POST /branches */
  createBranch(payload: BranchPayload): Observable<ApiResponse<number>>;

  /** PUT /branches/{id} */
  updateBranch(id: number, payload: BranchPayload): Observable<ApiResponse<null>>;

  /** PATCH /branches/{id}/toggle-status — flips `isVisible` (no body). */
  toggleBranchStatus(id: number): Observable<ApiResponse<null>>;

  /** DELETE /branches — bulk, all-or-nothing, body `{ ids }`. */
  deleteBranches(payload: DeleteBranchesRequest): Observable<ApiResponse<null>>;
}
