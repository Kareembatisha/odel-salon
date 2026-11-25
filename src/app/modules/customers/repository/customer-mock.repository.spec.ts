import { TestBed } from "@angular/core/testing";
import { Observable, firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockDb } from "@core/mock/mock-db";
import { BookingStatus } from "../../bookings/model/booking.model";
import { CustomerListItem, CustomerTab } from "../model/customer.model";
import { CustomerMockRepository } from "./customer-mock.repository";

// 12:00 in Cairo (UTC+2 in November): every relative seed offset stays inside this one day.
const NOW = new Date("2026-11-13T10:00:00Z");

describe("CustomerMockRepository", () => {
  let repo: CustomerMockRepository;
  let db: MockDb;

  /** Resolves a mock response past its simulated latency. */
  async function settle<T>(obs: Observable<T>): Promise<T> {
    const result = firstValueFrom(obs);
    result.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1000);
    return result;
  }

  const list = (q: Partial<Parameters<CustomerMockRepository["getCustomers"]>[0]> = {}) =>
    settle(repo.getCustomers({ pageNumber: 1, pageSize: 100, ...q }));
  const names = (rows: CustomerListItem[] | null) => rows!.map((c) => c.fullName);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    repo = TestBed.inject(CustomerMockRepository);
    db = TestBed.inject(MockDb);
  });

  afterEach(() => vi.useRealTimers());

  describe("getCustomers", () => {
    it("lists every customer when no branch is given, with the count of every tab", async () => {
      const res = await list();

      expect(res.status).toBe(true);
      expect(res.data).toHaveLength(db.customers.length);
      expect(res.meta).toMatchObject({ totalCount: db.customers.length, currentPage: 1 });
      const counters = res.meta!.additionalData!;
      expect(counters["allCount"]).toBe(db.customers.length);
      expect(counters["hasMissedBookingsCount"]).toBe(
        res.data!.filter((c) => c.missedCount > 0).length,
      );
    });

    it("lists the newest booking first, and the customers who never booked last", async () => {
      const rows = (await list()).data!;
      const neverBooked = rows.filter((c) => c.visitsCount === 0 && c.lastVisitDate === null);

      expect(names(rows.slice(-2))).toEqual(["Mostafa Gamal", "Salma Adel"]);
      expect(neverBooked.map((c) => c.fullName)).toEqual(
        expect.arrayContaining(["Mostafa Gamal", "Salma Adel"]),
      );
      // The first customer holds the latest booking of all.
      const latest = [...db.bookings].sort((a, b) => b.startAt.localeCompare(a.startAt))[0];
      expect(rows[0].id).toBe(latest.customerId);
    });

    it("counts visits as completed bookings and missed as no-shows", async () => {
      const rows = (await list()).data!;

      for (const c of rows) {
        const mine = db.bookings.filter((b) => b.customerId === c.id);
        expect(c.visitsCount).toBe(mine.filter((b) => b.status === BookingStatus.Completed).length);
        expect(c.missedCount).toBe(mine.filter((b) => b.status === BookingStatus.NoShow).length);
      }
    });

    it("gives the salon date of the latest completed booking as lastVisitDate (null if none)", async () => {
      const rows = (await list()).data!;

      for (const c of rows) {
        const days = db.bookings
          .filter((b) => b.customerId === c.id && b.status === BookingStatus.Completed)
          .map((b) => b.startAt.slice(0, 10))
          .sort();
        expect(c.lastVisitDate).toBe(days.length ? days[days.length - 1] : null);
      }
    });

    it("with a branch, lists only the customers who booked there and counts that branch only", async () => {
      const res = await list({ branchId: 1 });
      const inBranch = db.bookings.filter((b) => b.branchId === 1);
      const ids = new Set(inBranch.map((b) => b.customerId));

      expect(res.data!.map((c) => c.id).sort()).toEqual([...ids].sort());
      expect(res.meta!.additionalData!["allCount"]).toBe(ids.size);
      for (const c of res.data!) {
        expect(c.visitsCount).toBe(
          inBranch.filter((b) => b.customerId === c.id && b.status === BookingStatus.Completed)
            .length,
        );
      }
    });

    it("searches the name (case-insensitive) or the phone — and the tab counts ignore it", async () => {
      const all = await list();
      const byName = await list({ search: "ahmed hassan" });
      const byPhone = await list({ search: "01001234567" });

      expect(names(byName.data)).toEqual(["Ahmed Hassan"]);
      expect(names(byPhone.data)).toEqual(["Ahmed Hassan"]);
      expect(byName.meta!.totalCount).toBe(1);
      expect(byName.meta!.additionalData).toEqual(all.meta!.additionalData);
    });

    it("answers an empty page for a search nobody matches", async () => {
      const res = await list({ search: "nobody-by-this-name" });

      expect(res.data).toEqual([]);
      expect(res.meta).toMatchObject({ totalCount: 0, totalPages: 1, hasNextPage: false });
    });

    it("'Has missed bookings' lists the customers with a no-show", async () => {
      const res = await list({ tab: CustomerTab.HasMissedBookings });

      expect(res.data!.length).toBeGreaterThan(0);
      expect(res.data!.every((c) => c.missedCount > 0)).toBe(true);
      expect(res.meta!.additionalData!["hasMissedBookingsCount"]).toBe(res.data!.length);
    });

    it("'Visited this month' lists the customers with a completed visit in the current month", async () => {
      const res = await list({ tab: CustomerTab.VisitedThisMonth });

      expect(res.data!.length).toBeGreaterThan(0);
      expect(res.data!.every((c) => c.lastVisitDate!.startsWith("2026-11"))).toBe(true);
      expect(res.meta!.additionalData!["visitedThisMonthCount"]).toBe(res.data!.length);
    });

    it("'Not back in 60 days' lists customers whose last visit was more than 60 days ago", async () => {
      expect((await list({ tab: CustomerTab.NotBackIn60Days })).data).toEqual([]);

      // Move every booking of one customer to August: their last visit is now 105 days old.
      const customerId = db.bookings.find((b) => b.status === BookingStatus.Completed)!.customerId;
      for (const b of db.bookings.filter((x) => x.customerId === customerId)) {
        b.startAt = "2026-08-01T10:00:00";
      }

      const res = await list({ tab: CustomerTab.NotBackIn60Days });

      expect(res.data!.map((c) => c.id)).toEqual([customerId]);
      expect(res.meta!.additionalData!["notBackIn60DaysCount"]).toBe(1);
    });

    it("pages the list", async () => {
      const res = await list({ pageSize: 5, pageNumber: 2 });

      expect(res.data).toHaveLength(5);
      expect(res.meta).toMatchObject({
        currentPage: 2,
        pageSize: 5,
        totalCount: db.customers.length,
        totalPages: Math.ceil(db.customers.length / 5),
        hasPreviousPage: true,
        hasNextPage: true,
      });
    });
  });

  describe("getCustomerById", () => {
    const profile = async (id: number) => (await settle(repo.getCustomerById(id))).data!;

    it("returns the customer, covering ALL branches", async () => {
      const c = db.customers[0];
      const mine = db.bookings.filter((b) => b.customerId === c.id);

      const p = await profile(c.id);

      expect(p).toMatchObject({
        id: c.id,
        fullName: c.fullName,
        countryCode: "+20",
        phoneNumber: c.phoneNumber,
        email: c.email,
        imageUrl: null,
        createdAt: c.createdAt,
        bookingsCount: mine.length,
        visitsCount: mine.filter((b) => b.status === BookingStatus.Completed).length,
        missedCount: mine.filter((b) => b.status === BookingStatus.NoShow).length,
      });
    });

    it("lists the latest 5 bookings, newest first", async () => {
      const c = db.customers[0];

      const p = await profile(c.id);

      expect(p.latestBookings.length).toBeLessThanOrEqual(5);
      const starts = p.latestBookings.map((b) => b.startAt);
      expect(starts).toEqual([...starts].sort().reverse());
      expect(p.latestBookings[0]).toMatchObject({
        bookingNumber: expect.stringMatching(/^OD-\d{6}$/),
        barber: { fullName: expect.any(String) },
        branch: { nameAr: expect.any(String), nameEn: expect.any(String) },
        totalPrice: expect.any(Number),
      });
    });

    it("says who cancelled a Cancelled booking, and only for those", async () => {
      const cancelled = db.bookings.find((b) => b.status === BookingStatus.Cancelled)!;

      const p = await profile(cancelled.customerId);
      const row = p.latestBookings.find((b) => b.id === cancelled.id);

      if (row) expect(row.cancelledByBranch).toBe(cancelled.cancellation!.cancelledByBranch);
      for (const b of p.latestBookings) {
        if (b.status !== BookingStatus.Cancelled) expect(b.cancelledByBranch).toBeNull();
      }
    });

    it("carries the refund of a Cancelled / Expired / Missed booking and none for the others", async () => {
      for (const c of db.customers) {
        const p = await profile(c.id);
        for (const b of p.latestBookings) {
          const owes = [BookingStatus.Cancelled, BookingStatus.Expired, BookingStatus.NoShow];
          expect(b.refund !== null).toBe(owes.includes(b.status));
        }
      }
    });

    it("gives the date of the latest no-show (null when never missed)", async () => {
      for (const c of db.customers) {
        const p = await profile(c.id);
        const missed = db.bookings
          .filter((b) => b.customerId === c.id && b.status === BookingStatus.NoShow)
          .map((b) => b.startAt.slice(0, 10))
          .sort();
        expect(p.lastMissedDate).toBe(missed.length ? missed[missed.length - 1] : null);
      }
    });

    it("shows a customer without bookings with zeros and no bookings", async () => {
      const never = db.customers.find((c) => c.fullName === "Salma Adel")!;

      const p = await profile(never.id);

      expect(p).toMatchObject({
        visitsCount: 0,
        missedCount: 0,
        bookingsCount: 0,
        latestBookings: [],
      });
      expect(p.lastMissedDate).toBeNull();
    });

    it("answers a status:false 404 body for an unknown id", async () => {
      const res = await settle(repo.getCustomerById(999999));

      expect(res).toMatchObject({ status: false, statusCode: 404, data: null });
    });
  });
});
