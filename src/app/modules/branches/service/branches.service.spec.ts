import { TestBed } from "@angular/core/testing";
import { Observable, Subject, of, throwError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiResponse } from "@shared/model/api_response.model";
import { NotificationService } from "@core/services/notification.service";
import { BranchDetails, BranchListItem, BranchPayload, BranchesQuery } from "../model/branch.model";
import { BRANCH_REPOSITORY } from "../repository/branch.repository";
import { BranchesService } from "./branches.service";

function branch(id: number): BranchListItem {
  return {
    id,
    nameAr: `فرع ${id}`,
    nameEn: `Branch ${id}`,
    address: "Somewhere",
    phone: "+201001102194",
    allowsRegular: true,
    allowsVip: false,
    allowsHome: false,
    isVisible: true,
    barbersCount: 1,
    regularChairsCount: 1,
    vipChairsCount: 0,
  };
}

function response(
  items: BranchListItem[],
  totalCount = items.length,
  currentPage = 1,
): ApiResponse<BranchListItem[]> {
  return {
    status: true,
    statusCode: 200,
    message: "ok",
    errors: null,
    data: items,
    meta: {
      currentPage,
      pageSize: 12,
      totalPages: Math.max(1, Math.ceil(totalCount / 12)),
      totalCount,
      hasPreviousPage: currentPage > 1,
      hasNextPage: false,
      additionalData: null,
    },
  };
}

function ok<T>(data: T): ApiResponse<T> {
  return { status: true, statusCode: 200, message: "ok", errors: null, meta: null, data };
}

const PAYLOAD: BranchPayload = {
  nameAr: "فرع",
  nameEn: "Branch",
  address: "Somewhere",
  mapUrl: null,
  instaPayAccount: null,
  walletNumber: null,
  phone: "+201001102194",
  allowsRegular: true,
  allowsVip: false,
  allowsHome: false,
  workingHours: [],
};

const DETAILS: BranchDetails = {
  id: 4,
  nameAr: "فرع",
  nameEn: "Branch",
  address: "Somewhere",
  mapUrl: null,
  instaPayAccount: null,
  walletNumber: null,
  phone: "+201001102194",
  allowsRegular: true,
  allowsVip: false,
  allowsHome: false,
  isVisible: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: null,
  workingHours: [],
};

/** Repository double: list calls return a Subject the test resolves by hand; the rest answer from `next`. */
class FakeRepository {
  calls: BranchesQuery[] = [];
  /** What every non-list call answers with (swap for `throwError` to simulate a failure). */
  next: () => Observable<ApiResponse<unknown>> = () => of(ok(null));
  byId = vi.fn((_id: number) => this.next() as Observable<ApiResponse<BranchDetails>>);
  create = vi.fn((_p: BranchPayload) => this.next() as Observable<ApiResponse<number>>);
  update = vi.fn((_id: number, _p: BranchPayload) => this.next() as Observable<ApiResponse<null>>);
  toggle = vi.fn((_id: number) => this.next() as Observable<ApiResponse<null>>);
  remove = vi.fn((_p: { ids: number[] }) => this.next() as Observable<ApiResponse<null>>);
  getBranchById(id: number) {
    return this.byId(id);
  }
  createBranch(p: BranchPayload) {
    return this.create(p);
  }
  updateBranch(id: number, p: BranchPayload) {
    return this.update(id, p);
  }
  toggleBranchStatus(id: number) {
    return this.toggle(id);
  }
  deleteBranches(p: { ids: number[] }) {
    return this.remove(p);
  }
  pending: Array<Subject<ApiResponse<BranchListItem[]>>> = [];
  getBranches(q: BranchesQuery): Observable<ApiResponse<BranchListItem[]>> {
    this.calls.push(q);
    const s = new Subject<ApiResponse<BranchListItem[]>>();
    this.pending.push(s);
    return s;
  }
  get last() {
    return this.pending[this.pending.length - 1];
  }
}

