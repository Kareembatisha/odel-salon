import { Injectable, Injector, computed, inject, signal } from "@angular/core";
import {
  Observable,
  Subscription,
  catchError,
  finalize,
  forkJoin,
  map,
  of,
  switchMap,
  tap,
} from "rxjs";

import { NotificationService } from "@core/services/notification.service";
import { ApiResponse, PaginationMeta } from "@shared/model/api_response.model";
import { BranchListItem } from "@modules/branches/model/branch.model";
import { BRANCH_REPOSITORY } from "@modules/branches/repository/branch.repository";
import { BranchesService } from "@modules/branches/service/branches.service";
import {
  AdjustPricesRequest,
  CopyPricesRequest,
  DeleteServicesRequest,
  ServiceDetails,
  ServiceBranchPricing,
  ServiceListItem,
  ServiceOption,
  ServicePayload,
  SERVICES_MAX_PAGE_SIZE,
  ServicesQuery,
  SetServiceStatusRequest,
} from "../model/service.model";
import { SERVICE_REPOSITORY } from "../repository/service.repository";
import { toServiceOptions } from "../utils/service-option.util";
import { readServicesSummary } from "../utils/service-summary.util";

// ============================================================
// Constants
// ============================================================

/** Default page size of the services table (contract default: 20, max 100). */
const PAGE_SIZE = 20;

/** A branch as the selector and the price grid need it. */
export type ServiceBranchOption = Pick<BranchListItem, "id" | "nameAr" | "nameEn">;

/** Filters the list screen can change (everything in the query except branch and paging). */
export type ServiceFilters = Partial<
  Pick<ServicesQuery, "search" | "isActive" | "isHomeAvailable">
>;

type ListQuery = Omit<ServicesQuery, "branchId">;

// ============================================================
// Service
// ============================================================

/**
 * ServicesService — state of the Services (Menu & Pricing) screen: the branch selector,
 * the price table of the selected branch (server-side search / filters / paging), the
 * summary counts, and every service mutation.
 *
 * The API prices ONE branch at a time, so the list needs a branch. {@link initialize}
 * loads the branch options and selects the FIRST branch by default; there is no
 * "all branches" view.
 *
 * Mutations resolve to a plain result (`id` / `true` on success, `null` / `false` on
 * failure). The service toasts a localized success message; failures were already
 * explained by the error interceptor (400 / 403 / 404 / 409), so callers only decide what
 * to do next (navigate, close a dialog…). Mutations that change what the table shows
 * reload it; create / edit don't, because they happen on their own page and the list page
 * always loads when it opens.
 */
@Injectable({ providedIn: "root" })
export class ServicesService {
  // ----------------------------------------------------------
  // Injected Dependencies
  // ----------------------------------------------------------

  private readonly repository = inject(SERVICE_REPOSITORY);
  private readonly branchesService = inject(BranchesService);
  private readonly notify = inject(NotificationService);
  private readonly injector = inject(Injector);

  // ----------------------------------------------------------
  // Private State
  // ----------------------------------------------------------

  private readonly _services = signal<ServiceListItem[]>([]);
  private readonly _meta = signal<PaginationMeta | null>(null);
  private readonly _branches = signal<ServiceBranchOption[]>([]);
  private readonly _branchId = signal<number | null>(null);
  private readonly _query = signal<ListQuery>({
    pageNumber: 1,
    pageSize: PAGE_SIZE,
  });
  private readonly _loading = signal(false);
  private readonly _branchesLoading = signal(false);
  private readonly _hasError = signal(false);
  private readonly _saving = signal(false);

  /** True once the branch options have been requested (successfully or not). */
  private branchesLoaded = false;

  /**
   * In-flight list request — a newer one cancels it so a slow, stale response can't
   * overwrite fresh results. Paired with {@link requestId}: the id check stops an obsolete
   * request's `finalize` from clearing the current request's `loading` flag.
   */
  private inFlight?: Subscription;
  private requestId = 0;

  // ----------------------------------------------------------
  // Public Read-Only State
  // ----------------------------------------------------------

