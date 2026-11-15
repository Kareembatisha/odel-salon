import { Injectable, computed, inject, signal } from "@angular/core";
import { Subscription, catchError, finalize, map, of } from "rxjs";

import { PaginationMeta } from "@shared/model/api_response.model";
import { BARBER_REPOSITORY } from "../../barbers/repository/barber.repository";
import { BranchListItem } from "../../branches/model/branch.model";
import { BranchesService } from "../../branches/service/branches.service";
import { BookingListItem, BookingTab, BookingsQuery } from "../model/booking.model";
import { BOOKING_REPOSITORY } from "../repository/booking.repository";
import { readBookingCounters } from "../utils/booking-counters.util";

// ============================================================
// Types and constants
// ============================================================

/** The API's default page size. */
export const BOOKINGS_PAGE_SIZE = 20;

/** Most barbers one branch can list for the barber filter (the API's page-size ceiling). */
const BARBER_OPTIONS_LIMIT = 100;

/** Filters the list screen can change (everything in the query except paging and the branch). */
export type BookingFilters = Partial<
  Pick<
    BookingsQuery,
    "tab" | "barberId" | "type" | "statuses" | "dateFrom" | "dateTo" | "refundStatus" | "search"
  >
>;

export type BookingBranchOption = Pick<BranchListItem, "id" | "nameAr" | "nameEn">;

/** A barber of the selected branch, for the barber filter (suspended ones too: old bookings keep them). */
export interface BookingBarberOption {
  id: number;
  fullName: string;
}

// ============================================================
// Service
// ============================================================

/**
 * State of the Bookings list (`/main/bookings`).
 *
 * The list belongs to ONE branch — the counters ("Today", "Refund waiting") are the selected
 * branch's — so, like Offers and Attendance, {@link initialize} selects the first (oldest) branch
 * by default and there is no "all branches" view.
 *
 * Every filter change reloads from page 1 (a filter that shrinks the result could otherwise strand
 * the user on a page that no longer exists). Only the latest response may write the rows, so a slow,
 * stale response can't overwrite fresh results; a failure keeps the previous rows and sets `hasError`.
 *
 * The counters come with every response (`meta.additionalData`) and don't depend on the other
 * filters, so they stay put while the user filters. They are `null` until a response brought them
 * (never a misleading 0).
 */
@Injectable({ providedIn: "root" })
export class BookingsService {
  private readonly repository = inject(BOOKING_REPOSITORY);
  private readonly barberRepository = inject(BARBER_REPOSITORY);
  private readonly branchesService = inject(BranchesService);

  private readonly _bookings = signal<BookingListItem[]>([]);
  private readonly _meta = signal<PaginationMeta | null>(null);
  private readonly _query = signal<BookingsQuery>(this.freshQuery());
  private readonly _branches = signal<BookingBranchOption[]>([]);
  private readonly _branchId = signal<number | null>(null);
  private readonly _barbers = signal<BookingBarberOption[]>([]);
  private readonly _loading = signal(false);
  private readonly _branchesLoading = signal(false);
  private readonly _hasError = signal(false);

  private branchesLoaded = false;

  /** In-flight list request — a newer one cancels it. Paired with {@link requestId}. */
  private inFlight?: Subscription;
  private requestId = 0;
  /** Bumped on every barber-options request, so a slow answer for a branch that was left is dropped. */
  private barbersRequestId = 0;

  // ----------------------------------------------------------
  // Public read-only state
  // ----------------------------------------------------------

  readonly bookings = this._bookings.asReadonly();
  readonly meta = this._meta.asReadonly();
  readonly query = this._query.asReadonly();
  readonly branches = this._branches.asReadonly();
  readonly branchId = this._branchId.asReadonly();
  /** Barbers of the selected branch (empty until they load). */
  readonly barbers = this._barbers.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly branchesLoading = this._branchesLoading.asReadonly();
  readonly hasError = this._hasError.asReadonly();

  readonly tab = computed(() => this._query().tab ?? BookingTab.All);
  readonly totalCount = computed(() => this._meta()?.totalCount ?? 0);

  /** "Today" and "Refund waiting" of the selected branch; `null` before the first response. */
  readonly counters = computed(() => {
    const meta = this._meta();
    return meta === null ? null : readBookingCounters(meta);
  });

  /** Branches finished loading and there is none: nothing to select, nothing to list. */
  readonly noBranches = computed(
    () => !this._branchesLoading() && this._branches().length === 0 && this._branchId() === null,
  );

  // ----------------------------------------------------------
  // Loading
  // ----------------------------------------------------------

