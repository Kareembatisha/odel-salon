import { HttpClient, HttpParams } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { environment } from "@env/environment";
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
import { buildCreateBarberFormData, buildUpdateBarberFormData } from "../utils/barber-form-data";
import { buildBarbersParams } from "../utils/barber-query";
import { IBarberRepository } from "./barber.repository";

/**
 * HTTP implementation of {@link IBarberRepository}.
 *
 * Thin pass-through over the `/barbers` endpoints — no mapping or side effects.
 * Query translation and the multipart bodies live in `utils/` so they can be
 * unit-tested without `HttpClient`. Errors (400 / 403 / 404 / 409) are surfaced
 * by the error interceptor; this class does not catch them.
 *
 * Create and edit send `multipart/form-data` (because of the photo). The
 * Content-Type header is deliberately NOT set: the browser adds it together
 * with the multipart boundary.
 */
@Injectable({ providedIn: "root" })
export class BarberApiRepository implements IBarberRepository {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/barbers`;

  getBarbers(query: BarbersQuery): Observable<ApiResponse<BarberListItem[]>> {
    return this.http.get<ApiResponse<BarberListItem[]>>(this.url, {
      params: buildBarbersParams(query),
    });
  }

  /** Single barber (adds `createdAt` / `updatedAt`); a missing barber answers `404`. */
  getBarberById(id: number): Observable<ApiResponse<BarberDetails>> {
    return this.http.get<ApiResponse<BarberDetails>>(`${this.url}/${id}`);
  }

  /** Create a barber (always active) and return its new id. */
  createBarber(payload: CreateBarberPayload): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(this.url, buildCreateBarberFormData(payload));
  }

  /** Edit / replace or remove the photo / transfer to another branch (may answer `409`). */
  updateBarber(id: number, payload: UpdateBarberPayload): Observable<ApiResponse<null>> {
    return this.http.put<ApiResponse<null>>(
      `${this.url}/${id}`,
      buildUpdateBarberFormData(payload),
    );
  }

  /** Flip `isActive` (no body). Suspending the last active barber of a visible branch answers `409`. */
  toggleBarberStatus(id: number): Observable<ApiResponse<null>> {
    return this.http.patch<ApiResponse<null>>(`${this.url}/${id}/toggle-status`, null);
  }

  /**
   * Permanently delete one or more barbers (all-or-nothing). `HttpClient.delete`
   * has no body argument, so the JSON goes through `options.body`.
   */
  deleteBarbers(payload: DeleteBarbersRequest): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(this.url, { body: payload });
  }

  /** Today's sheet for one branch (`branchId` is required; unknown branch answers `404`). */
  getAttendance(branchId: number): Observable<ApiResponse<BarberAttendanceRow[]>> {
    return this.http.get<ApiResponse<BarberAttendanceRow[]>>(`${this.url}/attendance`, {
      params: new HttpParams().set("branchId", branchId),
    });
  }

  /** Mark the listed barbers present / absent today (JSON body, all-or-nothing). */
  setAttendance(payload: SetBarberAttendanceRequest): Observable<ApiResponse<null>> {
    return this.http.put<ApiResponse<null>>(`${this.url}/attendance`, payload);
  }
}
