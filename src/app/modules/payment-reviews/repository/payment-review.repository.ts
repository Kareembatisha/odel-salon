import { InjectionToken } from "@angular/core";
import { Observable } from "rxjs";

import { ApiResponse } from "@shared/model/api_response.model";
import {
  PaymentReviewItem,
  PaymentReviewsQuery,
  RejectBookingRequest,
} from "../model/payment-review.model";

export const PAYMENT_REVIEW_REPOSITORY = new InjectionToken<IPaymentReviewRepository>(
  "PAYMENT_REVIEW_REPOSITORY",
);

/** Contract shared by the HTTP and mock repositories (pure data access). */
export interface IPaymentReviewRepository {
  /**
   * GET /bookings/payment-reviews — a page of one tab. `meta.additionalData` carries the tab
   * badges and the review-time target of the selected branch (see `readPaymentReviewCounters`).
   */
  getPaymentReviews(query: PaymentReviewsQuery): Observable<ApiResponse<PaymentReviewItem[]>>;

  /**
   * PATCH /bookings/{id}/approve (no body) — PendingReview → Confirmed. 409 when the booking isn't
   * PendingReview or its start time has passed; 404 if missing. Needs `Booking.Review`.
   */
  approveBooking(id: number): Observable<ApiResponse<null>>;

  /**
   * PATCH /bookings/{id}/reject — PendingReview → Rejected and the barber / chair time is freed.
   * `reason` is required (max 500) and shown to the customer: 400 with field errors when missing or
   * too long; 409 when not PendingReview; 404 if missing. Needs `Booking.Review`.
   */
  rejectBooking(id: number, payload: RejectBookingRequest): Observable<ApiResponse<null>>;
}