  readonly services = this._services.asReadonly();
  readonly meta = this._meta.asReadonly();
  /** Branches for the selector, oldest first (ascending id). */
  readonly branches = this._branches.asReadonly();
  /** The branch whose price table is shown; `null` until the options load (or if there are none). */
  readonly branchId = this._branchId.asReadonly();
  readonly query = this._query.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly branchesLoading = this._branchesLoading.asReadonly();
  readonly hasError = this._hasError.asReadonly();
  /** A mutation (create / update / status / delete / copy / adjust) is in flight. */
  readonly saving = this._saving.asReadonly();

  /** The selected branch option, if any. */
  readonly selectedBranch = computed(
    () => this._branches().find((b) => b.id === this._branchId()) ?? null,
  );

  /** Options loaded, but the salon has no branches — nothing can be priced yet. */
  readonly noBranches = computed(
    () => !this._branchesLoading() && this.branchesLoaded && this._branches().length === 0,
  );

  /**
   * The four summary cards. Counted by the backend over the WHOLE selected branch and
   * independent of the search / status / home filters.
   */
  readonly summary = computed(() => readServicesSummary(this._meta()));

  // ----------------------------------------------------------
  // Initialization & List Commands
  // ----------------------------------------------------------

  /**
   * Prepare the screen: reset search / filters / paging (the filter widgets start empty, so
   * what you see is what is applied), load the branch options once, select the first branch
   * when none is selected (or the selected one vanished), then load its price table.
   * The previously selected branch is kept between visits. Safe to call every time the page
   * opens — options are not re-requested.
   */
  initialize(): void {
    this._query.set({ pageNumber: 1, pageSize: PAGE_SIZE });

    if (this.branchesLoaded) {
      this.ensureBranchAndLoad();
      return;
    }

    this._branchesLoading.set(true);
    this.branchesService
      .loadOptions()
      .pipe(finalize(() => this._branchesLoading.set(false)))
      .subscribe((options) => {
        // The Branches API lists newest first; the selector reads oldest first so the default
        // ("first branch") is the salon's original branch, not the most recently added one.
        this._branches.set([...options].sort((a, b) => a.id - b.id));
        this.branchesLoaded = true;
        this.ensureBranchAndLoad();
      });
  }

  /**
   * Issue a list request for the current branch + query. Safe to call concurrently: only the
   * latest response may write `services` / `meta` or clear `loading`. A failure sets
   * `hasError` but keeps the previous rows. Does nothing until a branch is selected.
   */
  load(): void {
    const branchId = this._branchId();
    if (branchId === null) return;

    const currentRequest = ++this.requestId;

    this.inFlight?.unsubscribe();
    this._loading.set(true);
    this._hasError.set(false);
    this.inFlight = this.repository
      .getServices({ ...this._query(), branchId })
      .pipe(
        catchError(() => {
          this._hasError.set(true);
          return of(null);
        }),
        finalize(() => {
          if (currentRequest === this.requestId) {
            this._loading.set(false);
          }
        }),
      )
      .subscribe((res) => {
        if (!res) return;
        this._services.set(res.data ?? []);
        this._meta.set(res.meta);
      });
  }

  /**
   * Show another branch's price table. Search and filters are kept, paging restarts at 1,
   * and the previous branch's rows and counts are cleared right away so its prices are never
   * shown under the new branch's name.
   */
  selectBranch(branchId: number): void {
    if (branchId === this._branchId()) return;

    this._branchId.set(branchId);
    this._query.update((q) => ({ ...q, pageNumber: 1 }));
    this._services.set([]);
    this._meta.set(null);
    this.load();
  }

  /**
   * Apply filter changes and reload from page 1 — otherwise a filter that shrinks the result
   * set could strand the user on a page that no longer exists. Pass `undefined` to clear one.
   */
  setFilters(filters: ServiceFilters): void {
    this._query.update((q) => ({ ...q, ...filters, pageNumber: 1 }));
    this.load();
  }

  /** Jump to a page and reload. The pager owns the upper bound; an out-of-range page just returns no rows. */
  setPage(pageNumber: number): void {
    this._query.update((q) => ({ ...q, pageNumber }));
    this.load();
  }

