import { TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Observable, firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../assets/i18n/en.json";
import { bookingTotal } from "@core/mock/mock-bookings";
import { MockBooking, MockDb } from "@core/mock/mock-db";
import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import {
  BookingListItem,
  BookingStatus,
  BookingTab,
  BookingType,
  RefundStatus,
} from "../model/booking.model";
import { BookingMockRepository } from "./booking-mock.repository";

// 12:00 in Cairo (UTC+2 in November): every relative seed offset stays inside this one day.
const NOW = new Date("2026-11-13T10:00:00Z");
const TODAY = "2026-11-13";

describe("BookingMockRepository", () => {
  let repo: BookingMockRepository;
  let db: MockDb;
  let warning: ReturnType<typeof vi.spyOn>;

  /** Resolves a mock response past its simulated latency. */
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

  const page = (q: Partial<Parameters<BookingMockRepository["getBookings"]>[0]> = {}) =>
    settle(repo.getBookings({ pageNumber: 1, pageSize: 100, branchId: 1, ...q }));

  const numbersOf = (res: ApiResponse<BookingListItem[]>) => res.data!.map((b) => b.bookingNumber);
  const first = (pred: (b: MockBooking) => boolean) => db.bookings.find(pred)!;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation("en", en);
    translate.use("en");
    repo = TestBed.inject(BookingMockRepository);
    db = TestBed.inject(MockDb);
    warning = vi.spyOn(TestBed.inject(NotificationService), "warning");
  });

  afterEach(() => vi.useRealTimers());

  describe("getBookings — paging and counters", () => {
    it("pages the selected branch, newest first (the 'All' tab)", async () => {
      const res = await settle(repo.getBookings({ pageNumber: 1, pageSize: 4, branchId: 1 }));

      expect(res.data).toHaveLength(4);
      expect(res.meta).toMatchObject({
        currentPage: 1,
        pageSize: 4,
        totalPages: 3,
        totalCount: 9,
        hasPreviousPage: false,
        hasNextPage: true,
      });
      const starts = res.data!.map((b) => b.startAt);
      expect(starts).toEqual([...starts].sort().reverse());
    });

    it("serves the last page with what is left", async () => {
      const res = await settle(repo.getBookings({ pageNumber: 3, pageSize: 4, branchId: 1 }));

      expect(res.data).toHaveLength(1);
      expect(res.meta).toMatchObject({ currentPage: 3, hasPreviousPage: true, hasNextPage: false });
    });

    it("clamps the page size to 100 and to at least 1", async () => {
      expect((await page({ pageSize: 500, branchId: undefined })).meta!.pageSize).toBe(100);
      expect((await page({ pageSize: 0 })).meta!.pageSize).toBe(1);
    });

    it("gives the Today and Waiting counters of the selected branch", async () => {
      const res = await page();
      const inBranch = db.bookings.filter((b) => b.branchId === 1);

      expect(res.meta!.additionalData).toEqual({
        todayCount: inBranch.filter((b) => b.startAt.startsWith(TODAY)).length,
        refundWaitingCount: inBranch.filter((b) => b.refund?.status === RefundStatus.Waiting)
          .length,
      });
      expect(res.meta!.additionalData).toEqual({ todayCount: 6, refundWaitingCount: 3 });
    });

    it("does not let the other filters or the search move the counters", async () => {
      const all = (await page()).meta!.additionalData;

      const filtered = await page({
        tab: BookingTab.Past,
        type: BookingType.Vip,
        statuses: [BookingStatus.Completed],
        search: "ahmed",
      });

      expect(filtered.meta!.additionalData).toEqual(all);
    });

    it("counts another branch on its own, and every branch when none is selected", async () => {
      expect((await page({ branchId: 2 })).meta!.totalCount).toBe(0); // the seed has none there
      expect((await page({ branchId: undefined })).meta!.totalCount).toBe(9);
      expect((await page({ branchId: 2 })).meta!.additionalData).toMatchObject({
        todayCount: db.bookings.filter((b) => b.branchId === 2 && b.startAt.startsWith(TODAY))
          .length,
      });
    });
  });

  describe("getBookings — tabs", () => {
    it("Today: the branch's bookings of today, soonest first", async () => {
      const res = await page({ tab: BookingTab.Today });

      expect(res.data).toHaveLength(6);
      expect(res.data!.every((b) => b.startAt.startsWith(TODAY))).toBe(true);
      const starts = res.data!.map((b) => b.startAt);
      expect(starts).toEqual([...starts].sort());
    });

    it("Upcoming: pending / confirmed bookings that haven't ended, soonest first", async () => {
      const res = await page({ tab: BookingTab.Upcoming });

      expect(res.data).toHaveLength(3); // 1 waiting + 1 confirmed + 1 in progress
      expect(
        res.data!.every((b) =>
          [BookingStatus.PendingReview, BookingStatus.Confirmed].includes(b.status),
        ),
      ).toBe(true);
      const starts = res.data!.map((b) => b.startAt);
      expect(starts).toEqual([...starts].sort());
    });

    it("Past: everything else, newest first — and Upcoming + Past add up to All", async () => {
      const past = await page({ tab: BookingTab.Past });
      const upcoming = await page({ tab: BookingTab.Upcoming });

      expect(past.data).toHaveLength(6);
      expect(past.data!.length + upcoming.data!.length).toBe(9);
      const starts = past.data!.map((b) => b.startAt);
      expect(starts).toEqual([...starts].sort().reverse());
      expect(past.data!.some((b) => b.status === BookingStatus.Rejected)).toBe(true);
    });

    it("treats the default tab as All", async () => {
      expect((await page()).meta!.totalCount).toBe(
        (await page({ tab: BookingTab.All })).meta!.totalCount,
      );
    });
  });

  describe("getBookings — filters", () => {
    it("filters by barber", async () => {
      const barber = db.barbers.find((b) => b.branchId === 1 && b.isActive)!;
      const res = await page({ barberId: barber.id });

      expect(res.data!.length).toBeGreaterThan(0);
      expect(res.data!.every((b) => b.barber.fullName === barber.fullName)).toBe(true);
    });

    it("filters by type", async () => {
      const res = await page({ type: BookingType.Vip });

      expect(res.data!.length).toBeGreaterThan(0);
      expect(res.data!.every((b) => b.type === BookingType.Vip)).toBe(true);
      expect((await page({ type: BookingType.Home })).data).toEqual([]); // Zamalek has no Home
    });

    it("filters by several statuses at once", async () => {
      const res = await page({ statuses: [BookingStatus.Cancelled, BookingStatus.NoShow] });

      expect(res.data!.length).toBeGreaterThan(0);
      expect(
        res.data!.every((b) => [BookingStatus.Cancelled, BookingStatus.NoShow].includes(b.status)),
      ).toBe(true);
    });

    it("filters by status 0 (PendingReview) — zero is a real value", async () => {
      const res = await page({ statuses: [BookingStatus.PendingReview] });

      expect(res.data).toHaveLength(1);
    });

    it("filters by an inclusive date range", async () => {
      const yesterday = await page({ dateFrom: "2026-11-12", dateTo: "2026-11-12" });
      const span = await page({ dateFrom: "2026-11-11", dateTo: "2026-11-12" });

      expect(yesterday.data!.length).toBeGreaterThan(0);
      expect(yesterday.data!.every((b) => b.startAt.startsWith("2026-11-12"))).toBe(true);
      expect(span.data!.length).toBeGreaterThan(yesterday.data!.length);
      expect(
        (await page({ dateFrom: "2026-11-14" })).data!.every((b) => b.startAt >= "2026-11-14"),
      ).toBe(true);
    });

    it("answers 400 when the end date is before the start date", async () => {
      const error = await failure(
        repo.getBookings({
          pageNumber: 1,
          pageSize: 20,
          dateFrom: "2026-11-13",
          dateTo: "2026-11-12",
        }),
      );

      expect(error.status).toBe(400);
      expect(warning).toHaveBeenCalledWith(
        "VALIDATION_FIELDS.DateTo",
        "BOOKINGS.ERRORS.INVALID_DATE_RANGE",
      );
    });

    it("filters by refund status; 0 (Waiting) is a filter, not 'all'", async () => {
      const waiting = await page({ refundStatus: RefundStatus.Waiting });
      const sent = await page({ refundStatus: RefundStatus.Sent });

      expect(waiting.data).toHaveLength(3);
      expect(waiting.data!.every((b) => b.refund?.status === RefundStatus.Waiting)).toBe(true);
      expect(sent.data!.length).toBeGreaterThan(0);
      expect(sent.data!.every((b) => b.refund?.status === RefundStatus.Sent)).toBe(true);
      expect((await page()).data!.length).toBe(9);
    });

    it("combines filters (all of them must match)", async () => {
      const res = await page({
        tab: BookingTab.Past,
        type: BookingType.Regular,
        statuses: [BookingStatus.Completed],
      });

      expect(res.data!.length).toBeGreaterThan(0);
      expect(
        res.data!.every(
          (b) => b.type === BookingType.Regular && b.status === BookingStatus.Completed,
        ),
      ).toBe(true);
    });
  });

  describe("getBookings — search", () => {
    it.each(["OD-000401", "#OD-000401", "od-000401", "401"])(
      "finds a booking by its number: %j",
      async (term) => {
        const res = await page({ search: term });

        expect(numbersOf(res)).toContain("OD-000401");
      },
    );

    it("finds by customer name, ignoring case", async () => {
      const res = await page({ search: "AHMED hassan" });

      expect(res.data!.length).toBeGreaterThan(0);
      expect(res.data!.every((b) => b.customer.fullName === "Ahmed Hassan")).toBe(true);
    });

    it("finds by phone, with or without +20 and spaces", async () => {
      for (const term of ["+201001234567", "1001234567", "+20 100 123 4567"]) {
        const res = await page({ search: term });
        expect(res.data!.length, term).toBeGreaterThan(0);
        expect(res.data!.every((b) => b.customer.phoneNumber === "+201001234567")).toBe(true);
      }
    });

    it("returns nothing for a term that matches nothing, and ignores a blank one", async () => {
      expect((await page({ search: "zzzzzz" })).data).toEqual([]);
      expect((await page({ search: "   " })).data).toHaveLength(9);
    });
  });

  describe("getBookings — the list item", () => {
    it("carries what the table shows", async () => {
      const res = await page({ search: "OD-000401" });
      const item = res.data![0];

      expect(item).toMatchObject({
        id: 401,
        bookingNumber: "OD-000401",
        type: BookingType.Regular,
        status: BookingStatus.PendingReview,
        isInProgress: false,
        refund: null,
      });
      expect(item.customer).toEqual({ fullName: "Ahmed Hassan", phoneNumber: "+201001234567" });
      expect(item.items.map((i) => i.nameEn)).toEqual(
        first((b) => b.id === 401).items.map((i) => i.nameEn),
      );
      expect(item.items[0].nameAr).toBeTruthy();
      expect(item.barber.fullName).toBeTruthy();
      expect(item.payment.totalPrice).toBe(bookingTotal(first((b) => b.id === 401)));
    });

    it("marks exactly the booking that is under way as 'in progress'", async () => {
      const started = (await page()).data!.filter((b) => b.isInProgress);

      expect(started).toHaveLength(1);
      expect(started[0].status).toBe(BookingStatus.Confirmed);
    });

    it("carries the refund of a missed booking with its fee", async () => {
      const missed = (await page({ statuses: [BookingStatus.NoShow] })).data!;

      expect(missed.length).toBeGreaterThan(0);
      for (const b of missed) {
        expect(b.refund!.feeAmount).toBeCloseTo(b.payment.totalPrice * 0.2, 2);
      }
    });

    it("hands out a copy: editing a result never changes the stored booking", async () => {
      const item = (await page({ search: "OD-000407" })).data![0];
      item.refund!.amount = 0;

      expect(first((b) => b.id === 407).refund!.amount).toBeGreaterThan(0);
    });
  });

  describe("getBookingById", () => {
    it("returns the full details of a booking", async () => {
      const stored = first((b) => b.id === 403); // the one in progress
      const res = await settle(repo.getBookingById(403));
      const d = res.data!;

      expect(res.status).toBe(true);
      expect(d).toMatchObject({
        id: 403,
        bookingNumber: "OD-000403",
        status: BookingStatus.Confirmed,
        isInProgress: true,
        type: BookingType.Regular,
        startAt: stored.startAt,
        durationMinutes: 45,
        homeAddress: null,
        refund: null,
      });
      expect(d.branch).toEqual({ id: 1, nameAr: "الزمالك", nameEn: "Zamalek" });
      expect(d.chair!.name).toMatch(/^R\d$/);
      expect(d.items).toHaveLength(2);
      expect(d.items[0]).toMatchObject({ nameEn: "Haircut", durationMinutes: 30 });
      expect(d.payment.totalPrice).toBe(bookingTotal(stored));
      expect(d.payment.subtotal).toBe(d.payment.totalPrice);
      expect(d.items.reduce((s, i) => s + i.price, 0)).toBe(d.payment.totalPrice);
    });

    it("counts the customer's completed and missed bookings across all branches", async () => {
      const d = (await settle(repo.getBookingById(401))).data!;
      const mine = db.bookings.filter((b) => b.customerId === d.customer.id);

      expect(d.customer.id).toBeGreaterThan(0);
      expect(d.customer.visitsCount).toBe(
        mine.filter((b) => b.status === BookingStatus.Completed).length,
      );
      expect(d.customer.noShowCount).toBe(
        mine.filter((b) => b.status === BookingStatus.NoShow).length,
      );
    });

    it("gives a Home booking an address and no chair", async () => {
      const home = first((b) => b.id === 401);
      home.type = BookingType.Home;
      home.chairId = null;
      home.homeAddress = "14 Al Nozha St, Heliopolis, Cairo";

      const d = (await settle(repo.getBookingById(home.id))).data!;

      expect(d.chair).toBeNull();
      expect(d.homeAddress).toBe("14 Al Nozha St, Heliopolis, Cairo");
    });

    it("gives the barber a rating, or none while they have no reviews", async () => {
      const ratings = new Set<number | null>();
      for (const b of db.bookings) {
        ratings.add((await settle(repo.getBookingById(b.id))).data!.barber.averageRating);
      }

      expect(ratings.has(null)).toBe(true);
      expect([...ratings].some((r) => typeof r === "number" && r >= 4 && r <= 5)).toBe(true);
    });

    it("offers 'End session' only to a booking that is Confirmed and has started", async () => {
      const started = (await settle(repo.getBookingById(403))).data!;
      const future = (await settle(repo.getBookingById(402))).data!;
      const pending = (await settle(repo.getBookingById(401))).data!;

      expect(started.actions.canComplete).toBe(true);
      expect(future.actions.canComplete).toBe(false);
      expect(pending.actions.canComplete).toBe(false);
    });

    it("offers 'Refund sent' only while a refund is still owed", async () => {
      const owed = first((b) => b.refund?.status === RefundStatus.Waiting);
      const sent = first((b) => b.refund?.status === RefundStatus.Sent);

      expect((await settle(repo.getBookingById(owed.id))).data!.actions.canMarkRefunded).toBe(true);
      expect((await settle(repo.getBookingById(sent.id))).data!.actions.canMarkRefunded).toBe(
        false,
      );
      expect((await settle(repo.getBookingById(403))).data!.actions.canMarkRefunded).toBe(false);
    });

    it("answers a status:false 404 body (no toast) when the booking doesn't exist", async () => {
      const res = await settle(repo.getBookingById(999999));

      expect(res).toMatchObject({ status: false, statusCode: 404, data: null });
      expect(warning).not.toHaveBeenCalled();
    });
  });

  describe("completeBooking", () => {
    it("ends a started, Confirmed booking", async () => {
      const res = await settle(repo.completeBooking(403));

      expect(res).toMatchObject({
        status: true,
        message: "Booking Updated Successfully",
        data: null,
      });
      expect(first((b) => b.id === 403).status).toBe(BookingStatus.Completed);
      const d = (await settle(repo.getBookingById(403))).data!;
      expect(d.status).toBe(BookingStatus.Completed);
      expect(d.isInProgress).toBe(false);
      expect(d.actions.canComplete).toBe(false);
    });

    it("answers 409 before the start time — and changes nothing", async () => {
      const error = await failure(repo.completeBooking(402));

      expect(error.status).toBe(409);
      expect(error.message).toBe("This booking hasn’t started yet.");
      expect(warning).toHaveBeenCalledWith("This booking hasn’t started yet.");
      expect(first((b) => b.id === 402).status).toBe(BookingStatus.Confirmed);
    });

    it("answers 409 when the booking isn't Confirmed", async () => {
      for (const id of [401, 406]) {
        // 401 is waiting for a review, 406 is already completed
        const error = await failure(repo.completeBooking(id));
        expect(error.status).toBe(409);
        expect(error.message).toBe("This action isn’t allowed for the booking’s current status.");
      }
      expect(first((b) => b.id === 401).status).toBe(BookingStatus.PendingReview);
    });

    it("answers 404 for a booking that doesn't exist", async () => {
      const error = await failure(repo.completeBooking(999999));

      expect(error.status).toBe(404);
      expect(error.message).toBe("This booking no longer exists.");
    });

    it("can't end the same booking twice", async () => {
      await settle(repo.completeBooking(403));

      expect((await failure(repo.completeBooking(403))).status).toBe(409);
    });

    it("lets a barber leave once their last open booking is ended", async () => {
      const barberId = first((b) => b.id === 403).barberId;
      const before = db.upcomingBookingsCount(barberId, NOW);

      await settle(repo.completeBooking(403));

      expect(db.upcomingBookingsCount(barberId, NOW)).toBe(before - 1);
    });
  });

  describe("cancelBooking (by the branch)", () => {
    it("cancels a pending booking: Cancelled, a full refund owed, and who / why on record", async () => {
      const total = bookingTotal(first((b) => b.id === 401));

      const res = await settle(repo.cancelBooking(401, "  The barber is sick  "));

      expect(res).toMatchObject({
        status: true,
        message: "Booking Updated Successfully",
        data: null,
      });
      const stored = first((b) => b.id === 401);
      expect(stored.status).toBe(BookingStatus.Cancelled);
      expect(stored.refund).toEqual({
        status: RefundStatus.Waiting,
        amount: total,
        feeAmount: null,
      });
      expect(stored.cancellation).toMatchObject({
        cancelledByBranch: true,
        reason: null,
        note: "The barber is sick",
      });
      const d = (await settle(repo.getBookingById(401))).data!;
      expect(d.cancellation?.cancelledByName).toBeTruthy();
      expect(d.actions).toMatchObject({ canCancel: false, canMarkRefunded: true });
    });

    it("also cancels a booking that is in progress", async () => {
      await settle(repo.cancelBooking(403, "The customer asked by phone"));

      expect(first((b) => b.id === 403).status).toBe(BookingStatus.Cancelled);
    });

    it("adds to the refund-waiting counter", async () => {
      const before = (await page()).meta!.additionalData!["refundWaitingCount"] as number;

      await settle(repo.cancelBooking(401, "Branch closed"));

      expect((await page()).meta!.additionalData!["refundWaitingCount"]).toBe(before + 1);
    });

    it("answers 400 for an empty or too long reason — and changes nothing", async () => {
      for (const reason of ["", "   ", "x".repeat(501)]) {
        expect((await failure(repo.cancelBooking(401, reason))).status).toBe(400);
      }
      expect(first((b) => b.id === 401).status).toBe(BookingStatus.PendingReview);
    });

    it("accepts a reason of exactly 500 characters", async () => {
      await settle(repo.cancelBooking(401, "x".repeat(500)));

      expect(first((b) => b.id === 401).status).toBe(BookingStatus.Cancelled);
    });

    it("answers 409 when the booking isn't pending or confirmed", async () => {
      const error = await failure(repo.cancelBooking(406, "Too late")); // completed

      expect(error.status).toBe(409);
      expect(error.message).toBe("This action isn’t allowed for the booking’s current status.");
    });

    it("answers 409 once the booking has ended", async () => {
      first((b) => b.id === 402).startAt = "2026-11-13T10:00:00"; // ended, not yet auto-completed

      const error = await failure(repo.cancelBooking(402, "Too late"));

      expect(error.status).toBe(409);
      expect(error.message).toBe("This booking has already ended.");
    });

    it("answers 404 for a booking that doesn't exist", async () => {
      expect((await failure(repo.cancelBooking(999999, "Why"))).status).toBe(404);
    });

    it("can't cancel the same booking twice", async () => {
      await settle(repo.cancelBooking(401, "First"));

      expect((await failure(repo.cancelBooking(401, "Second"))).status).toBe(409);
    });
  });

  describe("markRefunded", () => {
    /** A cancelled booking with a refund still owed. */
    const owed = async () => {
      await settle(repo.cancelBooking(401, "Branch closed"));
      return first((b) => b.id === 401);
    };

    it("records the refund as sent without changing the booking's status", async () => {
      const booking = await owed();
      expect(booking.refund!.status).toBe(RefundStatus.Waiting);

      const res = await settle(repo.markRefunded(401));

      expect(res).toMatchObject({
        status: true,
        message: "Booking Updated Successfully",
        data: null,
      });
      expect(booking.refund!.status).toBe(RefundStatus.Sent);
      expect(booking.status).toBe(BookingStatus.Cancelled);
      expect((await settle(repo.getBookingById(401))).data!.actions.canMarkRefunded).toBe(false);
    });

    it("moves the booking out of the refund-waiting counter", async () => {
      await owed();
      const before = (await page()).meta!.additionalData!["refundWaitingCount"] as number;

      await settle(repo.markRefunded(401));

      expect((await page()).meta!.additionalData!["refundWaitingCount"]).toBe(before - 1);
    });

    it("works for a missed booking and an expired one", async () => {
      await settle(repo.markNoShow(403));
      await settle(repo.markRefunded(403));
      expect(first((b) => b.id === 403).refund!.status).toBe(RefundStatus.Sent);

      const expired = db.bookings.find(
        (b) => b.status === BookingStatus.Expired && b.refund?.status === RefundStatus.Waiting,
      );
      if (expired) {
        await settle(repo.markRefunded(expired.id));
        expect(expired.refund!.status).toBe(RefundStatus.Sent);
      }
    });

    it("answers 409 'already marked' the second time", async () => {
      await owed();
      await settle(repo.markRefunded(401));

      const error = await failure(repo.markRefunded(401));

      expect(error.status).toBe(409);
      expect(error.message).toBe("This booking’s refund is already marked as paid.");
    });

    it("answers 409 for a booking whose status has no refund", async () => {
      for (const id of [401, 402, 406]) {
        const error = await failure(repo.markRefunded(id)); // pending, confirmed, completed
        expect(error.status).toBe(409);
        expect(error.message).toBe("This action isn’t allowed for the booking’s current status.");
      }
    });

    it("answers 404 for a booking that doesn't exist", async () => {
      expect((await failure(repo.markRefunded(999999))).status).toBe(404);
    });
  });

  describe("details carry the ids Change barber needs", () => {
    it("gives branch.id, barber.id and chair.id, and canReassign", async () => {
      const b = first((x) => x.id === 402);

      const d = (await settle(repo.getBookingById(402))).data!;

      expect(d.branch.id).toBe(b.branchId);
      expect(d.barber.id).toBe(b.barberId);
      expect(d.chair?.id).toBe(b.chairId);
      expect(d.actions.canReassign).toBe(true);
    });

    it("canReassign follows the same rule as canCancel: open and not ended", async () => {
      const completed = (await settle(repo.getBookingById(406))).data!;
      expect(completed.actions).toMatchObject({ canCancel: false, canReassign: false });

      first((b) => b.id === 402).startAt = "2026-11-13T10:00:00"; // ended, not yet auto-completed
      const ended = (await settle(repo.getBookingById(402))).data!;
      expect(ended.actions).toMatchObject({ canCancel: false, canReassign: false });
    });

    it("a Home booking has no chair id", async () => {
      const home = db.bookings.find((b) => b.chairId === null);
      if (!home) return;

      expect((await settle(repo.getBookingById(home.id))).data!.chair).toBeNull();
    });
  });

  describe("markNoShow", () => {
    it("marks a started, Confirmed booking as missed: the price minus the fee is owed", async () => {
      const total = bookingTotal(first((b) => b.id === 403));

      const res = await settle(repo.markNoShow(403));

      expect(res).toMatchObject({ status: true, data: null });
      const stored = first((b) => b.id === 403);
      expect(stored.status).toBe(BookingStatus.NoShow);
      const fee = Math.round(total * 20) / 100;
      expect(stored.refund).toEqual({
        status: RefundStatus.Waiting,
        amount: Math.round((total - fee) * 100) / 100,
        feeAmount: fee,
      });
      const d = (await settle(repo.getBookingById(403))).data!;
      expect(d.actions).toMatchObject({ canComplete: false, canMarkRefunded: true });
    });

    it("answers 409 before the start time — and changes nothing", async () => {
      const error = await failure(repo.markNoShow(402));

      expect(error.status).toBe(409);
      expect(error.message).toBe("This booking hasn’t started yet.");
      expect(first((b) => b.id === 402).status).toBe(BookingStatus.Confirmed);
    });

    it("answers 409 when the booking isn't Confirmed", async () => {
      for (const id of [401, 406]) {
        expect((await failure(repo.markNoShow(id))).status).toBe(409);
      }
    });

    it("answers 404 for a booking that doesn't exist", async () => {
      expect((await failure(repo.markNoShow(999999))).status).toBe(404);
    });
  });

  describe("reassignBarber", () => {
    /** A free, active barber of the booking's branch, present today. */
    function freeBarber(branchId: number, over: Record<string, unknown> = {}) {
      const barber = {
        ...db.barbers[0],
        id: 9001,
        fullName: "Test Barber",
        branchId,
        isActive: true,
        ...over,
      };
      db.barbers.push(barber);
      db.barberAttendance[barber.id] = { date: TODAY, isPresent: true };
      return barber;
    }

    it("moves a pending booking to a free barber of its branch (nothing else changes)", async () => {
      const booking = first((b) => b.id === 401);
      const { startAt, chairId } = booking;
      const barber = freeBarber(booking.branchId);

      const res = await settle(repo.reassignBarber(401, barber.id));

      expect(res).toMatchObject({
        status: true,
        message: "Booking Updated Successfully",
        data: null,
      });
      expect(booking.barberId).toBe(barber.id);
      expect(booking.status).toBe(BookingStatus.PendingReview);
      expect(booking.startAt).toBe(startAt);
      expect(booking.chairId).toBe(chairId);
      expect((await settle(repo.getBookingById(401))).data!.barber.fullName).toBe("Test Barber");
    });

    it("answers 200 without changes for the barber it already has", async () => {
      const booking = first((b) => b.id === 401);
      const before = booking.barberId;

      await settle(repo.reassignBarber(401, before));

      expect(booking.barberId).toBe(before);
    });

    it("answers 400 for a barber that doesn't exist or works in another branch", async () => {
      const booking = first((b) => b.id === 401);
      const other = db.barbers.find((b) => b.branchId !== booking.branchId)!;

      expect((await failure(repo.reassignBarber(401, 999999))).status).toBe(400);
      expect((await failure(repo.reassignBarber(401, other.id))).status).toBe(400);
    });

    it("answers 409 for an inactive barber, one absent today, or one busy at that time", async () => {
      const booking = first((b) => b.id === 402); // today
      const inactive = freeBarber(booking.branchId, { id: 9002, isActive: false });
      const absent = freeBarber(booking.branchId, { id: 9003 });
      db.barberAttendance[absent.id] = { date: TODAY, isPresent: false };
      const busy = freeBarber(booking.branchId, { id: 9004 });
      const other = first((b) => b.id !== booking.id && b.status === BookingStatus.Confirmed);
      other.barberId = busy.id;
      other.startAt = booking.startAt;

      for (const id of [inactive.id, absent.id, busy.id]) {
        const error = await failure(repo.reassignBarber(402, id));
        expect(error.status).toBe(409);
        expect(error.message).toBe(
          "This barber isn’t available at this time. Please choose another barber or time.",
        );
      }
    });

    it("answers 409 when the booking isn't pending or confirmed, or has ended", async () => {
      const booking = first((b) => b.id === 401);
      const barber = freeBarber(booking.branchId);

      expect((await failure(repo.reassignBarber(406, barber.id))).status).toBe(409); // completed

      first((b) => b.id === 402).startAt = "2026-11-13T10:00:00"; // ended
      const error = await failure(
        repo.reassignBarber(402, freeBarber(first((b) => b.id === 402).branchId, { id: 9005 }).id),
      );
      expect(error.message).toBe("This booking has already ended.");
    });

    it("answers 404 for a booking that doesn't exist", async () => {
      expect((await failure(repo.reassignBarber(999999, db.barbers[0].id))).status).toBe(404);
    });

    it("frees the old barber: their open-booking count drops", async () => {
      const booking = first((b) => b.id === 401);
      const old = booking.barberId;
      const before = db.upcomingBookingsCount(old, NOW);

      await settle(repo.reassignBarber(401, freeBarber(booking.branchId).id));

      expect(db.upcomingBookingsCount(old, NOW)).toBe(before - 1);
    });
  });

  describe("customerId", () => {
    /** The customer of booking 401 also has a completed booking in ANOTHER branch. */
    const withBookingElsewhere = () => {
      const base = first((b) => b.id === 401);
      db.bookings.push({
        ...base,
        id: 9501,
        bookingNumber: "OD-009501",
        branchId: 2,
        status: BookingStatus.Completed,
        startAt: "2026-11-12T10:00:00",
        approvedAt: base.submittedAt,
      });
      return base.customerId;
    };

    it("lists only that customer's bookings, across branches, with counters narrowed to them", async () => {
      const customerId = withBookingElsewhere();
      const mine = db.bookings.filter((b) => b.customerId === customerId);

      const res = await settle(repo.getBookings({ pageNumber: 1, pageSize: 100, customerId }));

      expect(mine).toHaveLength(2); // one in each branch
      expect(res.data!.map((b) => b.bookingNumber).sort()).toEqual(
        mine.map((b) => b.bookingNumber).sort(),
      );
      expect(res.meta!.totalCount).toBe(2);
      expect(res.meta!.additionalData).toEqual({
        todayCount: mine.filter((b) => b.startAt.startsWith(TODAY)).length,
        refundWaitingCount: 0,
      });
    });

    it("leaves other customers out", async () => {
      const customerId = withBookingElsewhere();

      const res = await settle(repo.getBookings({ pageNumber: 1, pageSize: 100, customerId }));

      expect(res.data!.every((b) => b.customer.fullName === "Ahmed Hassan")).toBe(true);
      expect(res.data!.length).toBeLessThan(db.bookings.length);
    });

    it("combines with the other filters", async () => {
      const customerId = withBookingElsewhere();

      const completed = await settle(
        repo.getBookings({
          pageNumber: 1,
          pageSize: 100,
          customerId,
          statuses: [BookingStatus.Completed],
        }),
      );
      const inBranch2 = await settle(
        repo.getBookings({ pageNumber: 1, pageSize: 100, customerId, branchId: 2 }),
      );

      expect(completed.data!.map((b) => b.bookingNumber)).toEqual(["OD-009501"]);
      expect(inBranch2.data!.map((b) => b.bookingNumber)).toEqual(["OD-009501"]);
    });
  });

  describe("time moves on", () => {
    it("expires an unreviewed booking at its start time and lists its refund", async () => {
      vi.setSystemTime(new Date(NOW.getTime() + 120 * 60_000)); // 14:00 — #401 started at 13:30

      const d = (await settle(repo.getBookingById(401))).data!;

      expect(d.status).toBe(BookingStatus.Expired);
      expect(d.refund).toEqual({
        status: RefundStatus.Waiting,
        amount: d.payment.totalPrice,
        feeAmount: null,
      });
      expect(d.actions.canMarkRefunded).toBe(true);
    });

    it("completes an open Confirmed booking 2 hours after it ends", async () => {
      vi.setSystemTime(new Date(NOW.getTime() + 3 * 60 * 60_000)); // 15:00 — #403 ended 12:20

      expect((await settle(repo.getBookingById(403))).data!.status).toBe(BookingStatus.Completed);
    });
  });
});