describe("BranchesService", () => {
  let repo: FakeRepository;
  let service: BranchesService;
  let notify: NotificationService;
  let success: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    repo = new FakeRepository();
    TestBed.configureTestingModule({ providers: [{ provide: BRANCH_REPOSITORY, useValue: repo }] });
    service = TestBed.inject(BranchesService);
    notify = TestBed.inject(NotificationService);
    success = vi.spyOn(notify, "success");
  });

  it("loads page 1 with the default page size and maps data + pagination meta", () => {
    service.load();
    expect(service.loading()).toBe(true);
    expect(repo.calls[0]).toEqual({ pageNumber: 1, pageSize: 12 });

    repo.last.next(response([branch(2), branch(1)], 14));
    repo.last.complete();

    expect(service.loading()).toBe(false);
    expect(service.hasError()).toBe(false);
    expect(service.branches().map((b) => b.id)).toEqual([2, 1]);
    expect(service.meta()?.totalCount).toBe(14);
  });

  it("flags a failed load and clears the loading state", () => {
    service.load();
    repo.last.error(new Error("boom"));

    expect(service.hasError()).toBe(true);
    expect(service.loading()).toBe(false);
  });

  it("clears the error when a retry starts", () => {
    service.load();
    repo.last.error(new Error("boom"));
    service.load();

    expect(service.hasError()).toBe(false);
    expect(service.loading()).toBe(true);
  });

  it("goes back to page 1 whenever a filter changes, and keeps the other filters", () => {
    service.setPage(3);
    expect(repo.calls[0].pageNumber).toBe(3);

    service.setFilters({ search: "nasr" });
    expect(repo.calls[1]).toEqual({ pageNumber: 1, pageSize: 12, search: "nasr" });

    service.setFilters({ isVisible: false });
    expect(repo.calls[2]).toEqual({
      pageNumber: 1,
      pageSize: 12,
      search: "nasr",
      isVisible: false,
    });

    service.setPage(2);
    expect(repo.calls[3]).toEqual({
      pageNumber: 2,
      pageSize: 12,
      search: "nasr",
      isVisible: false,
    });
  });

  it("ignores a slow response that was superseded by a newer request", () => {
    service.setFilters({ search: "a" });
    const stale = repo.last;
    service.setFilters({ search: "ab" });
    const fresh = repo.last;

    fresh.next(response([branch(7)]));
    fresh.complete();
    stale.next(response([branch(99)]));
    stale.complete();

    expect(service.branches().map((b) => b.id)).toEqual([7]);
    expect(service.loading()).toBe(false);
  });

  describe("getBranch", () => {
    it("resolves with the branch data", () => {
      repo.next = () => of(ok(DETAILS));
      let got: BranchDetails | null | undefined;
      service.getBranch(4).subscribe((b) => (got = b));
      expect(got).toEqual(DETAILS);
      expect(repo.byId).toHaveBeenCalledWith(4);
    });

    it("resolves with null on a status:false body (mock 404)", () => {
      repo.next = () => of({ ...ok(null), status: false, statusCode: 404 });
      let got: BranchDetails | null | undefined;
      service.getBranch(99).subscribe((b) => (got = b));
      expect(got).toBeNull();
    });

    it("resolves with null when the request fails", () => {
      repo.next = () => throwError(() => new Error("boom"));
      let got: BranchDetails | null | undefined;
      service.getBranch(4).subscribe((b) => (got = b));
      expect(got).toBeNull();
    });
  });

  describe("mutations", () => {
    it("createBranch resolves with the new id and toasts the success key", () => {
      repo.next = () => of(ok(15));
      let id: number | null | undefined;
      service.createBranch(PAYLOAD).subscribe((v) => (id = v));

      expect(id).toBe(15);
      expect(repo.create).toHaveBeenCalledWith(PAYLOAD);
      expect(success).toHaveBeenCalledWith("BRANCHES.CREATED");
    });

    it("createBranch resolves with null and stays silent on failure (the interceptor already spoke)", () => {
      repo.next = () => throwError(() => new Error("400"));
      let id: number | null | undefined;
      service.createBranch(PAYLOAD).subscribe((v) => (id = v));

      expect(id).toBeNull();
      expect(success).not.toHaveBeenCalled();
    });

    it("updateBranch resolves true and toasts", () => {
      let result: boolean | undefined;
      service.updateBranch(4, PAYLOAD).subscribe((v) => (result = v));

      expect(result).toBe(true);
      expect(repo.update).toHaveBeenCalledWith(4, PAYLOAD);
      expect(success).toHaveBeenCalledWith("BRANCHES.UPDATED");
    });

    it("treats a status:false body as a failed mutation", () => {
      repo.next = () => of({ ...ok(null), status: false, statusCode: 404 });
      let result: boolean | undefined;
      service.updateBranch(4, PAYLOAD).subscribe((v) => (result = v));

      expect(result).toBe(false);
      expect(success).not.toHaveBeenCalled();
    });

    it("does not reload the list after create / update (the list page reloads itself on entry)", () => {
      service.createBranch(PAYLOAD).subscribe();
      service.updateBranch(4, PAYLOAD).subscribe();
      expect(repo.calls).toEqual([]);
    });

    it("raises `saving` while a mutation is in flight and clears it afterwards", () => {
      const pending = new Subject<ApiResponse<null>>();
      repo.next = () => pending;
      service.updateBranch(4, PAYLOAD).subscribe();
      expect(service.saving()).toBe(true);

      pending.next(ok(null));
      pending.complete();
      expect(service.saving()).toBe(false);
    });

    it("clears `saving` when the mutation fails", () => {
      repo.next = () => throwError(() => new Error("500"));
      service.updateBranch(4, PAYLOAD).subscribe();
      expect(service.saving()).toBe(false);
    });
  });

  describe("toggleStatus", () => {
    it("flips the branch, toasts and reloads the list with the current query", () => {
      service.setFilters({ search: "nasr" });
      repo.last.next(response([branch(1)]));
      repo.last.complete();

      let result: boolean | undefined;
      service.toggleStatus(1).subscribe((v) => (result = v));

      expect(result).toBe(true);
      expect(repo.toggle).toHaveBeenCalledWith(1);
      expect(success).toHaveBeenCalledWith("BRANCHES.STATUS_UPDATED");
      expect(repo.calls.at(-1)).toEqual({ pageNumber: 1, pageSize: 12, search: "nasr" });
      expect(repo.calls.length).toBe(2);
    });

    it("does not reload or toast when the API refuses (e.g. nothing to show yet)", () => {
      repo.next = () => throwError(() => new Error("400"));
      let result: boolean | undefined;
      service.toggleStatus(1).subscribe((v) => (result = v));

      expect(result).toBe(false);
      expect(success).not.toHaveBeenCalled();
      expect(repo.calls).toEqual([]);
    });
  });

  describe("remove", () => {
    it("sends the ids, toasts and reloads the list", () => {
      let result: boolean | undefined;
      service.remove([3, 4]).subscribe((v) => (result = v));

      expect(result).toBe(true);
      expect(repo.remove).toHaveBeenCalledWith({ ids: [3, 4] });
      expect(success).toHaveBeenCalledWith("BRANCHES.DELETED");
      expect(repo.calls.length).toBe(1);
    });

    it("keeps everything as it was when the delete is blocked (409)", () => {
      repo.next = () => throwError(() => new Error("409"));
      let result: boolean | undefined;
      service.remove([3]).subscribe((v) => (result = v));

      expect(result).toBe(false);
      expect(success).not.toHaveBeenCalled();
      expect(repo.calls).toEqual([]);
    });

    it("steps back a page when deleting the last row of a later page", () => {
      service.setPage(3);
      repo.last.next(response([branch(1)], 25, 3));
      repo.last.complete();

      service.remove([1]).subscribe();

      expect(repo.calls.at(-1)?.pageNumber).toBe(2);
    });

    it("stays on the same page when the page still has rows left", () => {
      service.setPage(2);
      repo.last.next(response([branch(2), branch(1)], 14, 2));
      repo.last.complete();

      service.remove([1]).subscribe();

      expect(repo.calls.at(-1)?.pageNumber).toBe(2);
    });

    it("never steps back below page 1", () => {
      service.load();
      repo.last.next(response([branch(1)], 1));
      repo.last.complete();

      service.remove([1]).subscribe();

      expect(repo.calls.at(-1)?.pageNumber).toBe(1);
    });
  });
  describe("loadOptions", () => {
    it("returns id + names for every branch, requesting the max page size", () => {
      let options: unknown;
      service.loadOptions().subscribe((o) => (options = o));
      expect(repo.calls[repo.calls.length - 1]).toEqual({ pageNumber: 1, pageSize: 100 });

      repo.last.next(response([branch(2), branch(1)]));
      repo.last.complete();

      expect(options).toEqual([
        { id: 2, nameAr: "فرع 2", nameEn: "Branch 2" },
        { id: 1, nameAr: "فرع 1", nameEn: "Branch 1" },
      ]);
    });

    it("does not touch the list screen state", () => {
      service.loadOptions().subscribe();
      repo.last.next(response([branch(1)]));
      repo.last.complete();

      expect(service.branches()).toEqual([]);
      expect(service.loading()).toBe(false);
      expect(service.query().pageSize).toBe(12);
    });

    it("falls back to an empty list when the request fails", () => {
      let options: unknown;
      service.loadOptions().subscribe((o) => (options = o));
      repo.last.error(new Error("boom"));
      expect(options).toEqual([]);
    });
  });
});
