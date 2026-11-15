import { Injectable, computed, inject, signal } from "@angular/core";
import { Observable, Subscription, catchError, finalize, map, of, tap } from "rxjs";

import { NotificationService } from "@core/services/notification.service";
import { PaginationMeta } from "@shared/model/api_response.model";
import { BranchListItem } from "../../branches/model/branch.model";
import { BranchesService } from "../../branches/service/branches.service";
import { readPaymentReviewCounters } from "../../bookings/utils/booking-counters.util";
import {
  PaymentReviewItem,
  PaymentReviewTab,
  PaymentReviewsQuery,
} from "../model/payment-review.model";
import { PAYMENT_REVIEW_REPOSITORY } from "../repository/payment-review.repository";

/** The API's default page size. */
export const PAYMENT_REVIEWS_PAGE_SIZE = 20;

export type ReviewBranchOption = Pick<BranchListItem, "id" | "nameAr" | "nameEn">;

/**
 * State of the payment-review queue (`/main/bookings/payment-reviews`).
 *
 * The queue belongs to ONE branch — the tab badges are the selected branch's — so, like Bookings
 * and Attendance, {@link initialize} selects the first (oldest) branch and there is no "all
 * branches" view.
 *
 * It is time-critical (an unreviewed booking expires at its start time, and the "waiting" minutes
 * keep growing), so it can be reloaded QUIETLY with {@link refresh}: the rows stay put, nothing
 * flashes a skeleton, and a failed background reload is ignored (the next one will try again).
 * Only the latest response may write the rows.
 *
 * Approve / reject track which bookings are being saved (`pendingIds`), so only that card's buttons
 * lock, and reload the queue afterwards — after a FAILURE too: a 409 / 404 means the queue was out
 * of date (someone else reviewed it, or it expired).
 */
@Injectable({ providedIn: "root" })
export class PaymentReviewsService {
  private readonly repository = inject(PAYMENT_REVIEW_REPOSITORY);
  private readonly branchesService = inject(BranchesService);
  private readonly notify = inject(NotificationService);

  private readonly _items = signal<PaymentReviewItem[]>([]);
  private readonly _meta = signal<PaginationMeta | null>(null);
  private readonly _query = signal<PaymentReviewsQuery>(this.freshQuery());
  private readonly _branches = signal<ReviewBranchOption[]>([]);
  private readonly _branchId = signal<number | null>(null);
  private readonly _loading = signal(false);
  private readonly _refreshing = signal(false);
  private readonly _branchesLoading = signal(false);
  private readonly _hasError = signal(false);
  private readonly _pendingIds = signal<ReadonlySet<number>>(new Set());
  private readonly _updatedAt = signal<Date | null>(null);

  private branchesLoaded = false;

  /** In-flight list request — a newer one cancels it. Paired with {@link requestId}. */
  private inFlight?: Subscription;
  private requestId = 0;

  // ----------------------------------------------------------
  // Public read-only state
  // ----------------------------------------------------------

  readonly items = this._items.asReadonly();
  readonly meta = this._meta.asReadonly();
  readonly query = this._query.asReadonly();
  readonly branches = this._branches.asReadonly();
  readonly branchId = this._branchId.asReadonly();
  /** The queue is being (re)loaded with the skeleton showing. */
  readonly loading = this._loading.asReadonly();
  /** A quiet background reload is running (the refresh button spins; the rows stay). */
  readonly refreshing = this._refreshing.asReadonly();
  readonly branchesLoading = this._branchesLoading.asReadonly();
  readonly hasError = this._hasError.asReadonly();
  /** Bookings whose approve / reject is in flight. */
  readonly pendingIds = this._pendingIds.asReadonly();
  /** When the rows were last brought up to date; `null` before the first response. */
  readonly updatedAt = this._updatedAt.asReadonly();

  readonly tab = computed(() => this._query().tab ?? PaymentReviewTab.ToReview);
  readonly totalCount = computed(() => this._meta()?.totalCount ?? 0);

  /** Tab badges and the review-time target of the selected branch; `null` before the first response. */
  readonly counters = computed(() => {
    const meta = this._meta();
    return meta === null ? null : readPaymentReviewCounters(meta);
  });

  /** Branches finished loading and there is none: nothing to select, nothing to review. */
  readonly noBranches = computed(
    () => !this._branchesLoading() && this._branches().length === 0 && this._branchId() === null,
  );

  // ----------------------------------------------------------
  // Loading
  // ----------------------------------------------------------

  /**
   * Called every time the page opens. The service outlives the page but the widgets start on
   * *To review*, page 1, so the tab and paging are RESET; only the selected branch is kept between
   * visits. Then it loads the branch options once, keeps (or picks) the branch, and loads.
   */
  initialize(): void {
    this.resetTab();

    if (this.branchesLoaded) {
      this.ensureBranchAndLoad();
      return;
    }

    this._branchesLoading.set(true);
    this.branchesService
      .loadOptions()
      .pipe(finalize(() => this._branchesLoading.set(false)))
      .subscribe((options) => {
        // The Branches API lists newest first; the selector reads oldest first.
        this._branches.set([...options].sort((a, b) => a.id - b.id));
        this.branchesLoaded = true;
        this.ensureBranchAndLoad();
      });
  }

