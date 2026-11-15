import { Injectable, inject } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import { Observable } from "rxjs";

import {
  REVIEW_TARGET_MINUTES,
  bookingTotal,
  cairoDayOf,
  paymentProofUrl,
  waitingMinutesOf,
} from "@core/mock/mock-bookings";
import { MockBooking, MockDb } from "@core/mock/mock-db";
import { mockFail, mockInvalid, mockReply, mockReplyWithMeta } from "@core/mock/mock-responses";
import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import { BookingStatus } from "../../bookings/model/booking.model";
import { cairoToday } from "../../offers/utils/offer-dates.util";
import {
  PaymentReviewItem,
  PaymentReviewTab,
  PaymentReviewsQuery,
  REJECT_REASON_MAX_LENGTH,
  RejectBookingRequest,
} from "../model/payment-review.model";
import { IPaymentReviewRepository } from "./payment-review.repository";

/** Largest page the API serves. */
const MAX_PAGE_SIZE = 100;

/**
 * In-memory implementation of {@link IPaymentReviewRepository}.
 *
 * Works on the same bookings as {@link BookingMockRepository}: approving / rejecting changes the
 * booking everywhere (the Bookings list, the details page and the barbers' upcoming counts).
 * Enforces the contract's rules: tabs and ordering, the branch's tab badges, "waiting" minutes and
 * `isLate` for the ToReview tab only, 404 for a missing booking, 409 when the booking isn't
 * PendingReview (or its start time has passed — it expires then), and 400 for a missing / too long
 * rejection reason. The time-driven changes are applied before every call.
 */
@Injectable({ providedIn: "root" })
export class PaymentReviewMockRepository implements IPaymentReviewRepository {
  private readonly db = inject(MockDb);
  private readonly notify = inject(NotificationService);
  private readonly translate = inject(TranslateService);

  // ----------------------------------------------------------
  // Read Operations
  // ----------------------------------------------------------

  getPaymentReviews(q: PaymentReviewsQuery): Observable<ApiResponse<PaymentReviewItem[]>> {
    const now = new Date();
    this.db.settleBookings(now);

    const today = cairoToday(now);
    const tab = q.tab ?? PaymentReviewTab.ToReview;
    const ofBranch = this.db.bookings.filter(
      (b) => q.branchId === undefined || b.branchId === q.branchId,
    );

    const inTab = (b: MockBooking, t: PaymentReviewTab): boolean => {
      switch (t) {
        case PaymentReviewTab.ApprovedToday:
          return b.approvedAt !== null && cairoDayOf(b.approvedAt) === today;
        case PaymentReviewTab.RejectedToday:
          return b.rejectedAt !== null && cairoDayOf(b.rejectedAt) === today;
        default:
          return b.status === BookingStatus.PendingReview;
      }
    };

    const matches = ofBranch.filter((b) => inTab(b, tab));
    // ToReview: the ones that expire first come first. Reviewed tabs: latest review first.
    matches.sort((a, b) => {
      if (tab === PaymentReviewTab.ToReview)
        return a.startAt.localeCompare(b.startAt) || a.id - b.id;
      const at = (x: MockBooking): string =>
        (tab === PaymentReviewTab.ApprovedToday ? x.approvedAt : x.rejectedAt) ?? "";
      return at(b).localeCompare(at(a)) || b.id - a.id;
    });

    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, q.pageSize));
    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    const pageNumber = Math.max(1, q.pageNumber);
    const start = (pageNumber - 1) * pageSize;

    return mockReplyWithMeta(
      matches.slice(start, start + pageSize).map((b) => this.toItem(b, tab, now)),
      {
        currentPage: pageNumber,
        pageSize,
        totalPages,
        totalCount: matches.length,
        hasPreviousPage: pageNumber > 1,
        hasNextPage: pageNumber < totalPages,
        additionalData: {
          toReviewCount: ofBranch.filter((b) => inTab(b, PaymentReviewTab.ToReview)).length,
          approvedTodayCount: ofBranch.filter((b) => inTab(b, PaymentReviewTab.ApprovedToday))
            .length,
          rejectedTodayCount: ofBranch.filter((b) => inTab(b, PaymentReviewTab.RejectedToday))
            .length,
          reviewTargetMinutes: REVIEW_TARGET_MINUTES,
        },
      },
    );
  }

  // ----------------------------------------------------------
  // Write Operations
  // ----------------------------------------------------------

  /** PendingReview → Confirmed, only before the start time. */
  approveBooking(id: number): Observable<ApiResponse<null>> {
    const now = new Date();
    this.db.settleBookings(now);

    const booking = this.db.bookings.find((b) => b.id === id);
    if (!booking) return this.fail("BOOKINGS.ERRORS.NOT_FOUND", 404);
    if (booking.status !== BookingStatus.PendingReview) {
      return this.fail("BOOKINGS.ERRORS.NOT_ALLOWED", 409);
    }

    booking.status = BookingStatus.Confirmed;
    booking.approvedAt = now.toISOString();
    return mockReply(null, "Booking Updated Successfully");
  }

  /**
   * PendingReview → Rejected, which frees the barber / chair time (they stop counting as upcoming).
   * The reason is required (max 500) and is kept to show the customer.
   */
  rejectBooking(id: number, payload: RejectBookingRequest): Observable<ApiResponse<null>> {
    const now = new Date();
    this.db.settleBookings(now);

    const reason = (payload.reason ?? "").trim();
    if (!reason)
      return mockInvalid(this.notify, "Reason", "PAYMENT_REVIEWS.ERRORS.REASON_REQUIRED");
    if (reason.length > REJECT_REASON_MAX_LENGTH) {
      return mockInvalid(this.notify, "Reason", "PAYMENT_REVIEWS.ERRORS.REASON_TOO_LONG");
    }

    const booking = this.db.bookings.find((b) => b.id === id);
    if (!booking) return this.fail("BOOKINGS.ERRORS.NOT_FOUND", 404);
    if (booking.status !== BookingStatus.PendingReview) {
      return this.fail("BOOKINGS.ERRORS.NOT_ALLOWED", 409);
    }

    booking.status = BookingStatus.Rejected;
    booking.rejectedAt = now.toISOString();
    booking.rejectionReason = reason;
    return mockReply(null, "Booking Updated Successfully");
  }

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------

  private fail(key: string, status: number): Observable<never> {
    return mockFail(this.notify, this.translate.instant(key), status);
  }

  private toItem(b: MockBooking, tab: PaymentReviewTab, now: Date): PaymentReviewItem {
    const customer = this.db.customers.find((c) => c.id === b.customerId);
    const branch = this.db.branches.find((x) => x.id === b.branchId);
    const toReview = tab === PaymentReviewTab.ToReview;
    const waiting = toReview ? waitingMinutesOf(b, now) : null;

    return {
      id: b.id,
      status: b.status,
      type: b.type,
      startAt: b.startAt,
      customer: {
        fullName: customer?.fullName ?? "",
        phoneNumber: customer?.phoneNumber ?? "",
      },
      items: b.items.map((i) => ({ nameAr: i.nameAr, nameEn: i.nameEn })),
      payment: {
        method: b.paymentMethod,
        totalPrice: bookingTotal(b),
        proofUrl: paymentProofUrl(b, branch),
      },
      waitingMinutes: waiting,
      isLate: waiting !== null && waiting >= REVIEW_TARGET_MINUTES,
    };
  }
}
