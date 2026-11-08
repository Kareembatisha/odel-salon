import { InjectionToken } from "@angular/core";
import { Observable } from "rxjs";

import { ApiResponse } from "@shared/model/api_response.model";
import {
  ChairDetails,
  ChairListItem,
  ChairsQuery,
  CreateChairPayload,
  DeleteChairsRequest,
  UpdateChairPayload,
} from "../model/chair.model";

export const CHAIR_REPOSITORY = new InjectionToken<IChairRepository>("CHAIR_REPOSITORY");

/** Contract shared by the HTTP and mock repositories (pure data access). */
export interface IChairRepository {
  /**
   * GET /chairs — `meta.additionalData` carries the summary cards
   * (regularActive / vipActive / inactive).
   */
  getChairs(query: ChairsQuery): Observable<ApiResponse<ChairListItem[]>>;

  /** GET /chairs/{id} */
  getChairById(id: number): Observable<ApiResponse<ChairDetails>>;

  /** POST /chairs → data = the new chair id. */
  createChair(payload: CreateChairPayload): Observable<ApiResponse<number>>;

  /** PUT /chairs/{id} — rename / change type. The branch can't change. */
  updateChair(id: number, payload: UpdateChairPayload): Observable<ApiResponse<null>>;

  /** PATCH /chairs/{id}/toggle-status — flips `isActive` (no body). */
  toggleChairStatus(id: number): Observable<ApiResponse<null>>;

  /** DELETE /chairs — bulk, all-or-nothing, body `{ ids }`. */
  deleteChairs(payload: DeleteChairsRequest): Observable<ApiResponse<null>>;
}
