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

  describe("getPaymentReviews — ToReview", () => {
    it("is the default tab: the branch's PendingReview bookings, the ones that expire first on top", async () => {
      const res = await queue();

      expect(res.data).toHaveLength(5);
      expect(res.data!.every((b) => b.status === BookingStatus.PendingReview)).toBe(true);
      const starts = res.data!.map((b) => b.startAt);
      expect(starts).toEqual([...starts].sort());
      expect((await queue(PaymentReviewTab.ToReview)).data).toEqual(res.data);
    });

    it("gives the tab badges and the review target of the selected branch", async () => {
      const res = await queue();

      expect(res.meta!.additionalData).toEqual({
        toReviewCount: 5,
        approvedTodayCount: 2,
        rejectedTodayCount: 1,
        reviewTargetMinutes: REVIEW_TARGET_MINUTES,
      });
      expect(res.meta).toMatchObject({ totalCount: 5, totalPages: 1, hasNextPage: false });
    });

    it("keeps the badges the same whatever tab is open", async () => {
      const a = (await queue(PaymentReviewTab.ToReview)).meta!.additionalData;
      const b = (await queue(PaymentReviewTab.ApprovedToday)).meta!.additionalData;
      const c = (await queue(PaymentReviewTab.RejectedToday)).meta!.additionalData;

      expect(b).toEqual(a);
      expect(c).toEqual(a);
    });

    it("says how long each proof has waited, and flags the late ones", async () => {
      const res = await queue();

      const waiting = res.data!.map((b) => b.waitingMinutes).sort((x, y) => x! - y!);
      expect(waiting).toEqual([5, 12, 20, 39, 55]);
      for (const item of res.data!) {
        expect(item.isLate).toBe(item.waitingMinutes! >= REVIEW_TARGET_MINUTES);
      }
      expect(res.data!.filter((b) => b.isLate)).toHaveLength(2);
    });

    it("lets the waiting time grow as the clock moves", async () => {
      vi.setSystemTime(new Date(NOW.getTime() + 20 * 60_000));
      const res = await queue();
      const item = res.data!.find((b) => b.id === 401)!; // was waiting 12 → now 32

      expect(item.waitingMinutes).toBe(32);
      expect(item.isLate).toBe(true);
    });

    it("carries what the reviewer needs: customer, services, method, amount due and the proof image", async () => {
      const item = (await queue()).data!.find((b) => b.id === 401)!;

      expect(item.customer).toEqual({ fullName: "Ahmed Hassan", phoneNumber: "+201001234567" });
      expect(item.items.map((i) => i.nameEn)).toEqual(["Haircut", "Beard trim"]);
      expect(item.type).toBe(BookingType.Regular);
      expect(item.payment.method).toBe(PaymentMethod.InstaPay);
      expect(item.payment.totalPrice).toBe(bookingTotal(stored(401)));
      expect(item.payment.proofUrl.startsWith("data:image/svg+xml")).toBe(true);
    });

    it("has no booking number in the list (only the id), like the contract", async () => {
      const item = (await queue()).data![0] as unknown as Record<string, unknown>;

      expect(item["bookingNumber"]).toBeUndefined();
      expect(typeof item["id"]).toBe("number");
    });

    it("shows another branch's queue on its own", async () => {
      const res = await queue(undefined, 3);

      expect(res.data).toHaveLength(1);
      expect(res.data![0].type).toBe(BookingType.Home);
      expect(res.meta!.additionalData).toMatchObject({ toReviewCount: 1 });
    });

    it("pages and clamps the page size", async () => {
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
      const res = await queue(PaymentReviewTab.ApprovedToday);

      expect(res.data!.map((b) => b.id)).toEqual([407, 406]); // approved 45 min ago, then 100 min ago
      for (const item of res.data!) {
        expect(item.waitingMinutes).toBeNull();
        expect(item.isLate).toBe(false);
        expect(item.status).toBe(BookingStatus.Confirmed);
      }
    });

    it("RejectedToday: bookings rejected today", async () => {
      const res = await queue(PaymentReviewTab.RejectedToday);

      expect(res.data).toHaveLength(1);
      expect(res.data![0].status).toBe(BookingStatus.Rejected);
      expect(res.data![0].waitingMinutes).toBeNull();
    });

    it("leaves out reviews of earlier days", async () => {
      const ids = (await queue(PaymentReviewTab.RejectedToday)).data!.map((b) => b.id);
      const older = db.bookings.filter(
        (b) => b.branchId === 1 && b.status === BookingStatus.Rejected && !ids.includes(b.id),
      );

      expect(older.length).toBeGreaterThan(0);
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
        toReviewCount: 4,
        approvedTodayCount: 3,
      });
      expect((await queue(PaymentReviewTab.ApprovedToday)).data![0].id).toBe(401); // latest first
    });

    it("answers 409 when the booking isn't waiting for a review — and changes nothing", async () => {
      const error = await failure(repo.approveBooking(406)); // already confirmed

      expect(error.status).toBe(409);
      expect(error.message).toBe(NOT_ALLOWED);
      expect(warning).toHaveBeenCalledWith(NOT_ALLOWED);
      expect(stored(406).status).toBe(BookingStatus.Confirmed);
    });

    it("answers 409 once the start time has passed (the booking expired)", async () => {
      vi.setSystemTime(new Date(NOW.getTime() + 60 * 60_000)); // 13:00; #401 started 12:45

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
      const res = await settle(repo.rejectBooking(405, { reason }));

      expect(res).toMatchObject({
        status: true,
        message: "Booking Updated Successfully",
        data: null,
      });
      expect(stored(405)).toMatchObject({
        status: BookingStatus.Rejected,
        rejectionReason: reason,
      });
      const rejected = await queue(PaymentReviewTab.RejectedToday);
      expect(rejected.data![0].id).toBe(405); // latest first
      expect(rejected.meta!.additionalData).toMatchObject({
        toReviewCount: 4,
        rejectedTodayCount: 2,
      });
    });

    it("trims the reason", async () => {
      await settle(repo.rejectBooking(405, { reason: `  ${reason}  ` }));

      expect(stored(405).rejectionReason).toBe(reason);
    });

    it("frees the barber: the rejected booking no longer counts as upcoming", async () => {
      const barberId = stored(405).barberId;
      const before = db.upcomingBookingsCount(barberId, NOW);

      await settle(repo.rejectBooking(405, { reason }));

      expect(db.upcomingBookingsCount(barberId, NOW)).toBe(before - 1);
    });

    it("answers 400 for a missing reason (blank counts as missing) — and changes nothing", async () => {
      for (const bad of ["", "   "]) {
        const error = await failure(repo.rejectBooking(405, { reason: bad }));
        expect(error.status).toBe(400);
      }
      expect(warning).toHaveBeenCalledWith(
        "VALIDATION_FIELDS.Reason",
        "PAYMENT_REVIEWS.ERRORS.REASON_REQUIRED",
      );
      expect(stored(405).status).toBe(BookingStatus.PendingReview);
    });

    it("accepts a reason of exactly 500 characters and answers 400 for 501", async () => {
      expect(
        (await settle(repo.rejectBooking(405, { reason: "x".repeat(REJECT_REASON_MAX_LENGTH) })))
          .status,
      ).toBe(true);

      const error = await failure(
        repo.rejectBooking(404, { reason: "x".repeat(REJECT_REASON_MAX_LENGTH + 1) }),
      );
      expect(error.status).toBe(400);
      expect(warning).toHaveBeenCalledWith(
        "VALIDATION_FIELDS.Reason",
        "PAYMENT_REVIEWS.ERRORS.REASON_TOO_LONG",
      );
      expect(stored(404).status).toBe(BookingStatus.PendingReview);
    });

    it("answers 409 when the booking isn't waiting for a review", async () => {
      const error = await failure(repo.rejectBooking(406, { reason }));

      expect(error.status).toBe(409);
      expect(error.message).toBe(NOT_ALLOWED);
      expect(stored(406).status).toBe(BookingStatus.Confirmed);
    });

    it("answers 404 for a booking that doesn't exist", async () => {
      expect((await failure(repo.rejectBooking(999999, { reason }))).status).toBe(404);
    });
  });
});
