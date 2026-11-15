import { InjectionToken } from "@angular/core";
import { Observable } from "rxjs";

import { ApiResponse } from "@shared/model/api_response.model";
import { BookingDetails, BookingListItem, BookingsQuery } from "../model/booking.model";

export const BOOKING_REPOSITORY = new InjectionToken<IBookingRepository>("BOOKING_REPOSITORY");

/** Contract shared by the HTTP and mock repositories (pure data access). */
export interface IBookingRepository {
  /**
   * GET /bookings — a page of bookings. `meta.additionalData` carries the "Today" and "Waiting"
   * counters of the selected branch (see `readBookingCounters`).
   */
  getBookings(query: BookingsQuery): Observable<ApiResponse<BookingListItem[]>>;

  /** GET /bookings/{id} — 404 when the booking doesn't exist. */
  getBookingById(id: number): Observable<ApiResponse<BookingDetails>>;

  /**
   * PATCH /bookings/{id}/complete (no body) — Confirmed → Completed ("End session"). 409 before the
   * start time ("This booking hasn't started yet") or when it isn't Confirmed; 404 if missing.
   */
  completeBooking(id: number): Observable<ApiResponse<null>>;
}
