/**
 * payment-review.model.ts — data contracts for the Payment reviews queue.
 * Mirrors API Contract — Admin Bookings (GET /bookings/payment-reviews,
 * PATCH /bookings/{id}/approve, PATCH /bookings/{id}/reject).
 *
 * Status, type and payment method are the booking enums (`modules/bookings`). `startAt` is
 * salon-local (Cairo) time without an offset.
 */
import {
  BookingCustomerSummary,
  BookingItemName,
  BookingStatus,
  BookingType,
  PaymentMethod,
} from "../../bookings/model/booking.model";

/** `tab` of GET /bookings/payment-reviews. 0 is the default. */
export enum PaymentReviewTab {
  /** PendingReview bookings, by start time ascending (they expire at their start time). */
  ToReview = 0,
  /** Reviewed today (salon-local day), latest review first. */
  ApprovedToday = 1,
  RejectedToday = 2,
}

export interface PaymentReviewPayment {
  method: PaymentMethod;
  /** The amount DUE. What the customer actually sent has to be read from the screenshot. */
  totalPrice: number;
  /** The transfer screenshot as a public image URL — usable directly in `<img src>`. */
  proofUrl: string;
}

/** GET /bookings/payment-reviews → data[] (note: no `bookingNumber` in this list). */
export interface PaymentReviewItem {
  /** Used for Approve / Reject. */
  id: number;
  status: BookingStatus;
  type: BookingType;
  /** Salon-local, no offset. */
  startAt: string;
  customer: BookingCustomerSummary;
  items: BookingItemName[];
  payment: PaymentReviewPayment;
  /** "Waiting 12 min" — set on the ToReview tab only (null on the reviewed tabs). */
  waitingMinutes: number | null;
  /** waitingMinutes >= reviewTargetMinutes — ToReview only (false on the reviewed tabs). */
  isLate: boolean;
}

/** `meta.additionalData`: the tab badges of the SELECTED BRANCH, and the review-time target. */
export interface PaymentReviewCounters {
  toReviewCount: number;
  approvedTodayCount: number;
  rejectedTodayCount: number;
  /** "Review time 30 min". 0 when the server didn't send it (hide the label). */
  reviewTargetMinutes: number;
}

/** GET /bookings/payment-reviews query (defaults: tab ToReview, page 1, size 20, max 100). */
export interface PaymentReviewsQuery {
  pageNumber: number;
  pageSize: number;
  tab?: PaymentReviewTab;
  branchId?: number;
}

/** Longest rejection reason the API accepts. */
export const REJECT_REASON_MAX_LENGTH = 500;

/** PATCH /bookings/{id}/reject body. The reason is required and is shown to the customer. */
export interface RejectBookingRequest {
  reason: string;
}
