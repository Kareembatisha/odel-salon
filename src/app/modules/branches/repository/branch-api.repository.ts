import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { environment } from "@env/environment";
import { ApiResponse } from "@shared/model/api_response.model";
import {
  BranchDetails,
  BranchListItem,
  BranchPayload,
  BranchesQuery,
} from "../model/branch.model";
import { buildBranchesParams } from "../utils/branch-query";
import { IBranchRepository } from "./branch.repository";

// ============================================================
// API Repository
// ============================================================

/**
 * HTTP implementation of {@link IBranchRepository}.
 *
 * Thin pass-through over the `/branches` endpoints — no mapping or
 * side effects live here. Query-object → `HttpParams` translation is
 * delegated to {@link buildBranchesParams} so it can be unit-tested
 * independently of `HttpClient`.
 *
 * For local development against seed data, see the mock counterpart
 * (`BranchMockRepository`), which fulfils the same interface.
 */
@Injectable({ providedIn: "root" })
export class BranchApiRepository implements IBranchRepository {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/branches`;

  // ----------------------------------------------------------
  // Read Operations
  // ----------------------------------------------------------

  /**
   * Fetch a paginated, filterable list of branches.
   *
   * `query.search`, `query.isVisible`, `query.pageNumber` and
   * `query.pageSize` are serialised by {@link buildBranchesParams};
   * the response carries pagination metadata alongside `data`.
   */
  getBranches(query: BranchesQuery): Observable<ApiResponse<BranchListItem[]>> {
    return this.http.get<ApiResponse<BranchListItem[]>>(this.url, {
      params: buildBranchesParams(query),
    });
  }

  /**
   * Fetch a single branch by id, including its working hours.
   *
   * The API reports a missing branch as a `404` response; whether the
   * caller sees an `HttpErrorResponse` or a `status: false` body
   * depends on the error interceptor — this method does not catch it.
   */
  getBranchById(id: number): Observable<ApiResponse<BranchDetails>> {
    return this.http.get<ApiResponse<BranchDetails>>(`${this.url}/${id}`);
  }

  // ----------------------------------------------------------
  // Write Operations
  // ----------------------------------------------------------

  /**
   * Create a branch and return its newly allocated id.
   *
   * Visibility and staff/chair counters are managed by their own
   * endpoints, so they are not part of {@link BranchPayload}.
   */
  createBranch(payload: BranchPayload): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(this.url, payload);
  }

  /**
   * Replace an existing branch's editable fields.
   *
   * Uses `PUT` (full replace of `BranchPayload` fields), matching the
   * mock repository's `Object.assign` semantics. `isVisible` is
   * intentionally excluded — it is toggled through its own endpoint.
   */
  updateBranch(
    id: number,
    payload: BranchPayload,
  ): Observable<ApiResponse<null>> {
    return this.http.put<ApiResponse<null>>(`${this.url}/${id}`, payload);
  }
}
