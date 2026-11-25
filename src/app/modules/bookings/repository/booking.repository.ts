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

  /**
   * PATCH /bookings/{id}/cancel `{ reason }` — the BRANCH cancels a PendingReview / Confirmed booking
   * until it ends (an in-progress one too). The reason is required (max 500) and the customer sees
   * it. The booking becomes Cancelled with a full refund owed. 400 `Reason`; 404; 409 (status, or
   * "already ended").
   */
  cancelBooking(id: number, reason: string): Observable<ApiResponse<null>>;

  /**
   * PATCH /bookings/{id}/refund (no body) — the branch returned the money to the customer manually
   * (outside the app) and a staff member confirms it here. Only for Cancelled / Expired (full price)
   * and NoShow (price minus the fee) bookings. The booking's status doesn't change: `refund.status`
   * becomes Sent. 404; 409 (no refund for this status, or "already marked as paid").
   */
  markRefunded(id: number): Observable<ApiResponse<null>>;

  /**
   * PATCH /bookings/{id}/no-show (no body) — Confirmed → NoShow, only after the start time. A refund
   * of the price minus the no-show fee becomes owed. 404; 409 (status, or "hasn't started yet").
   */
  markNoShow(id: number): Observable<ApiResponse<null>>;

  /**
   * PUT /bookings/{id}/barber `{ barberId }` — moves a PendingReview / Confirmed booking that
   * hasn't ended to another barber at the same time (chair, time and price stay). 400 `BarberId`
   * (unknown barber / another branch); 404; 409 (status, ended, or the barber isn't available).
   * Sending the current barber answers 200 without changes.
   */
  reassignBarber(id: number, barberId: number): Observable<ApiResponse<null>>;
}
