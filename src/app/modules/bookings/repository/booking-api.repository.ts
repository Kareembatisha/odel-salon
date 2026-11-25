import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { environment } from "@env/environment";
import { ApiResponse } from "@shared/model/api_response.model";
import { BookingDetails, BookingListItem, BookingsQuery } from "../model/booking.model";
import { buildBookingsParams } from "../utils/booking-query";
import { IBookingRepository } from "./booking.repository";

/**
 * HTTP implementation of {@link IBookingRepository}.
 *
 * Thin pass-through over the `/bookings` endpoints — no mapping or side effects. Query translation
 * lives in `utils/booking-query.ts`. Errors (403 / 404 / 409) are surfaced by the error
 * interceptor; this class does not catch them.
 */
@Injectable({ providedIn: "root" })
export class BookingApiRepository implements IBookingRepository {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/bookings`;

  getBookings(query: BookingsQuery): Observable<ApiResponse<BookingListItem[]>> {
    return this.http.get<ApiResponse<BookingListItem[]>>(this.url, {
      params: buildBookingsParams(query),
    });
  }

  getBookingById(id: number): Observable<ApiResponse<BookingDetails>> {
    return this.http.get<ApiResponse<BookingDetails>>(`${this.url}/${id}`);
  }

  completeBooking(id: number): Observable<ApiResponse<null>> {
    return this.http.patch<ApiResponse<null>>(`${this.url}/${id}/complete`, null);
  }

  cancelBooking(id: number, reason: string): Observable<ApiResponse<null>> {
    return this.http.patch<ApiResponse<null>>(`${this.url}/${id}/cancel`, { reason });
  }

  markRefunded(id: number): Observable<ApiResponse<null>> {
    return this.http.patch<ApiResponse<null>>(`${this.url}/${id}/refund`, null);
  }

  markNoShow(id: number): Observable<ApiResponse<null>> {
    return this.http.patch<ApiResponse<null>>(`${this.url}/${id}/no-show`, null);
  }

  reassignBarber(id: number, barberId: number): Observable<ApiResponse<null>> {
    return this.http.put<ApiResponse<null>>(`${this.url}/${id}/barber`, { barberId });
  }
}
