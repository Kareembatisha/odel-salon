import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChairType } from "@modules/chairs/model/chair.model";
import {
  BookingStatus,
  BookingType,
  PaymentMethod,
  RefundStatus,
} from "@modules/bookings/model/booking.model";
import { cairoToday } from "../../modules/offers/utils/offer-dates.util";
import {
  REVIEW_TARGET_MINUTES,
  bookingDuration,
  bookingEndAt,
  bookingNumberOf,
  bookingTotal,
  buildMockBookingSeed,
  cairoDayOf,
  canCompleteBooking,
  customerStats,
  isBookingInProgress,
  isUpcomingBooking,
  paymentProofUrl,
  settleBookings,
  upcomingBookingsCount,
  upcomingBookingsFor,
  waitingMinutesOf,
} from "./mock-bookings";
import { MockBooking, MockDb } from "./mock-db";

// 12:00 in Cairo (UTC+2 in November). Every relative seed offset stays inside this one day.
const NOW = new Date("2026-11-13T10:00:00Z");
const TODAY = "2026-11-13";

describe("mock bookings", () => {
  let db: MockDb;

  /** A Confirmed 30-minute booking of barber 1 that starts at the given Cairo wall clock. */
  const booking = (startAt: string, over: Partial<MockBooking> = {}): MockBooking => ({
    ...upcomingBookingsFor(1, 1)[0],
    startAt,
    ...over,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    db = TestBed.inject(MockDb);
  });

  afterEach(() => vi.useRealTimers());

  describe("seed", () => {
    const inBranch = (id: number) => db.bookings.filter((b) => b.branchId === id);

    it("has 9 bookings, all in the first branch (the one the pages open on); the others have none", () => {
      expect(db.bookings).toHaveLength(9);
      expect([1, 2, 3, 4, 5].map((id) => inBranch(id).length)).toEqual([9, 0, 0, 0, 0]);
    });

    it("has one booking per status (two Cancelled: by the customer and by the branch)", () => {
      const byStatus = (status: BookingStatus) => db.bookings.filter((b) => b.status === status);

      for (const status of [
        BookingStatus.PendingReview,
        BookingStatus.Confirmed,
        BookingStatus.Rejected,
        BookingStatus.Expired,
        BookingStatus.Completed,
        BookingStatus.NoShow,
      ]) {
        // Confirmed has two: one to come and one started.
        expect(byStatus(status), `status ${status}`).toHaveLength(
          status === BookingStatus.Confirmed ? 2 : 1,
        );
      }
      const cancelled = byStatus(BookingStatus.Cancelled);
      expect(cancelled.map((b) => b.cancellation!.cancelledByBranch).sort()).toEqual([false, true]);
      expect(db.bookings.filter((b) => isBookingInProgress(b, NOW))).toHaveLength(1);
    });

    it("numbers them 401 to 409 in status order", () => {
      expect(db.bookings.map((b) => [b.id, b.status])).toEqual([
        [401, BookingStatus.PendingReview],
        [402, BookingStatus.Confirmed],
        [403, BookingStatus.Confirmed],
        [404, BookingStatus.Rejected],
        [405, BookingStatus.Expired],
        [406, BookingStatus.Completed],
        [407, BookingStatus.NoShow],
        [408, BookingStatus.Cancelled],
        [409, BookingStatus.Cancelled],
      ]);
    });

    it("gives every booking its own id and a matching `OD-000xxx` number", () => {
      expect(new Set(db.bookings.map((b) => b.id)).size).toBe(db.bookings.length);
      for (const b of db.bookings) expect(b.bookingNumber).toBe(bookingNumberOf(b.id));
      expect(bookingNumberOf(482)).toBe("OD-000482");
    });

    it("only books what the branch offers, with an active barber of that branch", () => {
      for (const b of db.bookings) {
        const branch = db.branches.find((x) => x.id === b.branchId)!;
        const allowed =
          b.type === BookingType.Vip
            ? branch.allowsVip
            : b.type === BookingType.Home
              ? branch.allowsHome
              : branch.allowsRegular;
        expect(allowed, `booking ${b.id} type ${b.type} in ${branch.nameEn}`).toBe(true);

        const barber = db.barbers.find((x) => x.id === b.barberId)!;
        expect(barber.branchId).toBe(b.branchId);
        expect(barber.isActive).toBe(true);
      }
    });

    it("seats Home bookings at an address (no chair) and the others on a chair of their type", () => {
      for (const b of db.bookings) {
        if (b.type === BookingType.Home) {
          expect(b.chairId).toBeNull();
          expect(b.homeAddress).toBeTruthy();
        } else {
          const chair = db.chairs.find((c) => c.id === b.chairId)!;
          expect(chair.branchId).toBe(b.branchId);
          expect(chair.type).toBe(b.type === BookingType.Vip ? ChairType.Vip : ChairType.Regular);
          expect(b.homeAddress).toBeNull();
        }
      }
    });

    it("books existing customers and priced services", () => {
      for (const b of db.bookings) {
        expect(db.customers.some((c) => c.id === b.customerId)).toBe(true);
        expect(b.items.length).toBeGreaterThan(0);
        expect(bookingTotal(b)).toBeGreaterThan(0);
      }
    });

    it("has ONE booking waiting for a review: late, with the right amount", () => {
      const pending = inBranch(1).filter((b) => b.status === BookingStatus.PendingReview);

      expect(pending).toHaveLength(1);
      expect(waitingMinutesOf(pending[0], NOW)).toBe(39);
      expect(waitingMinutesOf(pending[0], NOW)).toBeGreaterThanOrEqual(REVIEW_TARGET_MINUTES);
      expect(pending[0].proofShortfall).toBe(0);
      expect(pending[0].startAt > "2026-11-13T12:00:00").toBe(true); // not expired
    });

    it("has 1 approval and 1 rejection TODAY (the rejected proof was for less than the total)", () => {
      const approvedToday = inBranch(1).filter(
        (b) => b.approvedAt && cairoDayOf(b.approvedAt) === TODAY,
      );
      const rejected = inBranch(1).filter((b) => b.rejectedAt);

      expect(approvedToday.map((b) => b.id)).toEqual([402]);
      expect(rejected.map((b) => b.id)).toEqual([404]);
      expect(cairoDayOf(rejected[0].rejectedAt!)).toBe(TODAY);
      expect(rejected[0].status).toBe(BookingStatus.Rejected);
      expect(rejected[0].rejectionReason).toBeTruthy();
      expect(rejected[0].proofShortfall).toBeGreaterThan(0);
    });

    it("has exactly one booking in progress in the first branch", () => {
      expect(inBranch(1).filter((b) => isBookingInProgress(b, NOW))).toHaveLength(1);
    });

    it("owes refunds only for Cancelled, Expired and Missed bookings — and charges the missed fee", () => {
      for (const b of db.bookings) {
        const owes = [
          BookingStatus.Cancelled,
          BookingStatus.Expired,
          BookingStatus.NoShow,
        ].includes(b.status);
        expect(b.refund !== null, `booking ${b.id}`).toBe(owes);
        if (!b.refund) continue;

        if (b.status === BookingStatus.NoShow) {
          expect(b.refund.feeAmount).toBeCloseTo(bookingTotal(b) * 0.2, 2);
          expect(b.refund.amount + b.refund.feeAmount!).toBeCloseTo(bookingTotal(b), 2);
        } else {
          expect(b.refund.feeAmount).toBeNull();
          expect(b.refund.amount).toBe(bookingTotal(b));
        }
      }
    });

    it("has refunds still owed and refunds already sent", () => {
      const statuses = new Set(db.bookings.map((b) => b.refund?.status));
      expect(statuses.has(RefundStatus.Waiting)).toBe(true);
      expect(statuses.has(RefundStatus.Sent)).toBe(true);
    });

    it("covers every status, both chair types (no Home: the first branch doesn't take it) and both payment methods", () => {
      expect(new Set(db.bookings.map((b) => b.status)).size).toBe(7);
      expect(new Set(db.bookings.map((b) => b.type))).toEqual(
        new Set([BookingType.Regular, BookingType.Vip]),
      );
      expect(new Set(db.bookings.map((b) => b.paymentMethod)).size).toBe(2);
    });

    it("gives the first branch one barber without upcoming bookings (attendance can toggle freely)", () => {
      const counts = db.barbers
        .filter((b) => b.branchId === 1 && b.isActive)
        .map((b) => db.upcomingBookingsCount(b.id, NOW));

      expect(counts).toEqual([1, 0, 2]);
    });

    it("can be built again from the same data with the same result", () => {
      const again = buildMockBookingSeed(db, NOW);
      expect(again.bookings).toEqual(db.bookings);
      expect(again.customers).toEqual(db.customers);
    });

    it("skips rows of a branch that doesn't exist or has no active barber, instead of half-building", () => {
      const seed = buildMockBookingSeed(
        { branches: [], barbers: db.barbers, chairs: db.chairs, services: db.services },
        NOW,
      );
      expect(seed.bookings).toEqual([]);
    });
  });

  describe("derived values", () => {
    it("adds up the total, the duration and the end time", () => {
      const b = booking("2026-11-13T19:00:00", {
        items: [
          { serviceId: 1, nameAr: "", nameEn: "Haircut", durationMinutes: 30, price: 200 },
          { serviceId: 2, nameAr: "", nameEn: "Beard trim", durationMinutes: 20, price: 140 },
        ],
      });

      expect(bookingTotal(b)).toBe(340);
      expect(bookingDuration(b)).toBe(50);
      expect(bookingEndAt(b)).toBe("2026-11-13T19:50:00");
    });

    it("counts minutes waited, never negative", () => {
      expect(
        waitingMinutesOf(
          booking("2026-11-13T15:00:00", { submittedAt: "2026-11-13T09:48:00Z" }),
          NOW,
        ),
      ).toBe(12);
      expect(
        waitingMinutesOf(
          booking("2026-11-13T15:00:00", { submittedAt: "2026-11-13T11:00:00Z" }),
          NOW,
        ),
      ).toBe(0);
    });

    it("is 'Started' only for a Confirmed booking between its start and its end", () => {
      expect(isBookingInProgress(booking("2026-11-13T11:45:00"), NOW)).toBe(true);
      expect(isBookingInProgress(booking("2026-11-13T12:00:00"), NOW)).toBe(true); // starts now
      expect(isBookingInProgress(booking("2026-11-13T11:30:00"), NOW)).toBe(false); // ends now
      expect(isBookingInProgress(booking("2026-11-13T12:01:00"), NOW)).toBe(false); // not yet
      expect(
        isBookingInProgress(
          booking("2026-11-13T11:45:00", { status: BookingStatus.PendingReview }),
          NOW,
        ),
      ).toBe(false);
    });

    it("lets a booking be ended only once Confirmed and started", () => {
      expect(canCompleteBooking(booking("2026-11-13T12:00:00"), NOW)).toBe(true);
      expect(canCompleteBooking(booking("2026-11-13T12:01:00"), NOW)).toBe(false);
      expect(
        canCompleteBooking(
          booking("2026-11-13T11:00:00", { status: BookingStatus.Completed }),
          NOW,
        ),
      ).toBe(false);
    });

    it("counts a booking as upcoming while it is pending / confirmed and hasn't ended", () => {
      expect(isUpcomingBooking(booking("2026-11-13T11:31:00"), NOW)).toBe(true); // ends 12:01
      expect(isUpcomingBooking(booking("2026-11-13T11:30:00"), NOW)).toBe(false); // ends 12:00
      expect(
        isUpcomingBooking(booking("2026-11-13T15:00:00", { status: BookingStatus.Rejected }), NOW),
      ).toBe(false);
      expect(
        isUpcomingBooking(booking("2026-11-13T15:00:00", { status: BookingStatus.Completed }), NOW),
      ).toBe(false);
    });

    it("counts a barber's upcoming bookings only", () => {
      const list = [
        booking("2026-11-13T15:00:00"),
        booking("2026-11-13T16:00:00", { status: BookingStatus.PendingReview }),
        booking("2026-11-13T17:00:00", { status: BookingStatus.Cancelled }),
        booking("2026-11-13T18:00:00", { barberId: 2 }),
      ];

      expect(upcomingBookingsCount(list, 1, NOW)).toBe(2);
      expect(upcomingBookingsCount(list, 2, NOW)).toBe(1);
      expect(upcomingBookingsCount(list, 3, NOW)).toBe(0);
    });

    it("tells a customer's completed visits from missed ones, across branches", () => {
      const list = [
        booking("2026-11-01T10:00:00", { status: BookingStatus.Completed, customerId: 7 }),
        booking("2026-11-02T10:00:00", {
          status: BookingStatus.Completed,
          customerId: 7,
          branchId: 3,
        }),
        booking("2026-11-03T10:00:00", { status: BookingStatus.NoShow, customerId: 7 }),
        booking("2026-11-04T10:00:00", { status: BookingStatus.Completed, customerId: 8 }),
      ];

      expect(customerStats(list, 7)).toEqual({ visitsCount: 2, noShowCount: 1 });
      expect(customerStats(list, 9)).toEqual({ visitsCount: 0, noShowCount: 0 });
    });

    it("answers the Cairo day of an instant, not the UTC day", () => {
      expect(cairoDayOf("2026-11-12T22:30:00Z")).toBe("2026-11-13");
      expect(cairoToday(NOW)).toBe(TODAY);
    });
  });

  describe("settleBookings", () => {
    const pending = (startAt: string) => booking(startAt, { status: BookingStatus.PendingReview });

    it("expires a booking nobody reviewed by its start time and owes the customer the full total", () => {
      const late = pending("2026-11-13T11:59:00");
      const atStart = pending("2026-11-13T12:00:00");
      const later = pending("2026-11-13T12:01:00");

      settleBookings([late, atStart, later], NOW);

      expect(late.status).toBe(BookingStatus.Expired);
      expect(late.refund).toEqual({
        status: RefundStatus.Waiting,
        amount: bookingTotal(late),
        feeAmount: null,
      });
      expect(atStart.status).toBe(BookingStatus.Expired);
      expect(later.status).toBe(BookingStatus.PendingReview);
      expect(later.refund).toBeNull();
    });

    it("completes a Confirmed booking 2 hours after it ends — not before", () => {
      const done = booking("2026-11-13T09:29:00"); // ends 09:59 → +2h = 11:59
      const open = booking("2026-11-13T09:31:00"); // ends 10:01 → +2h = 12:01

      settleBookings([done, open], NOW);

      expect(done.status).toBe(BookingStatus.Completed);
      expect(open.status).toBe(BookingStatus.Confirmed);
    });

    it("leaves every other status alone and is safe to repeat", () => {
      const list = [
        booking("2026-11-13T08:00:00", { status: BookingStatus.Rejected }),
        booking("2026-11-13T08:00:00", { status: BookingStatus.Cancelled }),
        pending("2026-11-13T11:00:00"),
      ];

      settleBookings(list, NOW);
      const once = JSON.stringify(list);
      settleBookings(list, NOW);

      expect(JSON.stringify(list)).toBe(once);
      expect(list.map((b) => b.status)).toEqual([
        BookingStatus.Rejected,
        BookingStatus.Cancelled,
        BookingStatus.Expired,
      ]);
    });

    it("keeps time moving in the seeded data: two hours later the unreviewed booking has expired", () => {
      vi.setSystemTime(new Date(NOW.getTime() + 120 * 60_000));
      db.settleBookings();

      const expired = db.bookings.find((b) => b.id === 401)!;
      expect(expired.status).toBe(BookingStatus.Expired);
      expect(expired.refund).toEqual({
        status: RefundStatus.Waiting,
        amount: bookingTotal(expired),
        feeAmount: null,
      });
    });
  });

  describe("payment proof", () => {
    const decode = (url: string) => decodeURIComponent(url.split(",")[1]);
    const branch = () => db.branches.find((b) => b.id === 1)!;

    it("is an image data URL that needs no file or network", () => {
      const url = paymentProofUrl(booking("2026-11-13T15:00:00"), branch());

      expect(url.startsWith("data:image/svg+xml")).toBe(true);
      expect(decode(url)).toContain("<svg");
    });

    it("shows the exact amount, or less when the booking has a short proof", () => {
      const b = booking("2026-11-13T15:00:00", {
        items: [{ serviceId: 1, nameAr: "", nameEn: "Haircut", durationMinutes: 30, price: 340 }],
      });

      expect(decode(paymentProofUrl(b, branch()))).toContain("EGP 340.00");
      expect(decode(paymentProofUrl({ ...b, proofShortfall: 40 }, branch()))).toContain(
        "EGP 300.00",
      );
    });

    it("names the method and the branch's account", () => {
      const insta = decode(paymentProofUrl(booking("2026-11-13T15:00:00"), branch()));
      const wallet = decode(
        paymentProofUrl(
          booking("2026-11-13T15:00:00", { paymentMethod: PaymentMethod.MobileWallet }),
          { ...branch(), walletNumber: "+201099998888" },
        ),
      );

      expect(insta).toContain("InstaPay transfer");
      expect(insta).toContain("odel.zamalek@instapay");
      expect(wallet).toContain("Mobile wallet transfer");
      expect(wallet).toContain("+201099998888");
    });

    it("is stable for the same booking (so a re-render doesn't change the picture)", () => {
      const b = booking("2026-11-13T15:00:00");
      expect(paymentProofUrl(b, branch())).toBe(paymentProofUrl(b, branch()));
    });
  });

  describe("upcomingBookingsFor (test helper)", () => {
    it("builds that many Confirmed bookings for the barber, one hour apart, in the future", () => {
      const list = upcomingBookingsFor(5, 3);

      expect(list).toHaveLength(3);
      expect(list.every((b) => b.barberId === 5 && b.status === BookingStatus.Confirmed)).toBe(
        true,
      );
      expect(new Set(list.map((b) => b.id)).size).toBe(3);
      expect(upcomingBookingsCount(list, 5, new Date())).toBe(3);
    });
  });
});
