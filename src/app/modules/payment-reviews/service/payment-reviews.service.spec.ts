import { TestBed } from "@angular/core/testing";
import { Observable, Subject, of, throwError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationService } from "@core/services/notification.service";
import { ApiResponse, PaginationMeta } from "@shared/model/api_response.model";
import { BookingStatus, BookingType, PaymentMethod } from "../../bookings/model/booking.model";
import { BranchesService } from "../../branches/service/branches.service";
import {
  PaymentReviewItem,
  PaymentReviewTab,
  PaymentReviewsQuery,
  RejectBookingRequest,
} from "../model/payment-review.model";
import { PAYMENT_REVIEW_REPOSITORY } from "../repository/payment-review.repository";
import { PAYMENT_REVIEWS_PAGE_SIZE, PaymentReviewsService } from "./payment-reviews.service";

function item(id: number): PaymentReviewItem {
  return {
    id,
    status: BookingStatus.PendingReview,
    type: BookingType.Regular,
    startAt: "2026-11-13T21:30:00",
    customer: { fullName: `Customer ${id}`, phoneNumber: "+201017772310" },
    items: [{ nameAr: "قص شعر", nameEn: "Haircut" }],
    payment: { method: PaymentMethod.InstaPay, totalPrice: 340, proofUrl: "https://x/p.jpg" },
    waitingMinutes: 12,
    isLate: false,
  };
}

function meta(over: Partial<PaginationMeta> = {}): PaginationMeta {
  return {
    currentPage: 1,
    pageSize: PAYMENT_REVIEWS_PAGE_SIZE,
    totalPages: 1,
    totalCount: 0,
    hasPreviousPage: false,
    hasNextPage: false,
    additionalData: {
      toReviewCount: 5,
      approvedTodayCount: 2,
      rejectedTodayCount: 1,
      reviewTargetMinutes: 30,
    },
    ...over,
  };
}

const ok = (data: PaymentReviewItem[], m: PaginationMeta = meta({ totalCount: data.length })) => ({
  status: true,
  statusCode: 200,
  message: "ok",
  errors: null,
  meta: m,
  data,
});
const done = (): ApiResponse<null> => ({
  status: true,
  statusCode: 200,
  message: "ok",
  errors: null,
  meta: null,
  data: null,
});

class FakeRepo {
  queries: PaymentReviewsQuery[] = [];
  approved: number[] = [];
  rejected: Array<{ id: number; payload: RejectBookingRequest }> = [];
  respond: (q: PaymentReviewsQuery) => Observable<ApiResponse<PaymentReviewItem[]>> = () =>
    of(ok([item(1), item(2)]));
  approve: (id: number) => Observable<ApiResponse<null>> = () => of(done());
  rejectWith: (id: number) => Observable<ApiResponse<null>> = () => of(done());

  getPaymentReviews(q: PaymentReviewsQuery) {
    this.queries.push(structuredClone(q));
    return this.respond(q);
  }
  approveBooking(id: number) {
    this.approved.push(id);
    return this.approve(id);
  }
  rejectBooking(id: number, payload: RejectBookingRequest) {
    this.rejected.push({ id, payload });
    return this.rejectWith(id);
  }
  get last(): PaymentReviewsQuery {
    return this.queries[this.queries.length - 1];
  }
}

