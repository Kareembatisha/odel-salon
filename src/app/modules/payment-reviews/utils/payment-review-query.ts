import { HttpParams } from "@angular/common/http";

import { PaymentReviewsQuery } from "../model/payment-review.model";

/**
 * Builds GET /bookings/payment-reviews query params (tab, branchId, pageNumber, pageSize).
 * `tab=0` (ToReview) is sent when set — zero is a real value, so checks are `!== undefined`.
 */
export function buildPaymentReviewsParams(q: PaymentReviewsQuery): HttpParams {
  let params = new HttpParams().set("pageNumber", q.pageNumber).set("pageSize", q.pageSize);
  if (q.tab !== undefined) params = params.set("tab", q.tab);
  if (q.branchId !== undefined) params = params.set("branchId", q.branchId);
  return params;
}
