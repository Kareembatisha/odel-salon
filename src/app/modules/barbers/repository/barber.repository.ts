import { InjectionToken } from "@angular/core";
import { Observable } from "rxjs";

import { ApiResponse } from "@shared/model/api_response.model";
import {
  BarberAttendanceRow,
  BarberDetails,
  BarberListItem,
  BarbersQuery,
  CreateBarberPayload,
  DeleteBarbersRequest,
  SetBarberAttendanceRequest,
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

  /** GET /barbers/attendance?branchId — today's sheet (Cairo date) of the branch's active barbers. */
  getAttendance(branchId: number): Observable<ApiResponse<BarberAttendanceRow[]>>;

  /**
   * PUT /barbers/attendance — marks the listed barbers present / absent TODAY (one item = a single
   * toggle, many = the whole sheet). All-or-nothing: 400 duplicate ids, 404 unknown id, 409 when a
   * present barber with upcoming bookings is marked absent.
   */
  setAttendance(payload: SetBarberAttendanceRequest): Observable<ApiResponse<null>>;
}
