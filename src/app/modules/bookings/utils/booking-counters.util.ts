import { PaginationMeta } from "@shared/model/api_response.model";
import { PaymentReviewCounters } from "../../payment-reviews/model/payment-review.model";
import { BookingCounters } from "../model/booking.model";

/** A missing, non-numeric or non-finite counter counts as 0 (never `NaN` / `undefined` on a badge). */
function count(data: Record<string, unknown> | null | undefined, key: string): number {
  const value = data?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** `meta.additionalData` of GET /bookings → the "Today" and "Waiting" badges. */
export function readBookingCounters(meta: PaginationMeta | null | undefined): BookingCounters {
  const data = meta?.additionalData;
  return {
    todayCount: count(data, "todayCount"),
    refundWaitingCount: count(data, "refundWaitingCount"),
  };
}

/** `meta.additionalData` of GET /bookings/payment-reviews → tab badges and the review target. */
export function readPaymentReviewCounters(
  meta: PaginationMeta | null | undefined,
): PaymentReviewCounters {
  const data = meta?.additionalData;
  return {
    toReviewCount: count(data, "toReviewCount"),
    approvedTodayCount: count(data, "approvedTodayCount"),
    rejectedTodayCount: count(data, "rejectedTodayCount"),
    reviewTargetMinutes: count(data, "reviewTargetMinutes"),
  };
}
