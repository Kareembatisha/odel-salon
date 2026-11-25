import { TestBed } from "@angular/core/testing";
import { Observable, Subject, of, throwError } from "rxjs";
import { beforeEach, describe, expect, it } from "vitest";

import { ApiResponse, PaginationMeta } from "@shared/model/api_response.model";
import { BranchesService } from "../../branches/service/branches.service";
import { CustomerListItem, CustomerTab, CustomersQuery } from "../model/customer.model";
import { CUSTOMER_REPOSITORY } from "../repository/customer.repository";
import { CUSTOMERS_PAGE_SIZE, CustomersService } from "./customers.service";

const item = (id: number): CustomerListItem => ({
  id,
  fullName: `Customer ${id}`,
  countryCode: "+20",
  phoneNumber: "+201001234567",
  visitsCount: 3,
  lastVisitDate: "2026-11-12",
  missedCount: 0,
});

const meta = (over: Partial<PaginationMeta> = {}): PaginationMeta => ({
  currentPage: 1,
  pageSize: CUSTOMERS_PAGE_SIZE,
  totalPages: 1,
  totalCount: 2,
  hasPreviousPage: false,
  hasNextPage: false,
  additionalData: {
    allCount: 1240,
    visitedThisMonthCount: 312,
    hasMissedBookingsCount: 47,
    notBackIn60DaysCount: 158,
  },
  ...over,
});

const ok = (data: CustomerListItem[], m: PaginationMeta = meta()) => ({
  status: true,
  statusCode: 200,
  message: "ok",
  errors: null,
  meta: m,
  data,
});

class FakeRepo {
  queries: CustomersQuery[] = [];
  respond: (q: CustomersQuery) => Observable<ApiResponse<CustomerListItem[]>> = () =>
    of(ok([item(1), item(2)]));
  getCustomers(q: CustomersQuery) {
    this.queries.push(structuredClone(q));
    return this.respond(q);
  }
  get last(): CustomersQuery {
    return this.queries[this.queries.length - 1];
  }
}