  // ----------------------------------------------------------
  // Detail
  // ----------------------------------------------------------

  /** One service with its price in every branch, or `null` when it can't be loaded. */
  getService(id: number): Observable<ServiceDetails | null> {
    return this.repository.getServiceById(id).pipe(
      map((res) => (res.status ? res.data : null)),
      catchError(() => of(null)),
    );
  }

  /**
   * EVERY service priced in a branch (all pages, 100 at a time) — feeds the "Change prices by %"
   * preview and the "Copy prices" count. Independent of the table's state (it never touches
   * `services` / `meta` / `loading`); a failure yields an empty list.
   */
  loadBranchServices(branchId: number): Observable<ServiceListItem[]> {
    const fetchPage = (
      pageNumber: number,
      loaded: ServiceListItem[],
    ): Observable<ServiceListItem[]> =>
      this.repository
        .getServices({ branchId, pageNumber, pageSize: SERVICES_MAX_PAGE_SIZE })
        .pipe(
          switchMap((res) => {
            const all = [...loaded, ...(res.data ?? [])];
            return res.meta?.hasNextPage ? fetchPage(pageNumber + 1, all) : of(all);
          }),
        );

    return fetchPage(1, []).pipe(
      map((rows) => rows.filter((row) => row.pricing.isPriced)),
      catchError(() => of([])),
    );
  }

  /**
   * The services a package / offer can bundle in a branch: every ACTIVE priced service with the
   * prices and duration the "Before discount" box needs (see {@link toServiceOptions}).
   * Independent of the table's state; a failure yields an empty list.
   */
  loadServiceOptions(branchId: number): Observable<ServiceOption[]> {
    return this.loadBranchServices(branchId).pipe(map(toServiceOptions));
  }

  /**
   * Every branch as a blank, unpriced row (oldest first) for the CREATE form, with the booking
   * types each branch offers so the form can highlight the prices that will be used. Empty when
   * the branches can't be loaded. The branch repository is resolved lazily so the list screen
   * doesn't need it.
   */
  getBranchesForForm(): Observable<ServiceBranchPricing[]> {
    return this.injector
      .get(BRANCH_REPOSITORY)
      .getBranches({ pageNumber: 1, pageSize: 100 })
      .pipe(
        map((res) =>
          [...(res.data ?? [])]
            .sort((a, b) => a.id - b.id)
            .map(
              (b): ServiceBranchPricing => ({
                branchId: b.id,
                branchNameAr: b.nameAr,
                branchNameEn: b.nameEn,
                branchAllowsRegular: b.allowsRegular,
                branchAllowsVip: b.allowsVip,
                branchAllowsHome: b.allowsHome,
                isPriced: false,
                durationMinutes: null,
                regularPrice: null,
                vipPrice: null,
                isHomeAvailable: false,
                homePrice: null,
                isActive: true,
              }),
            ),
        ),
        catchError(() => of([])),
      );
  }

  // ----------------------------------------------------------
  // Mutations
  // ----------------------------------------------------------

  /** Create a service → its new id, or `null` on failure. */
  createService(payload: ServicePayload): Observable<number | null> {
    return this.mutate(
      this.repository.createService(payload),
      "SERVICES.CREATED",
    ).pipe(map((res) => res?.data ?? null));
  }

  /** Replace names and every branch's prices → `true` on success. */
  updateService(id: number, payload: ServicePayload): Observable<boolean> {
    return this.mutate(
      this.repository.updateService(id, payload),
      "SERVICES.UPDATED",
    ).pipe(map((res) => res !== null));
  }

  /**
   * Set (not toggle) the active state of ONE service in several branches → `true` on
   * success; reloads the table (and the summary cards).
   */
  setStatusInBranches(
    id: number,
    branchIds: number[],
    isActive: boolean,
  ): Observable<boolean> {
    const payload: SetServiceStatusRequest = { branchIds, isActive };

    return this.mutate(
      this.repository.setStatusInBranches(id, payload),
      "SERVICES.STATUS_UPDATED",
    ).pipe(
      map((res) => res !== null),
      tap((ok) => ok && this.load()),
    );
  }