  /**
   * Called every time the page opens. The service outlives the page but the filter widgets start
   * empty, so the tab, search, filters and paging are RESET (what you see is what is applied); only
   * the selected branch is kept between visits. Then it loads the branch options once, falls back
   * to the oldest branch when the selected one is gone, and loads its barbers and bookings.
   */
  initialize(): void {
    this.resetFilters();

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

  /** Request a page of the selected branch's bookings. Does nothing until a branch is selected. */
  load(): void {
    const branchId = this._branchId();
    if (branchId === null) return;

    const currentRequest = ++this.requestId;

    this.inFlight?.unsubscribe();
    this._loading.set(true);
    this._hasError.set(false);
    this.inFlight = this.repository
      .getBookings({ ...this._query(), branchId })
      .pipe(
        map((res) => {
          if (!res.status) throw new Error(res.message);
          return res;
        }),
        catchError(() => {
          this._hasError.set(true);
          return of(null);
        }),
        finalize(() => {
          if (currentRequest === this.requestId) this._loading.set(false);
        }),
      )
      .subscribe((res) => {
        if (!res) return;
        this._bookings.set(res.data ?? []);
        this._meta.set(res.meta);
      });
  }

  // ----------------------------------------------------------
  // Commands
  // ----------------------------------------------------------

  /**
   * Show another branch. Its bookings, counters and barbers replace the old ones; the barber filter
   * is cleared (that barber belongs to the branch that was left) while the other filters stay.
   */
  selectBranch(branchId: number): void {
    if (branchId === this._branchId()) return;

    this._branchId.set(branchId);
    this._query.update((q) => ({ ...q, barberId: undefined, pageNumber: 1 }));
    this.resetResults();
    this.loadBarbers(branchId);
    this.load();
  }

  /** Apply filter changes and reload from page 1. Pass `undefined` to clear a filter. */
  setFilters(filters: BookingFilters): void {
    this._query.update((q) => ({ ...q, ...filters, pageNumber: 1 }));
    this.load();
  }

  setTab(tab: BookingTab): void {
    this.setFilters({ tab });
  }

  /** Jump to a page and reload. The pager owns the upper bound. */
  setPage(pageNumber: number): void {
    this._query.update((q) => ({ ...q, pageNumber }));
    this.load();
  }

  /** Back to the plain list of the branch: tab All, no filters, page 1. */
  clearFilters(): void {
    this._query.set(this.freshQuery());
    this.load();
  }

  // ----------------------------------------------------------
  // Private
  // ----------------------------------------------------------

  private freshQuery(): BookingsQuery {
    return { pageNumber: 1, pageSize: BOOKINGS_PAGE_SIZE, tab: BookingTab.All };
  }

  /** Tab All, no filters, page 1. Rows loaded under the old filters go too, so they don't show under empty widgets. */
  private resetFilters(): void {
    const q = this._query();
    const wasFiltered =
      q.pageNumber !== 1 ||
      (q.tab ?? BookingTab.All) !== BookingTab.All ||
      q.barberId !== undefined ||
      q.type !== undefined ||
      !!q.statuses?.length ||
      !!q.dateFrom ||
      !!q.dateTo ||
      q.refundStatus !== undefined ||
      !!q.search;

    this._query.set(this.freshQuery());
    // Only then: an unfiltered list can stay on screen while it refreshes, instead of flashing empty.
    if (wasFiltered) this._bookings.set([]);
  }

  /** Keep the selected branch if it still exists, otherwise take the first; then load. */
  private ensureBranchAndLoad(): void {
    const options = this._branches();
    const current = this._branchId();

    if (current === null || !options.some((b) => b.id === current)) {
      this._branchId.set(options[0]?.id ?? null);
      this._query.update((q) => ({ ...q, barberId: undefined, pageNumber: 1 }));
      this.resetResults();
    }

    const branchId = this._branchId();
    if (branchId === null) {
      this._loading.set(false);
      return;
    }

    this.loadBarbers(branchId);
    this.load();
  }

  /** Rows and counters of the branch that was left must not show under the new one. */
  private resetResults(): void {
    this._bookings.set([]);
    this._meta.set(null);
  }

  private loadBarbers(branchId: number): void {
    const request = ++this.barbersRequestId;
    this._barbers.set([]);

    this.barberRepository
      .getBarbers({ branchId, pageNumber: 1, pageSize: BARBER_OPTIONS_LIMIT })
      .pipe(catchError(() => of(null)))
      .subscribe((res) => {
        if (request !== this.barbersRequestId || !res?.status) return;
        this._barbers.set((res.data ?? []).map((b) => ({ id: b.id, fullName: b.fullName })));
      });
  }
}