describe("CustomersService", () => {
  let repo: FakeRepo;
  let branchList: Array<{ id: number; nameAr: string; nameEn: string }>;
  let service: CustomersService;

  beforeEach(() => {
    repo = new FakeRepo();
    // The Branches API lists newest first.
    branchList = [
      { id: 2, nameAr: "ب", nameEn: "B" },
      { id: 1, nameAr: "أ", nameEn: "A" },
    ];
    TestBed.configureTestingModule({
      providers: [
        { provide: CUSTOMER_REPOSITORY, useValue: repo },
        { provide: BranchesService, useValue: { loadOptions: () => of(branchList) } },
      ],
    });
    service = TestBed.inject(CustomersService);
  });

  describe("initialize", () => {
    it("lists ALL branches' customers on the All tab, page 1 (no branch is sent)", () => {
      service.initialize();

      expect(repo.queries).toHaveLength(1);
      expect(repo.last).toMatchObject({ tab: CustomerTab.All, pageNumber: 1, pageSize: 20 });
      expect(repo.last.branchId).toBeUndefined();
      expect(service.branchId()).toBeNull();
      expect(service.customers().map((c) => c.id)).toEqual([1, 2]);
    });

    it("counts as loading while the branch options are on their way, so the page never shows its empty state first", () => {
      const branches = new Subject<typeof branchList>();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: CUSTOMER_REPOSITORY, useValue: repo },
          { provide: BranchesService, useValue: { loadOptions: () => branches } },
        ],
      });
      const held = TestBed.inject(CustomersService);

      held.initialize();

      // No list request exists yet — but the page is already loading (skeleton), never "empty".
      expect(repo.queries).toHaveLength(0);
      expect(held.loading()).toBe(true);
      expect(held.customers()).toEqual([]);

      branches.next(branchList);
      branches.complete();

      expect(repo.queries).toHaveLength(1);
      expect(held.loading()).toBe(false);
      expect(held.customers().length).toBeGreaterThan(0);
    });

    it("lists the branches oldest first", () => {
      service.initialize();

      expect(service.branches().map((b) => b.id)).toEqual([1, 2]);
    });

    it("loads the branches only once", () => {
      let calls = 0;
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: CUSTOMER_REPOSITORY, useValue: repo },
          { provide: BranchesService, useValue: { loadOptions: () => (calls++, of(branchList)) } },
        ],
      });
      service = TestBed.inject(CustomersService);

      service.initialize();
      service.initialize();

      expect(calls).toBe(1);
    });

    it("resets the tab, search and page on every visit but keeps the selected branch", () => {
      service.initialize();
      service.selectBranch(2);
      service.setTab(CustomerTab.HasMissedBookings);
      service.setSearch("ahmed");

      service.initialize();

      expect(repo.last).toMatchObject({ tab: CustomerTab.All, pageNumber: 1, branchId: 2 });
      expect(repo.last.search).toBeUndefined();
    });

    it("falls back to all branches when the selected one is gone", () => {
      service.initialize();
      service.selectBranch(2);
      branchList = [{ id: 1, nameAr: "أ", nameEn: "A" }];
      TestBed.inject(CustomersService); // same instance; the options are only re-read once…

      // …so simulate the branch being removed from the list the service already holds.
      (service as unknown as { _branches: { set(v: unknown): void } })._branches.set([
        { id: 1, nameAr: "أ", nameEn: "A" },
      ]);
      service.initialize();

      expect(service.branchId()).toBeNull();
      expect(repo.last.branchId).toBeUndefined();
    });
  });

  describe("counters", () => {
    it("is null before the first response and the count of every tab after", () => {
      expect(service.counters()).toBeNull();

      service.initialize();

      expect(service.counters()).toEqual({
        allCount: 1240,
        visitedThisMonthCount: 312,
        hasMissedBookingsCount: 47,
        notBackIn60DaysCount: 158,
      });
    });
  });

  describe("filters", () => {
    beforeEach(() => service.initialize());

    it("a tab reloads from page 1", () => {
      service.setPage(3);

      service.setTab(CustomerTab.NotBackIn60Days);

      expect(repo.last).toMatchObject({ tab: CustomerTab.NotBackIn60Days, pageNumber: 1 });
      expect(service.tab()).toBe(CustomerTab.NotBackIn60Days);
    });

    it("a search is trimmed, a blank one clears it, and both go back to page 1", () => {
      service.setPage(2);
      service.setSearch("  ahmed  ");
      expect(repo.last).toMatchObject({ search: "ahmed", pageNumber: 1 });

      service.setSearch("   ");
      expect(repo.last.search).toBeUndefined();
    });

    it("a page change reloads that page", () => {
      service.setPage(2);

      expect(repo.last).toMatchObject({ pageNumber: 2 });
    });

    it("clearFilters goes back to the plain list but keeps the branch", () => {
      service.selectBranch(1);
      service.setTab(CustomerTab.HasMissedBookings);
      service.setSearch("x");

      service.clearFilters();

      expect(repo.last).toMatchObject({ tab: CustomerTab.All, pageNumber: 1, branchId: 1 });
      expect(repo.last.search).toBeUndefined();
    });
  });

  describe("selectBranch", () => {
    beforeEach(() => service.initialize());

    it("shows one branch's customers from page 1, and clears the old rows and counts first", () => {
      const hold = new Subject<ApiResponse<CustomerListItem[]>>();
      repo.respond = () => hold;

      service.selectBranch(1);

      expect(repo.last).toMatchObject({ branchId: 1, pageNumber: 1 });
      expect(service.customers()).toEqual([]);
      expect(service.counters()).toBeNull();
    });

    it("null goes back to all branches, and the same branch again does nothing", () => {
      service.selectBranch(1);
      const asked = repo.queries.length;

      service.selectBranch(1);
      expect(repo.queries).toHaveLength(asked);

      service.selectBranch(null);
      expect(repo.last.branchId).toBeUndefined();
    });
  });

  describe("stale responses and errors", () => {
    beforeEach(() => service.initialize());

    it("only the latest response writes the rows", () => {
      const first = new Subject<ApiResponse<CustomerListItem[]>>();
      const second = new Subject<ApiResponse<CustomerListItem[]>>();
      const pending = [first, second];
      repo.respond = () => pending.shift()!;

      service.setSearch("a");
      service.setSearch("ab");
      second.next(ok([item(9)]));
      first.next(ok([item(1)]));

      expect(service.customers().map((c) => c.id)).toEqual([9]);
    });

    it("keeps the previous rows and sets hasError when a reload fails", () => {
      repo.respond = () => throwError(() => ({ status: 500 }));

      service.setTab(CustomerTab.HasMissedBookings);

      expect(service.hasError()).toBe(true);
      expect(service.customers().map((c) => c.id)).toEqual([1, 2]);
      expect(service.loading()).toBe(false);
    });

    it("treats a status:false body as a failure, and a retry clears the error", () => {
      repo.respond = () => of({ ...ok([]), status: false });
      service.load();
      expect(service.hasError()).toBe(true);

      repo.respond = () => of(ok([item(5)]));
      service.load();

      expect(service.hasError()).toBe(false);
      expect(service.customers().map((c) => c.id)).toEqual([5]);
    });
  });
});