  /**
   * Set the active state of SEVERAL services in several branches (one request per service —
   * the contract's status endpoint takes one service). One success toast when every request
   * worked → `true`; a refusal (e.g. the last-active lock) was already explained by the error
   * interceptor, so the result is `false` and the table is reloaded to show what did change.
   */
  setStatusForServices(
    ids: number[],
    branchIds: number[],
    isActive: boolean,
  ): Observable<boolean> {
    const payload: SetServiceStatusRequest = { branchIds, isActive };
    this._saving.set(true);

    return forkJoin(
      ids.map((id) =>
        this.repository.setStatusInBranches(id, payload).pipe(
          map((res) => res.status),
          catchError(() => of(false)),
        ),
      ),
    ).pipe(
      map((results) => results.every(Boolean)),
      tap((ok) => {
        if (ok) this.notify.success("SERVICES.STATUS_UPDATED");
        this.load();
      }),
      finalize(() => this._saving.set(false)),
    );
  }

  /** The row's Active switch: the same endpoint with only the selected branch. */
  setStatusInBranch(
    id: number,
    branchId: number,
    isActive: boolean,
  ): Observable<boolean> {
    return this.setStatusInBranches(id, [branchId], isActive);
  }

  /** Permanently delete services in every branch (all-or-nothing) → `true` on success; reloads the table. */
  remove(ids: number[]): Observable<boolean> {
    const payload: DeleteServicesRequest = { ids };

    return this.mutate(
      this.repository.deleteServices(payload),
      "SERVICES.DELETED",
    ).pipe(
      map((res) => res !== null),
      tap((ok) => ok && this.reloadAfterRemoval(ids.length)),
    );
  }

  /** "Copy prices from another branch" → `true` on success; reloads when the target is the branch on screen. */
  copyPrices(payload: CopyPricesRequest): Observable<boolean> {
    return this.mutate(
      this.repository.copyPrices(payload),
      "SERVICES.PRICES_COPIED",
    ).pipe(
      map((res) => res !== null),
      tap((ok) => ok && payload.targetBranchId === this._branchId() && this.load()),
    );
  }

  /** "Change prices by %" → `true` on success; reloads when it changed the branch on screen. */
  adjustPrices(payload: AdjustPricesRequest): Observable<boolean> {
    return this.mutate(
      this.repository.adjustPrices(payload),
      "SERVICES.PRICES_ADJUSTED",
    ).pipe(
      map((res) => res !== null),
      tap((ok) => ok && payload.branchId === this._branchId() && this.load()),
    );
  }

  // ----------------------------------------------------------
  // Internals
  // ----------------------------------------------------------

  /** Keep a valid selection (first branch by default) and load its table. */
  private ensureBranchAndLoad(): void {
    const options = this._branches();
    const stillThere = options.some((b) => b.id === this._branchId());

    if (!stillThere) {
      this._branchId.set(options[0]?.id ?? null);
      this._query.update((q) => ({ ...q, pageNumber: 1 }));
      this._services.set([]);
      this._meta.set(null);
    }
    this.load();
  }

  /** If the delete emptied the current page, step back one page first so the user isn't stranded. */
  private reloadAfterRemoval(removed: number): void {
    const pageEmptied =
      this._services().length <= removed && this._query().pageNumber > 1;

    if (pageEmptied) {
      this._query.update((q) => ({ ...q, pageNumber: q.pageNumber - 1 }));
    }

    this.load();
  }

  /**
   * Runs a mutation with the `saving` flag, toasts our own i18n success key (the backend
   * message is English-only) and turns every failure into `null`. A `status: false` body
   * counts as a failure too.
   */
  private mutate<T>(
    request: Observable<ApiResponse<T>>,
    successKey: string,
  ): Observable<ApiResponse<T> | null> {
    this._saving.set(true);

    return request.pipe(
      map((res) => {
        if (!res.status) throw new Error(res.message);
        return res;
      }),
      tap(() => this.notify.success(successKey)),
      catchError(() => of(null)),
      finalize(() => this._saving.set(false)),
    );
  }
}
