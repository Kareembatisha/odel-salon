import { InjectionToken } from "@angular/core";
import { Observable } from "rxjs";

import { ApiResponse } from "@shared/model/api_response.model";
import {
  BarberDetails,
  BarberListItem,
  BarbersQuery,
  CreateBarberPayload,
  DeleteBarbersRequest,
  UpdateBarberPayload,
} from "../model/barber.model";

export const BARBER_REPOSITORY = new InjectionToken<IBarberRepository>("BARBER_REPOSITORY");

/** Contract shared by the HTTP and mock repositories (pure data access). */
export interface IBarberRepository {
  /** GET /barbers — sorted by full name. */
  getBarbers(query: BarbersQuery): Observable<ApiResponse<BarberListItem[]>>;

  /** GET /barbers/{id} */
  getBarberById(id: number): Observable<ApiResponse<BarberDetails>>;

  /** POST /barbers (multipart) → data = the new barber id. */
  createBarber(payload: CreateBarberPayload): Observable<ApiResponse<number>>;

  /** PUT /barbers/{id} (multipart) — edit, replace / remove the photo, transfer branch. */
  updateBarber(id: number, payload: UpdateBarberPayload): Observable<ApiResponse<null>>;

  /** PATCH /barbers/{id}/toggle-status — flips `isActive` (no body). */
  toggleBarberStatus(id: number): Observable<ApiResponse<null>>;

  /** DELETE /barbers — bulk, all-or-nothing, body `{ ids }`. */
  deleteBarbers(payload: DeleteBarbersRequest): Observable<ApiResponse<null>>;
}
