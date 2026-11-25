import { TestBed } from "@angular/core/testing";
import { Observable, Subject, of, throwError } from "rxjs";
import { beforeEach, describe, expect, it } from "vitest";

import { ApiResponse, PaginationMeta } from "@shared/model/api_response.model";
import { BARBER_REPOSITORY } from "../../barbers/repository/barber.repository";
import { BranchesService } from "../../branches/service/branches.service";
import {
  BookingListItem,
  BookingStatus,
  BookingTab,
  BookingType,
  BookingsQuery,
  PaymentMethod,
  RefundStatus,
} from "../model/booking.model";
import { BOOKING_REPOSITORY } from "../repository/booking.repository";
import { BOOKINGS_PAGE_SIZE, BookingsService } from "./bookings.service";

function item(id: number): BookingListItem {
  return {
    id,
    bookingNumber: `OD-${String(id).padStart(6, "0")}`,
    startAt: "2026-11-13T19:00:00",
    customer: { fullName: `Customer ${id}`, phoneNumber: "+201001234567" },
    items: [{ nameAr: "قص شعر", nameEn: "Haircut" }],
    barber: { fullName: "Karim Adel" },
    type: BookingType.Regular,
    status: BookingStatus.Confirmed,
    isInProgress: false,
    payment: { method: PaymentMethod.InstaPay, totalPrice: 200 },
    refund: null,
  };
}

function meta(over: Partial<PaginationMeta> = {}): PaginationMeta {
  return {
    currentPage: 1,
    pageSize: BOOKINGS_PAGE_SIZE,
    totalPages: 1,
    totalCount: 0,
    hasPreviousPage: false,
    hasNextPage: false,
    additionalData: { todayCount: 13, refundWaitingCount: 6 },
    ...over,
  };
}

function ok(data: BookingListItem[], m: PaginationMeta = meta({ totalCount: data.length })) {
  return { status: true, statusCode: 200, message: "ok", errors: null, meta: m, data };
}

class FakeBookingRepo {
  queries: BookingsQuery[] = [];
  respond: (q: BookingsQuery) => Observable<ApiResponse<BookingListItem[]>> = () =>
    of(ok([item(1), item(2)]));
  getBookings(q: BookingsQuery) {
    this.queries.push(structuredClone(q));
    return this.respond(q);
  }
  get last(): BookingsQuery {
    return this.queries[this.queries.length - 1];
  }
}

class FakeBarberRepo {
  asked: number[] = [];
  byBranch: Record<number, string[]> = { 1: ["Ali", "Omar"], 2: ["Sara"] };
  respond?: (branchId: number) => Observable<unknown>;
  getBarbers(q: { branchId?: number }) {
    this.asked.push(q.branchId!);
    if (this.respond) return this.respond(q.branchId!);
    return of({
      status: true,
      data: (this.byBranch[q.branchId!] ?? []).map((fullName, i) => ({
        id: q.branchId! * 10 + i,
        fullName,
      })),
    });
  }
}

