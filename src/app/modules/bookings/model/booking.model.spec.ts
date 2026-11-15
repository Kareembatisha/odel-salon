import { describe, expect, it } from "vitest";

import { PaymentReviewTab } from "../../payment-reviews/model/payment-review.model";
import {
  BookingStatus,
  BookingTab,
  BookingType,
  PaymentMethod,
  RefundStatus,
} from "./booking.model";

// The numbers are the API's: if one drifts, every request / badge silently means something else.
describe("booking enums match the API contract", () => {
  it("tab: 0 All, 1 Today, 2 Upcoming, 3 Past", () => {
    expect([BookingTab.All, BookingTab.Today, BookingTab.Upcoming, BookingTab.Past]).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("status: 0 PendingReview … 6 Cancelled", () => {
    expect([
      BookingStatus.PendingReview,
      BookingStatus.Confirmed,
      BookingStatus.Rejected,
      BookingStatus.Expired,
      BookingStatus.Completed,
      BookingStatus.NoShow,
      BookingStatus.Cancelled,
    ]).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("type: 0 Regular, 1 VIP, 2 Home", () => {
    expect([BookingType.Regular, BookingType.Vip, BookingType.Home]).toEqual([0, 1, 2]);
  });

  it("payment method: 0 InstaPay, 1 Mobile wallet", () => {
    expect([PaymentMethod.InstaPay, PaymentMethod.MobileWallet]).toEqual([0, 1]);
  });

  it("refund status: 0 Waiting, 1 Sent", () => {
    expect([RefundStatus.Waiting, RefundStatus.Sent]).toEqual([0, 1]);
  });

  it("payment review tab: 0 ToReview, 1 ApprovedToday, 2 RejectedToday", () => {
    expect([
      PaymentReviewTab.ToReview,
      PaymentReviewTab.ApprovedToday,
      PaymentReviewTab.RejectedToday,
    ]).toEqual([0, 1, 2]);
  });
});
