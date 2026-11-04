import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { environment } from "@env/environment";
import { ApiResponse } from "@shared/model/api_response.model";
import {
  ChairDetails,
  ChairListItem,
  ChairsQuery,
  CreateChairPayload,
  DeleteChairsRequest,
  UpdateChairPayload,
} from "../model/chair.model";
import { buildChairsParams } from "../utils/chair-query";
import { IChairRepository } from "./chair.repository";

/**
 * HTTP implementation of {@link IChairRepository}.
 *
 * Thin pass-through over the `/chairs` endpoints — no mapping or side effects.
 * Query translation lives in {@link buildChairsParams} so it can be unit-tested
 * without `HttpClient`. Errors (400 / 403 / 404 / 409) are surfaced by the error
 * interceptor; this class does not catch them.
 */
@Injectable({ providedIn: "root" })
export class ChairApiRepository implements IChairRepository {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/chairs`;

  /** Paginated, filterable list; `meta.additionalData` holds the summary counts. */
  getChairs(query: ChairsQuery): Observable<ApiResponse<ChairListItem[]>> {
    return this.http.get<ApiResponse<ChairListItem[]>>(this.url, {
      params: buildChairsParams(query),
    });
  }

  /** Single chair (adds `createdAt` / `updatedAt`); a missing chair answers `404`. */
  getChairById(id: number): Observable<ApiResponse<ChairDetails>> {
    return this.http.get<ApiResponse<ChairDetails>>(`${this.url}/${id}`);
  }

  /** Create a chair (always active) and return its new id. */
  createChair(payload: CreateChairPayload): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(this.url, payload);
  }

  /** Rename / change type. `branchId` is not part of the body — a chair can't move branches. */
  updateChair(
    id: number,
    payload: UpdateChairPayload,
  ): Observable<ApiResponse<null>> {
    return this.http.put<ApiResponse<null>>(`${this.url}/${id}`, payload);
  }

  /**
   * Flip `isActive` (no body). Deactivating the last active chair of a type a
   * visible branch offers answers `409`.
   */
  toggleChairStatus(id: number): Observable<ApiResponse<null>> {
    return this.http.patch<ApiResponse<null>>(`${this.url}/${id}/toggle-status`, null);
  }

  /**
   * Permanently delete one or more chairs (all-or-nothing). `HttpClient.delete`
   * has no body argument, so the JSON goes through `options.body`.
   */
  deleteChairs(payload: DeleteChairsRequest): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(this.url, { body: payload });
  }
}