  /**
   * Request the current page of the selected branch's queue. `quiet` reloads in the background:
   * no skeleton, and a failure is ignored — but only once there is something on screen to keep.
   */
  load(quiet = false): void {
    const branchId = this._branchId();
    if (branchId === null) return;

    const background = quiet && this._meta() !== null;
    const currentRequest = ++this.requestId;

    this.inFlight?.unsubscribe();
    this._loading.set(!background);
    this._refreshing.set(background);
    if (!background) this._hasError.set(false);

    this.inFlight = this.repository
      .getPaymentReviews({ ...this._query(), branchId })
      .pipe(
        map((res) => {
          if (!res.status) throw new Error(res.message);
          return res;
        }),
        catchError(() => {
          if (!background) this._hasError.set(true);
          return of(null);
        }),
        finalize(() => {
          if (currentRequest !== this.requestId) return;
          this._loading.set(false);
          this._refreshing.set(false);
        }),
      )
      .subscribe((res) => {
        if (!res) return;
        this._items.set(res.data ?? []);
        this._meta.set(res.meta);
        this._hasError.set(false);
        this._updatedAt.set(new Date());
      });
  }

  /**
   * Quiet reload for the timer, the tab-focus check and the refresh button. It leaves a loading
   * skeleton alone (that request is already bringing fresh rows).
   */
  refresh(): void {
    if (this._loading()) return;
    this.load(true);
  }

  // ----------------------------------------------------------
  // Commands
  // ----------------------------------------------------------

  /** Show another branch's queue; the old rows and badges go at once. */
  selectBranch(branchId: number): void {
    if (branchId === this._branchId()) return;

    this._branchId.set(branchId);
    this._query.update((q) => ({ ...q, pageNumber: 1 }));
    this.resetResults();
    this.load();
  }

  setTab(tab: PaymentReviewTab): void {
    this._query.update((q) => ({ ...q, tab, pageNumber: 1 }));
    this.load();
  }

  /** Jump to a page and reload. The pager owns the upper bound. */
  setPage(pageNumber: number): void {
    this._query.update((q) => ({ ...q, pageNumber }));
    this.load();
  }

  /** PendingReview → Confirmed. `true` once approved; `false` when nothing changed. */
  approve(id: number): Observable<boolean> {
    return this.act(id, this.repository.approveBooking(id), "PAYMENT_REVIEWS.APPROVED");
  }

  /** PendingReview → Rejected, with the reason the customer will see. */
  reject(id: number, reason: string): Observable<boolean> {
    return this.act(id, this.repository.rejectBooking(id, { reason }), "PAYMENT_REVIEWS.REJECTED");
  }

  // ----------------------------------------------------------
  // Private
  // ----------------------------------------------------------

  private freshQuery(): PaymentReviewsQuery {
    return { pageNumber: 1, pageSize: PAYMENT_REVIEWS_PAGE_SIZE, tab: PaymentReviewTab.ToReview };
  }

  /** Back to *To review*, page 1. Cards loaded for another tab go too, so they don't show under it. */
  private resetTab(): void {
    const q = this._query();
    const wasElsewhere =
      q.pageNumber !== 1 || (q.tab ?? PaymentReviewTab.ToReview) !== PaymentReviewTab.ToReview;

    this._query.set(this.freshQuery());
    // Only then: the first tab's queue can stay on screen while it refreshes, instead of flashing empty.
    if (wasElsewhere) this._items.set([]);
  }

  /** Keep the selected branch if it still exists, otherwise take the first; then load. */
  private ensureBranchAndLoad(): void {
    const options = this._branches();
    const current = this._branchId();

    if (current === null || !options.some((b) => b.id === current)) {
      this._branchId.set(options[0]?.id ?? null);
      this._query.update((q) => ({ ...q, pageNumber: 1 }));
      this.resetResults();
    }

    if (this._branchId() === null) {
      this._loading.set(false);
      return;
    }

    this.load();
  }

  /** Rows and badges of the branch that was left must not show under the new one. */
  private resetResults(): void {
    this._items.set([]);
    this._meta.set(null);
  }

  /**
   * Runs an approve / reject for one booking: marks it pending, toasts our own localized success
   * message (the backend's is English-only), turns every failure into `false` (the interceptor or
   * mock already explained 404 / 409 / 400), and reloads the queue quietly either way.
   */
  private act(
    id: number,
    request: Observable<{ status: boolean; message: string }>,
    successKey: string,
  ): Observable<boolean> {
    this.setPending(id, true);

    return request.pipe(
      map((res) => {
        if (!res.status) throw new Error(res.message);
        return true;
      }),
      tap(() => {
        this.notify.success(successKey);
        // The last booking of a later page just left the tab: that page no longer exists.
        const query = this._query();
        if (this._items().length === 1 && query.pageNumber > 1) {
          this._query.set({ ...query, pageNumber: query.pageNumber - 1 });
        }
      }),
      catchError(() => of(false)),
      tap(() => this.load(true)),
      finalize(() => this.setPending(id, false)),
    );
  }

  private setPending(id: number, pending: boolean): void {
    this._pendingIds.update((ids) => {
      const next = new Set(ids);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