describe("BookingsService", () => {
  let bookings: FakeBookingRepo;
  let barbers: FakeBarberRepo;
  let branchList: Array<{ id: number; nameAr: string; nameEn: string }>;
  let service: BookingsService;

  const settle = () => Promise.resolve();

  beforeEach(() => {
    bookings = new FakeBookingRepo();
    barbers = new FakeBarberRepo();
    // The Branches API lists newest first.
    branchList = [
      { id: 2, nameAr: "ب", nameEn: "B" },
      { id: 1, nameAr: "أ", nameEn: "A" },
    ];
    TestBed.configureTestingModule({
      providers: [
        { provide: BOOKING_REPOSITORY, useValue: bookings },
        { provide: BARBER_REPOSITORY, useValue: barbers },
        { provide: BranchesService, useValue: { loadOptions: () => of(branchList) } },
      ],
    });
    service = TestBed.inject(BookingsService);
  });

  describe("initialize", () => {
    it("lists the branches oldest first and opens the first one", () => {
      service.initialize();

      expect(service.branches().map((b) => b.id)).toEqual([1, 2]);
      expect(service.branchId()).toBe(1);
      expect(bookings.last).toMatchObject({
        branchId: 1,
        pageNumber: 1,
        pageSize: BOOKINGS_PAGE_SIZE,
        tab: BookingTab.All,
      });
    });

    it("loads the rows, the paging and the counters", () => {
      service.initialize();

      expect(service.bookings().map((b) => b.id)).toEqual([1, 2]);
      expect(service.totalCount()).toBe(2);
      expect(service.counters()).toEqual({ todayCount: 13, refundWaitingCount: 6 });
      expect(service.loading()).toBe(false);
      expect(service.hasError()).toBe(false);
    });

    it("loads the barbers of the opened branch for the barber filter", () => {
      service.initialize();

      expect(barbers.asked).toEqual([1]);
      expect(service.barbers().map((b) => b.fullName)).toEqual(["Ali", "Omar"]);
    });

    it("has no counters until the first response (never a misleading 0)", () => {
      const hold = new Subject<ApiResponse<BookingListItem[]>>();
      bookings.respond = () => hold;

      service.initialize();

      expect(service.counters()).toBeNull();
      expect(service.loading()).toBe(true);
    });

    it("reports 'no branches' and loads nothing when there is none", () => {
      branchList = [];

      service.initialize();

      expect(service.noBranches()).toBe(true);
      expect(service.branchId()).toBeNull();
      expect(bookings.queries).toEqual([]);
      expect(service.loading()).toBe(false);
    });

    it("keeps the selected branch when the page is opened again", () => {
      service.initialize();
      service.selectBranch(2);
      bookings.queries = [];

      service.initialize();

      expect(service.branchId()).toBe(2);
      expect(bookings.last.branchId).toBe(2);
    });

    it("starts clean every time it opens: tab, search, filters and page are reset", () => {
      service.initialize();
      service.setFilters({
        tab: BookingTab.Past,
        barberId: 11,
        type: BookingType.Vip,
        statuses: [BookingStatus.Cancelled],
        dateFrom: "2026-11-01",
        dateTo: "2026-11-30",
        refundStatus: RefundStatus.Waiting,
        search: "ahmed",
      });
      service.setPage(3);
      bookings.queries = [];

      service.initialize();

      expect(bookings.last).toEqual({
        branchId: 1,
        pageNumber: 1,
        pageSize: BOOKINGS_PAGE_SIZE,
        tab: BookingTab.All,
      });
      expect(service.query()).toEqual({
        pageNumber: 1,
        pageSize: BOOKINGS_PAGE_SIZE,
        tab: BookingTab.All,
      });
      expect(service.tab()).toBe(BookingTab.All);
    });

    it("drops rows loaded under old filters so they don't show under the cleared widgets", () => {
      service.initialize();
      service.setFilters({ type: BookingType.Vip });
      expect(service.bookings()).toHaveLength(2);
      bookings.respond = () => new Subject<ApiResponse<BookingListItem[]>>();

      service.initialize();

      expect(service.bookings()).toEqual([]);
      expect(service.loading()).toBe(true);
    });

    it("keeps an unfiltered list on screen while it refreshes (no flash of emptiness)", () => {
      service.initialize();
      bookings.respond = () => new Subject<ApiResponse<BookingListItem[]>>();

      service.initialize();

      expect(service.bookings()).toHaveLength(2);
      expect(service.loading()).toBe(true);
    });

    it("keeps the branch's counters (they don't depend on the filters)", () => {
      service.initialize();
      service.setFilters({ type: BookingType.Vip });
      bookings.respond = () => new Subject<ApiResponse<BookingListItem[]>>();

      service.initialize();

      expect(service.counters()).toEqual({ todayCount: 13, refundWaitingCount: 6 });
    });
  });

  describe("filters", () => {
    beforeEach(() => service.initialize());

    it("sends every filter with the branch and goes back to page 1", () => {
      service.setPage(3);
      service.setFilters({
        tab: BookingTab.Upcoming,
        barberId: 11,
        type: BookingType.Home,
        statuses: [BookingStatus.Confirmed],
        dateFrom: "2026-11-01",
        dateTo: "2026-11-30",
        refundStatus: RefundStatus.Waiting,
        search: "ahmed",
      });

      expect(bookings.last).toEqual({
        branchId: 1,
        pageNumber: 1,
        pageSize: BOOKINGS_PAGE_SIZE,
        tab: BookingTab.Upcoming,
        barberId: 11,
        type: BookingType.Home,
        statuses: [BookingStatus.Confirmed],
        dateFrom: "2026-11-01",
        dateTo: "2026-11-30",
        refundStatus: RefundStatus.Waiting,
        search: "ahmed",
      });
      expect(service.tab()).toBe(BookingTab.Upcoming);
    });

    it("keeps the other filters when one changes, and clears one with undefined", () => {
      service.setFilters({ type: BookingType.Vip, search: "x" });
      service.setFilters({ barberId: 11 });
      expect(bookings.last).toMatchObject({ type: BookingType.Vip, search: "x", barberId: 11 });

      service.setFilters({ type: undefined });
      expect(bookings.last.type).toBeUndefined();
      expect(bookings.last).toMatchObject({ search: "x", barberId: 11 });
    });

    it("sends a zero-valued filter (refund Waiting = 0) — it is a value, not 'unset'", () => {
      service.setFilters({ refundStatus: RefundStatus.Waiting });

      expect(bookings.last.refundStatus).toBe(0);
    });

    it("changes tab through setTab", () => {
      service.setTab(BookingTab.Past);

      expect(bookings.last.tab).toBe(BookingTab.Past);
      expect(bookings.last.pageNumber).toBe(1);
    });

    it("moves to another page without touching the filters", () => {
      service.setFilters({ type: BookingType.Vip });
      service.setPage(2);

      expect(bookings.last).toMatchObject({ pageNumber: 2, type: BookingType.Vip });
    });

    it("clears every filter at once: tab All, page 1, nothing else", () => {
      service.setFilters({
        tab: BookingTab.Past,
        type: BookingType.Vip,
        search: "x",
        dateFrom: "2026-11-01",
      });
      service.setPage(2);

      service.clearFilters();

      expect(bookings.last).toEqual({
        branchId: 1,
        pageNumber: 1,
        pageSize: BOOKINGS_PAGE_SIZE,
        tab: BookingTab.All,
      });
    });

    it("keeps the counters while the user filters (they don't depend on the filters)", () => {
      bookings.respond = () =>
        of(
          ok(
            [item(1)],
            meta({ totalCount: 1, additionalData: { todayCount: 13, refundWaitingCount: 6 } }),
          ),
        );

      service.setFilters({ search: "x" });

      expect(service.counters()).toEqual({ todayCount: 13, refundWaitingCount: 6 });
    });
  });

  describe("one customer's bookings (customerId)", () => {
    it("lists that customer's bookings in every branch: no branchId is sent", () => {
      service.initialize(1203);

      expect(bookings.last).toMatchObject({ customerId: 1203, tab: BookingTab.All, pageNumber: 1 });
      expect(bookings.last.branchId).toBeUndefined();
      expect(service.customerId()).toBe(1203);
    });

    it("still loads the branches and the first branch's barbers in the background", () => {
      service.initialize(1203);

      expect(service.branches().map((b) => b.id)).toEqual([1, 2]);
      expect(service.branchId()).toBe(1);
      expect(barbers.asked).toEqual([1]);
    });

    it("lists the customer's bookings even when there is no branch at all", () => {
      branchList = [];

      service.initialize(1203);

      expect(bookings.last).toMatchObject({ customerId: 1203 });
      expect(service.noBranches()).toBe(false);
      expect(service.bookings().length).toBeGreaterThan(0);
    });

    it("keeps the customer when the other filters are cleared", () => {
      service.initialize(1203);
      service.setTab(BookingTab.Past);

      service.clearFilters();

      expect(bookings.last).toMatchObject({ customerId: 1203, tab: BookingTab.All, pageNumber: 1 });
    });

    it("clearCustomer goes back to the selected branch's list from page 1", () => {
      service.initialize(1203);

      service.clearCustomer();

      expect(service.customerId()).toBeUndefined();
      expect(bookings.last).toMatchObject({ branchId: 1, pageNumber: 1 });
      expect(bookings.last.customerId).toBeUndefined();
    });

    it("opening the page again without a customer forgets the previous one", () => {
      service.initialize(1203);

      service.initialize();

      expect(service.customerId()).toBeUndefined();
      expect(bookings.last).toMatchObject({ branchId: 1 });
    });
  });

  describe("selectBranch", () => {
    beforeEach(() => service.initialize());

    it("shows the other branch's bookings and barbers, and drops the old rows and counters at once", () => {
      const hold = new Subject<ApiResponse<BookingListItem[]>>();
      bookings.respond = () => hold;

      service.selectBranch(2);

      expect(service.branchId()).toBe(2);
      expect(service.bookings()).toEqual([]);
      expect(service.counters()).toBeNull();
      expect(bookings.last.branchId).toBe(2);
      expect(barbers.asked).toEqual([1, 2]);
      expect(service.barbers().map((b) => b.fullName)).toEqual(["Sara"]);
    });

    it("clears the barber filter (that barber belongs to the branch that was left) but keeps the rest", () => {
      service.setFilters({ barberId: 10, type: BookingType.Vip, tab: BookingTab.Past });

      service.selectBranch(2);

      expect(bookings.last.barberId).toBeUndefined();
      expect(bookings.last).toMatchObject({
        type: BookingType.Vip,
        tab: BookingTab.Past,
        pageNumber: 1,
      });
    });

    it("does nothing for the branch that is already selected", () => {
      const before = bookings.queries.length;

      service.selectBranch(1);

      expect(bookings.queries).toHaveLength(before);
    });

    it("ignores a barber list that arrives after the user moved on", () => {
      const slow = new Subject<unknown>();
      barbers.respond = (branchId) => (branchId === 2 ? slow : of({ status: true, data: [] }));

      service.selectBranch(2); // slow
      service.selectBranch(1); // back
      slow.next({ status: true, data: [{ id: 99, fullName: "Late" }] });

      expect(service.barbers()).toEqual([]);
    });
  });

  describe("stale responses and errors", () => {
    beforeEach(() => service.initialize());

    it("lets only the latest request write the rows", async () => {
      const first = new Subject<ApiResponse<BookingListItem[]>>();
      const second = new Subject<ApiResponse<BookingListItem[]>>();
      const subjects = [first, second];
      bookings.respond = () => subjects.shift()!;

      service.setFilters({ search: "a" });
      service.setFilters({ search: "ab" });
      second.next(ok([item(20)]));
      second.complete();
      first.next(ok([item(10)])); // too late
      await settle();

      expect(service.bookings().map((b) => b.id)).toEqual([20]);
      expect(service.loading()).toBe(false);
    });

    it("keeps the loading flag on while the newest request is still running", () => {
      const first = new Subject<ApiResponse<BookingListItem[]>>();
      const second = new Subject<ApiResponse<BookingListItem[]>>();
      const subjects = [first, second];
      bookings.respond = () => subjects.shift()!;

      service.setFilters({ search: "a" });
      service.setFilters({ search: "ab" });
      first.complete(); // the cancelled one finishing must not clear 'loading'

      expect(service.loading()).toBe(true);
    });

    it("keeps the previous rows and flags the error when a reload fails", () => {
      bookings.respond = () => throwError(() => ({ status: 500 }));

      service.setFilters({ search: "x" });

      expect(service.hasError()).toBe(true);
      expect(service.bookings().map((b) => b.id)).toEqual([1, 2]);
      expect(service.loading()).toBe(false);
    });

    it("treats a status:false envelope as a failure", () => {
      bookings.respond = () => of({ ...ok([]), status: false, message: "nope" });

      service.load();

      expect(service.hasError()).toBe(true);
      expect(service.bookings().map((b) => b.id)).toEqual([1, 2]);
    });

    it("clears the error on the next successful load", () => {
      bookings.respond = () => throwError(() => ({ status: 500 }));
      service.load();
      expect(service.hasError()).toBe(true);

      bookings.respond = () => of(ok([item(5)]));
      service.load();

      expect(service.hasError()).toBe(false);
      expect(service.bookings().map((b) => b.id)).toEqual([5]);
    });

    it("loads nothing before a branch is selected", () => {
      const fresh = TestBed.runInInjectionContext(() => new BookingsService());
      fresh.load();

      expect(fresh.loading()).toBe(false);
    });
  });
});
