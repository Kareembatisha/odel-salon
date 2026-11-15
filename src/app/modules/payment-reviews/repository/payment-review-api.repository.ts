import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { environment } from "@env/environment";
import { ApiResponse } from "@shared/model/api_response.model";
import {
  PaymentReviewItem,
  PaymentReviewsQuery,
  RejectBookingRequest,
} from "../model/payment-review.model";
import { buildPaymentReviewsParams } from "../utils/payment-review-query";
import { IPaymentReviewRepository } from "./payment-review.repository";

/**
 * HTTP implementation of {@link IPaymentReviewRepository}.
 *
 * The queue lives under `/bookings` (`/bookings/payment-reviews`, `/bookings/{id}/approve|reject`).
 * Thin pass-through — no mapping or side effects. Errors (400 / 403 / 404 / 409) are surfaced by
 * the error interceptor; this class does not catch them.
 */
@Injectable({ providedIn: "root" })
export class PaymentReviewApiRepository implements IPaymentReviewRepository {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/bookings`;

  getPaymentReviews(query: PaymentReviewsQuery): Observable<ApiResponse<PaymentReviewItem[]>> {
    return this.http.get<ApiResponse<PaymentReviewItem[]>>(`${this.url}/payment-reviews`, {
      params: buildPaymentReviewsParams(query),
    });
  }

  approveBooking(id: number): Observable<ApiResponse<null>> {
    return this.http.patch<ApiResponse<null>>(`${this.url}/${id}/approve`, null);
  }

  rejectBooking(id: number, payload: RejectBookingRequest): Observable<ApiResponse<null>> {
    return this.http.patch<ApiResponse<null>>(`${this.url}/${id}/reject`, payload);
  }
}