describe("PaymentReviewsService", () => {
  let repo: FakeRepo;
  let service: PaymentReviewsService;
  let success: ReturnType<typeof vi.fn>;
  let branchList: Array<{ id: number; nameAr: string; nameEn: string }>;

  const run = (obs: Observable<boolean>) =>
    new Promise<boolean>((resolve) => obs.subscribe(resolve));

  beforeEach(() => {
    repo = new FakeRepo();
    success = vi.fn();
    branchList = [
      { id: 2, nameAr: "ب", nameEn: "B" },
      { id: 1, nameAr: "أ", nameEn: "A" },
    ];
    TestBed.configureTestingModule({
      providers: [
        { provide: PAYMENT_REVIEW_REPOSITORY, useValue: repo },
        { provide: BranchesService, useValue: { loadOptions: () => of(branchList) } },
        { provide: NotificationService, useValue: { success } },
      ],
    });
    service = TestBed.inject(PaymentReviewsService);
  });

  describe("initialize", () => {
    it("opens the first (oldest) branch on the To review tab", () => {
      service.initialize();

      expect(service.branches().map((b) => b.id)).toEqual([1, 2]);
      expect(service.branchId()).toBe(1);
      expect(repo.last).toEqual({
        branchId: 1,
        pageNumber: 1,
        pageSize: PAYMENT_REVIEWS_PAGE_SIZE,
        tab: PaymentReviewTab.ToReview,
      });
      expect(service.tab()).toBe(PaymentReviewTab.ToReview);
    });

    it("loads the rows, the badges, and stamps the time of the update", () => {
      service.initialize();

      expect(service.items().map((i) => i.id)).toEqual([1, 2]);
      expect(service.counters()).toEqual({
        toReviewCount: 5,
        approvedTodayCount: 2,
        rejectedTodayCount: 1,
        reviewTargetMinutes: 30,
      });
      expect(service.updatedAt()).toBeInstanceOf(Date);
      expect(service.loading()).toBe(false);
    });

    it("has no badges and no update time before the first response", () => {
      repo.respond = () => new Subject<ApiResponse<PaymentReviewItem[]>>();

      service.initialize();

      expect(service.counters()).toBeNull();
      expect(service.updatedAt()).toBeNull();
      expect(service.loading()).toBe(true);
    });

    it("reports 'no branches' and loads nothing when there is none", () => {
      branchList = [];

      service.initialize();

      expect(service.noBranches()).toBe(true);
      expect(repo.queries).toEqual([]);
      expect(service.loading()).toBe(false);
    });

    it("keeps the selected branch when the page is opened again", () => {
      service.initialize();
      service.selectBranch(2);
      repo.queries = [];

      service.initialize();

      expect(service.branchId()).toBe(2);
      expect(repo.last.branchId).toBe(2);
    });

    it("starts on To review, page 1, every time it opens", () => {
      service.initialize();
      service.setTab(PaymentReviewTab.RejectedToday);
      service.setPage(2);
      repo.queries = [];

      service.initialize();

      expect(repo.last).toEqual({
        branchId: 1,
        pageNumber: 1,
        pageSize: PAYMENT_REVIEWS_PAGE_SIZE,
        tab: PaymentReviewTab.ToReview,
      });
      expect(service.tab()).toBe(PaymentReviewTab.ToReview);
    });

    it("drops the cards of another tab so they don't show under To review while it reloads", () => {
      service.initialize();
      service.setTab(PaymentReviewTab.ApprovedToday);
      expect(service.items()).toHaveLength(2);
      repo.respond = () => new Subject<ApiResponse<PaymentReviewItem[]>>();

      service.initialize();

      expect(service.items()).toEqual([]);
      expect(service.loading()).toBe(true);
    });

    it("keeps the To review queue on screen while it refreshes (no flash of emptiness)", () => {
      service.initialize();
      repo.respond = () => new Subject<ApiResponse<PaymentReviewItem[]>>();

      service.initialize();

      expect(service.items()).toHaveLength(2);
    });
  });

  describe("tabs, branches and paging", () => {
    beforeEach(() => service.initialize());

    it("loads another tab from page 1 (tab 0 is a value, not 'unset')", () => {
      service.setTab(PaymentReviewTab.ApprovedToday);
      expect(repo.last.tab).toBe(1);

      service.setPage(3);
      service.setTab(PaymentReviewTab.ToReview);
      expect(repo.last).toMatchObject({ tab: 0, pageNumber: 1 });
    });

    it("moves to another page and keeps the tab", () => {
      service.setTab(PaymentReviewTab.RejectedToday);
      service.setPage(2);

      expect(repo.last).toMatchObject({ pageNumber: 2, tab: PaymentReviewTab.RejectedToday });
    });

    it("shows another branch's queue, dropping the old rows and badges at once", () => {
      repo.respond = () => new Subject<ApiResponse<PaymentReviewItem[]>>();

      service.selectBranch(2);

      expect(service.branchId()).toBe(2);
      expect(service.items()).toEqual([]);
      expect(service.counters()).toBeNull();
      expect(repo.last.branchId).toBe(2);
    });

    it("does nothing for the branch that is already selected", () => {
      const before = repo.queries.length;
      service.selectBranch(1);

      expect(repo.queries).toHaveLength(before);
    });
  });

  describe("loading, quiet reloads and errors", () => {
    beforeEach(() => service.initialize());

    it("lets only the latest request write the rows", () => {
      const first = new Subject<ApiResponse<PaymentReviewItem[]>>();
      const second = new Subject<ApiResponse<PaymentReviewItem[]>>();
      const subjects = [first, second];
      repo.respond = () => subjects.shift()!;

      service.setTab(PaymentReviewTab.ApprovedToday);
      service.setTab(PaymentReviewTab.RejectedToday);
      second.next(ok([item(20)]));
      second.complete();
      first.next(ok([item(10)])); // too late

      expect(service.items().map((i) => i.id)).toEqual([20]);
      expect(service.loading()).toBe(false);
    });

    it("keeps the rows and flags the error when a normal reload fails", () => {
      repo.respond = () => throwError(() => ({ status: 500 }));

      service.setTab(PaymentReviewTab.ApprovedToday);

      expect(service.hasError()).toBe(true);
      expect(service.items().map((i) => i.id)).toEqual([1, 2]);
      expect(service.loading()).toBe(false);
    });

    it("treats a status:false envelope as a failure", () => {
      repo.respond = () => of({ ...ok([]), status: false, message: "no" });

      service.load();

      expect(service.hasError()).toBe(true);
    });

    it("refreshes quietly: no skeleton, the rows stay until the new ones arrive", () => {
      const hold = new Subject<ApiResponse<PaymentReviewItem[]>>();
      repo.respond = () => hold;

      service.refresh();

      expect(service.loading()).toBe(false);
      expect(service.refreshing()).toBe(true);
      expect(service.items().map((i) => i.id)).toEqual([1, 2]);

      hold.next(ok([item(7)]));
      hold.complete();
      expect(service.refreshing()).toBe(false);
      expect(service.items().map((i) => i.id)).toEqual([7]);
    });

    it("ignores a failed quiet reload (no error banner every minute)", () => {
      repo.respond = () => throwError(() => ({ status: 500 }));

      service.refresh();

      expect(service.hasError()).toBe(false);
      expect(service.items().map((i) => i.id)).toEqual([1, 2]);
      expect(service.refreshing()).toBe(false);
    });

    it("does not start a quiet reload while the skeleton load is still running", () => {
      repo.respond = () => new Subject<ApiResponse<PaymentReviewItem[]>>();
      service.setTab(PaymentReviewTab.ApprovedToday);
      const before = repo.queries.length;

      service.refresh();

      expect(repo.queries).toHaveLength(before);
    });

    it("clears the error on the next successful load", () => {
      repo.respond = () => throwError(() => ({ status: 500 }));
      service.load();
      repo.respond = () => of(ok([item(5)]));
      service.load();

      expect(service.hasError()).toBe(false);
      expect(service.items().map((i) => i.id)).toEqual([5]);
    });
  });

  describe("approve", () => {
    beforeEach(() => service.initialize());

    it("approves, toasts our own message and reloads the queue quietly", async () => {
      const before = repo.queries.length;
      repo.respond = () => of(ok([item(2)]));

      expect(await run(service.approve(1))).toBe(true);

      expect(repo.approved).toEqual([1]);
      expect(success).toHaveBeenCalledWith("PAYMENT_REVIEWS.APPROVED");
      expect(repo.queries).toHaveLength(before + 1);
      expect(service.items().map((i) => i.id)).toEqual([2]);
    });

    it("answers false and reloads anyway when it fails (409: the queue was out of date)", async () => {
      const before = repo.queries.length;
      repo.approve = () => throwError(() => ({ status: 409 }));

      expect(await run(service.approve(1))).toBe(false);

      expect(success).not.toHaveBeenCalled();
      expect(repo.queries).toHaveLength(before + 1);
    });

    it("treats a status:false body as a failure", async () => {
      repo.approve = () => of({ ...done(), status: false });

      expect(await run(service.approve(1))).toBe(false);
      expect(success).not.toHaveBeenCalled();
    });

    it("marks only that booking as pending while it runs", () => {
      const hold = new Subject<ApiResponse<null>>();
      repo.approve = () => hold;

      service.approve(1).subscribe();
      expect(service.pendingIds().has(1)).toBe(true);
      expect(service.pendingIds().has(2)).toBe(false);

      hold.next(done());
      hold.complete();
      expect(service.pendingIds().size).toBe(0);
    });

    it("keeps each booking's pending flag apart when two run at once", () => {
      const first = new Subject<ApiResponse<null>>();
      const second = new Subject<ApiResponse<null>>();
      const subjects = [first, second];
      repo.approve = () => subjects.shift()!;

      service.approve(1).subscribe();
      service.approve(2).subscribe();
      first.next(done());
      first.complete();

      expect([...service.pendingIds()]).toEqual([2]);
      second.error({ status: 500 });
      expect(service.pendingIds().size).toBe(0);
    });

    it("steps back a page when the last booking of a later page leaves the queue", async () => {
      repo.respond = () =>
        of(ok([item(21)], meta({ currentPage: 2, totalCount: 21, totalPages: 2 })));
      service.setPage(2);
      expect(service.items()).toHaveLength(1);

      await run(service.approve(21));

      expect(repo.last.pageNumber).toBe(1);
    });

    it("stays on the page when other bookings remain on it", async () => {
      repo.respond = () =>
        of(ok([item(21), item(22)], meta({ currentPage: 2, totalCount: 22, totalPages: 2 })));
      service.setPage(2);

      await run(service.approve(21));

      expect(repo.last.pageNumber).toBe(2);
    });
  });

  describe("reject", () => {
    beforeEach(() => service.initialize());

    it("sends the reason, toasts and reloads", async () => {
      const before = repo.queries.length;

      expect(await run(service.reject(2, "Wrong amount"))).toBe(true);

      expect(repo.rejected).toEqual([{ id: 2, payload: { reason: "Wrong amount" } }]);
      expect(success).toHaveBeenCalledWith("PAYMENT_REVIEWS.REJECTED");
      expect(repo.queries).toHaveLength(before + 1);
    });

    it("answers false when it fails and still reloads", async () => {
      const before = repo.queries.length;
      repo.rejectWith = () => throwError(() => ({ status: 409 }));

      expect(await run(service.reject(2, "Wrong amount"))).toBe(false);

      expect(success).not.toHaveBeenCalled();
      expect(repo.queries).toHaveLength(before + 1);
      expect(service.pendingIds().size).toBe(0);
    });
  });
});
