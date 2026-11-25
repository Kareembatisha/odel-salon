import { TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Observable, firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../assets/i18n/en.json";
import { REVIEW_TARGET_MINUTES, bookingTotal } from "@core/mock/mock-bookings";
import { MockBooking, MockDb } from "@core/mock/mock-db";
import { NotificationService } from "@core/services/notification.service";
import { BookingStatus, BookingType, PaymentMethod } from "../../bookings/model/booking.model";
import { PaymentReviewTab, REJECT_REASON_MAX_LENGTH } from "../model/payment-review.model";
import { PaymentReviewMockRepository } from "./payment-review-mock.repository";

// 12:00 in Cairo (UTC+2 in November).
const NOW = new Date("2026-11-13T10:00:00Z");

describe("PaymentReviewMockRepository", () => {
  let repo: PaymentReviewMockRepository;
  let db: MockDb;
  let warning: ReturnType<typeof vi.spyOn>;

  async function settle<T>(obs: Observable<T>): Promise<T> {
    const result = firstValueFrom(obs);
    result.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1000);
    return result;
  }

  async function failure(obs: Observable<unknown>): Promise<{ status: number; message: string }> {
    try {
      await settle(obs);
    } catch (e) {
      return e as { status: number; message: string };
    }
    throw new Error("expected the call to fail");
  }

  const queue = (tab?: PaymentReviewTab, branchId: number | undefined = 1) =>
    settle(repo.getPaymentReviews({ pageNumber: 1, pageSize: 20, tab, branchId }));

  const stored = (id: number): MockBooking => db.bookings.find((b) => b.id === id)!;
  const NOT_ALLOWED = "This action isn’t allowed for the booking’s current status.";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation("en", en);
    translate.use("en");
    repo = TestBed.inject(PaymentReviewMockRepository);
    db = TestBed.inject(MockDb);
    warning = vi.spyOn(TestBed.inject(NotificationService), "warning");
  });

  afterEach(() => vi.useRealTimers());

  /** Extra copies of the waiting booking (401), so paging and ordering have something to work on. */
  const addWaiting = (count: number) => {
    for (let i = 1; i <= count; i++) {
      db.bookings.push({
        ...stored(401),
        id: 9100 + i,
        bookingNumber: `OD-0091${String(i).padStart(2, "0")}`,
        startAt: `2026-11-13T${String(13 + i).padStart(2, "0")}:00:00`,
      });
    }
  };

  describe("getPaymentReviews — ToReview", () => {
    it("is the default tab: the branch's PendingReview bookings, the ones that expire first on top", async () => {
      addWaiting(3);

      const res = await queue();

      expect(res.data).toHaveLength(4);
      expect(res.data!.every((b) => b.status === BookingStatus.PendingReview)).toBe(true);
      const starts = res.data!.map((b) => b.startAt);
      expect(starts).toEqual([...starts].sort());
      expect(res.data![0].id).toBe(401); // starts at 13:30, before the copies
      expect((await queue(PaymentReviewTab.ToReview)).data).toEqual(res.data);
    });

    it("has ONE waiting booking in the seed", async () => {
      const res = await queue();

      expect(res.data!.map((b) => b.id)).toEqual([401]);
    });

    it("gives the tab badges and the review target of the selected branch", async () => {
      const res = await queue();

      expect(res.meta!.additionalData).toEqual({
        toReviewCount: 1,
        approvedTodayCount: 1,
        rejectedTodayCount: 1,
        reviewTargetMinutes: REVIEW_TARGET_MINUTES,
      });
      expect(res.meta).toMatchObject({ totalCount: 1, totalPages: 1, hasNextPage: false });
    });

    it("keeps the badges the same whatever tab is open", async () => {
      const a = (await queue(PaymentReviewTab.ToReview)).meta!.additionalData;
      const b = (await queue(PaymentReviewTab.ApprovedToday)).meta!.additionalData;
      const c = (await queue(PaymentReviewTab.RejectedToday)).meta!.additionalData;

      expect(b).toEqual(a);
      expect(c).toEqual(a);
    });

    it("says how long the proof has waited, and flags it late", async () => {
      const item = (await queue()).data![0];

      expect(item.waitingMinutes).toBe(39);
      expect(item.isLate).toBe(item.waitingMinutes! >= REVIEW_TARGET_MINUTES);
      expect(item.isLate).toBe(true);
    });

    it("lets the waiting time grow as the clock moves", async () => {
      vi.setSystemTime(new Date(NOW.getTime() + 20 * 60_000));
      const item = (await queue()).data!.find((b) => b.id === 401)!; // was waiting 39 → now 59

      expect(item.waitingMinutes).toBe(59);
      expect(item.isLate).toBe(true);
    });

    it("is not late while it waits less than the review target", async () => {
      stored(401).submittedAt = new Date(NOW.getTime() - 5 * 60_000).toISOString();

      const item = (await queue()).data![0];

      expect(item.waitingMinutes).toBe(5);
      expect(item.isLate).toBe(false);
    });

    it("carries what the reviewer needs: customer, services, method, amount due and the proof image", async () => {
      const item = (await queue()).data!.find((b) => b.id === 401)!;

      expect(item.customer).toEqual({ fullName: "Ahmed Hassan", phoneNumber: "+201001234567" });
      expect(item.items.map((i) => i.nameEn)).toEqual(stored(401).items.map((i) => i.nameEn));
      expect(item.items).toHaveLength(2);
      expect(item.type).toBe(BookingType.Regular);
      expect(item.payment.method).toBe(PaymentMethod.MobileWallet);
      expect(item.payment.totalPrice).toBe(bookingTotal(stored(401)));
      expect(item.payment.proofUrl.startsWith("data:image/svg+xml")).toBe(true);
    });

    it("has no booking number in the list (only the id), like the contract", async () => {
      const item = (await queue()).data![0] as unknown as Record<string, unknown>;

      expect(item["bookingNumber"]).toBeUndefined();
      expect(typeof item["id"]).toBe("number");
    });

    it("shows another branch's queue on its own (the seed has none there)", async () => {
      const res = await queue(undefined, 3);

      expect(res.data).toEqual([]);
      expect(res.meta!.additionalData).toMatchObject({
        toReviewCount: 0,
        approvedTodayCount: 0,
        rejectedTodayCount: 0,
      });
      expect(res.meta).toMatchObject({ totalCount: 0, totalPages: 1 });
    });

    it("pages and clamps the page size", async () => {
      addWaiting(4); // 5 waiting in all

      const res = await settle(repo.getPaymentReviews({ pageNumber: 2, pageSize: 2, branchId: 1 }));

      expect(res.data).toHaveLength(2);
      expect(res.meta).toMatchObject({
        currentPage: 2,
        totalPages: 3,
        hasPreviousPage: true,
        hasNextPage: true,
      });
      const big = await settle(
        repo.getPaymentReviews({ pageNumber: 1, pageSize: 999, branchId: 1 }),
      );
      expect(big.meta!.pageSize).toBe(100);
    });
  });

  describe("getPaymentReviews — reviewed tabs", () => {
    it("ApprovedToday: bookings approved today, latest review first, no waiting time", async () => {
      const older = {
        ...stored(402),
        id: 9201,
        approvedAt: new Date(NOW.getTime() - 20 * 60_000).toISOString(),
      };
      db.bookings.push(older);

      const res = await queue(PaymentReviewTab.ApprovedToday);

      expect(res.data!.map((b) => b.id)).toEqual([9201, 402]); // approved 20 min ago, then 100 min ago
      for (const item of res.data!) {
        expect(item.waitingMinutes).toBeNull();
        expect(item.isLate).toBe(false);
        expect(item.status).toBe(BookingStatus.Confirmed);
      }
    });

    it("RejectedToday: bookings rejected today", async () => {
      const res = await queue(PaymentReviewTab.RejectedToday);

      expect(res.data!.map((b) => b.id)).toEqual([404]);
      expect(res.data![0].status).toBe(BookingStatus.Rejected);
      expect(res.data![0].waitingMinutes).toBeNull();
    });

    it("leaves out reviews of earlier days", async () => {
      db.bookings.push({
        ...stored(404),
        id: 9301,
        rejectedAt: new Date(NOW.getTime() - 2 * 24 * 60 * 60_000).toISOString(),
      });

      const ids = (await queue(PaymentReviewTab.RejectedToday)).data!.map((b) => b.id);

      expect(ids).toEqual([404]);
    });
  });

  describe("approveBooking", () => {
    it("confirms a booking waiting for a review and moves it to the approved-today tab", async () => {
      const res = await settle(repo.approveBooking(401));

      expect(res).toMatchObject({
        status: true,
        message: "Booking Updated Successfully",
        data: null,
      });
      expect(stored(401).status).toBe(BookingStatus.Confirmed);
      const toReview = await queue();
      expect(toReview.data!.map((b) => b.id)).not.toContain(401);
      expect(toReview.meta!.additionalData).toMatchObject({
        toReviewCount: 0,
        approvedTodayCount: 2,
      });
      expect((await queue(PaymentReviewTab.ApprovedToday)).data![0].id).toBe(401); // latest first
    });

    it("answers 409 when the booking isn't waiting for a review — and changes nothing", async () => {
      const error = await failure(repo.approveBooking(402)); // already confirmed

      expect(error.status).toBe(409);
      expect(error.message).toBe(NOT_ALLOWED);
      expect(warning).toHaveBeenCalledWith(NOT_ALLOWED);
      expect(stored(402).status).toBe(BookingStatus.Confirmed);
    });

    it("answers 409 once the start time has passed (the booking expired)", async () => {
      vi.setSystemTime(new Date(NOW.getTime() + 120 * 60_000)); // 14:00; #401 started 13:30

      const error = await failure(repo.approveBooking(401));

      expect(error.status).toBe(409);
      expect(stored(401).status).toBe(BookingStatus.Expired);
    });

    it("can't approve the same booking twice", async () => {
      await settle(repo.approveBooking(401));

      expect((await failure(repo.approveBooking(401))).status).toBe(409);
    });

    it("answers 404 for a booking that doesn't exist", async () => {
      const error = await failure(repo.approveBooking(999999));

      expect(error.status).toBe(404);
      expect(error.message).toBe("This booking no longer exists.");
    });
  });

  describe("rejectBooking", () => {
    const reason = "The transferred amount doesn't match the booking total.";

    it("rejects a waiting booking, keeps the reason for the customer and moves it to the rejected tab", async () => {
      const res = await settle(repo.rejectBooking(401, { reason }));

      expect(res).toMatchObject({
        status: true,
        message: "Booking Updated Successfully",
        data: null,
      });
      expect(stored(401)).toMatchObject({
        status: BookingStatus.Rejected,
        rejectionReason: reason,
      });
      const rejected = await queue(PaymentReviewTab.RejectedToday);
      expect(rejected.data![0].id).toBe(401); // latest first
      expect(rejected.meta!.additionalData).toMatchObject({
        toReviewCount: 0,
        rejectedTodayCount: 2,
      });
    });

    it("trims the reason", async () => {
      await settle(repo.rejectBooking(401, { reason: `  ${reason}  ` }));

      expect(stored(401).rejectionReason).toBe(reason);
    });

    it("frees the barber: the rejected booking no longer counts as upcoming", async () => {
      const barberId = stored(401).barberId;
      const before = db.upcomingBookingsCount(barberId, NOW);

      await settle(repo.rejectBooking(401, { reason }));

      expect(db.upcomingBookingsCount(barberId, NOW)).toBe(before - 1);
    });

    it("answers 400 for a missing reason (blank counts as missing) — and changes nothing", async () => {
      for (const bad of ["", "   "]) {
        const error = await failure(repo.rejectBooking(401, { reason: bad }));
        expect(error.status).toBe(400);
      }
      expect(warning).toHaveBeenCalledWith(
        "VALIDATION_FIELDS.Reason",
        "PAYMENT_REVIEWS.ERRORS.REASON_REQUIRED",
      );
      expect(stored(401).status).toBe(BookingStatus.PendingReview);
    });

    it("answers 400 for 501 characters — and changes nothing — but accepts exactly 500", async () => {
      const error = await failure(
        repo.rejectBooking(401, { reason: "x".repeat(REJECT_REASON_MAX_LENGTH + 1) }),
      );
      expect(error.status).toBe(400);
      expect(warning).toHaveBeenCalledWith(
        "VALIDATION_FIELDS.Reason",
        "PAYMENT_REVIEWS.ERRORS.REASON_TOO_LONG",
      );
      expect(stored(401).status).toBe(BookingStatus.PendingReview);

      expect(
        (await settle(repo.rejectBooking(401, { reason: "x".repeat(REJECT_REASON_MAX_LENGTH) })))
          .status,
      ).toBe(true);
    });

    it("answers 409 when the booking isn't waiting for a review", async () => {
      const error = await failure(repo.rejectBooking(402, { reason }));

      expect(error.status).toBe(409);
      expect(error.message).toBe(NOT_ALLOWED);
      expect(stored(402).status).toBe(BookingStatus.Confirmed);
    });

    it("answers 404 for a booking that doesn't exist", async () => {
      expect((await failure(repo.rejectBooking(999999, { reason }))).status).toBe(404);
    });
  });
});
