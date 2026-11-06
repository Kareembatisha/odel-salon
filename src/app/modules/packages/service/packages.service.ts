import { Injectable, computed, inject, signal } from "@angular/core";
import {
  Observable,
  Subscription,
  catchError,
  finalize,
  map,
  of,
  tap,
} from "rxjs";

import { NotificationService } from "@core/services/notification.service";
import { ApiResponse, PaginationMeta } from "@shared/model/api_response.model";
import { BranchListItem } from "@modules/branches/model/branch.model";
import { BranchesService } from "@modules/branches/service/branches.service";
import { ServicesService } from "@modules/services/service/services.service";
import {
  CreatePackagePayload,
  DeletePackagesRequest,
  PackageDetails,
  PackageListItem,
  PackageServiceOption,
  PackagesQuery,
  UpdatePackagePayload,
} from "../model/package.model";
import { PACKAGE_REPOSITORY } from "../repository/package.repository";
import { readPackagesSummary } from "../utils/package-summary.util";

// ============================================================
// Constants
// ============================================================

/** Default page size for the packages card grid (same as the Chairs / Branches grid). */
const PAGE_SIZE = 12;

/** A branch as the selector and the form need it. */
export type PackageBranchOption = Pick<BranchListItem, "id" | "nameAr" | "nameEn">;

/** Filters the list screen can change (everything in the query except branch and paging). */
export type PackageFilters = Partial<Pick<PackagesQuery, "search" | "isActive">>;

type ListQuery = Omit<PackagesQuery, "branchId">;

// ============================================================
// Service
// ============================================================

/**
 * PackagesService — state of the Packages screen: the branch selector, the packages of the
 * selected branch (server-side search / status filter / paging), the summary counts, and
 * every package mutation.
 *
 * The API lists the packages of ONE branch at a time, so the list needs a branch.
 * {@link initialize} loads the branch options and selects the FIRST branch by default;
 * there is no "all branches" view (same as Services).
 *
 * Mutations resolve to a plain result (`id` / `true` on success, `null` / `false` on
 * failure). The service toasts a localized success message; failures were already
 * explained by the error interceptor (400 / 403 / 404), so callers only decide what to do
 * next (close the drawer, clear the selection…).
 *
 * Like Chairs, create / edit happen in a drawer on the list page itself, so every
 * successful mutation reloads the list (and with it the summary cards).
 */
@Injectable({ providedIn: "root" })
export class PackagesService {
  // ----------------------------------------------------------
  // Injected Dependencies
  // ----------------------------------------------------------

  private readonly repository = inject(PACKAGE_REPOSITORY);
  private readonly branchesService = inject(BranchesService);
  private readonly servicesService = inject(ServicesService);
  private readonly notify = inject(NotificationService);

  // ----------------------------------------------------------
  // Private State
  // ----------------------------------------------------------

  private readonly _packages = signal<PackageListItem[]>([]);
  private readonly _meta = signal<PaginationMeta | null>(null);
  private readonly _branches = signal<PackageBranchOption[]>([]);
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

  readonly packages = this._packages.asReadonly();
  readonly meta = this._meta.asReadonly();
  /** Branches for the selector, oldest first (ascending id). */
  readonly branches = this._branches.asReadonly();
  /** The branch whose packages are shown; `null` until the options load (or if there are none). */
  readonly branchId = this._branchId.asReadonly();
  readonly query = this._query.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly branchesLoading = this._branchesLoading.asReadonly();
  readonly hasError = this._hasError.asReadonly();
  /** A mutation (create / update / toggle / delete) is in flight. */
  readonly saving = this._saving.asReadonly();

  /** The selected branch option, if any. */
  readonly selectedBranch = computed(
    () => this._branches().find((b) => b.id === this._branchId()) ?? null,
  );

  /** Options loaded, but the salon has no branches — nothing can be packaged yet. */
  readonly noBranches = computed(
    () =>
      !this._branchesLoading() &&
      this.branchesLoaded &&
      this._branches().length === 0,
  );

  /**
   * The summary cards. Counted by the backend over the WHOLE selected branch and
   * independent of the search / status filters.
   */
  readonly summary = computed(() => readPackagesSummary(this._meta()));

  // ----------------------------------------------------------
  // Initialization & List Commands
  // ----------------------------------------------------------

  /**
   * Prepare the screen: reset search / filters / paging (the filter widgets start empty, so
   * what you see is what is applied), load the branch options once, select the first branch
   * when none is selected (or the selected one vanished), then load its packages.
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
   * latest response may write `packages` / `meta` or clear `loading`. A failure sets
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
      .getPackages({ ...this._query(), branchId })
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
        this._packages.set(res.data ?? []);
        this._meta.set(res.meta);
      });
  }

  /**
   * Show another branch's packages. Search and filters are kept, paging restarts at 1, and
   * the previous branch's rows and counts are cleared right away so they are never shown
   * under the new branch's name.
   */
  selectBranch(branchId: number): void {
    if (branchId === this._branchId()) return;

    this._branchId.set(branchId);
    this._query.update((q) => ({ ...q, pageNumber: 1 }));
    this._packages.set([]);
    this._meta.set(null);
    this.load();
  }

  /**
   * Apply filter changes and reload from page 1 — otherwise a filter that shrinks the result
   * set could strand the user on a page that no longer exists. Pass `undefined` to clear one.
   */
  setFilters(filters: PackageFilters): void {
    this._query.update((q) => ({ ...q, ...filters, pageNumber: 1 }));
    this.load();
  }

  /** Jump to a page and reload. The pager owns the upper bound; an out-of-range page just returns no rows. */
  setPage(pageNumber: number): void {
    this._query.update((q) => ({ ...q, pageNumber }));
    this.load();
  }

  // ----------------------------------------------------------
  // Detail & form data
  // ----------------------------------------------------------

  /** One package, or `null` when it can't be loaded (error already toasted / `status: false` body). */
  getPackage(id: number): Observable<PackageDetails | null> {
    return this.repository.getPackageById(id).pipe(
      map((res) => (res.status ? res.data : null)),
      catchError(() => of(null)),
    );
  }

  /**
   * The services the form can pick for a branch: every ACTIVE service priced there, oldest
   * first, with the prices and duration the "Before discount" box needs. Independent of the
   * list state; a failure yields an empty list.
   */
  loadServiceOptions(branchId: number): Observable<PackageServiceOption[]> {
    return this.servicesService.loadBranchServices(branchId).pipe(
      map((rows) =>
        rows
          .filter((row) => row.pricing.isActive)
          .map(
            (row): PackageServiceOption => ({
              id: row.id,
              nameAr: row.nameAr,
              nameEn: row.nameEn,
              durationMinutes: row.pricing.durationMinutes ?? 0,
              regularPrice: row.pricing.regularPrice ?? 0,
              vipPrice: row.pricing.vipPrice ?? 0,
              isHomeAvailable: row.pricing.isHomeAvailable,
              homePrice: row.pricing.isHomeAvailable
                ? row.pricing.homePrice
                : null,
            }),
          )
          .sort((a, b) => a.id - b.id),
      ),
    );
  }

  // ----------------------------------------------------------
  // Mutations
  // ----------------------------------------------------------

  /** Create a package → its new id, or `null` on failure; reloads the list. */
  createPackage(payload: CreatePackagePayload): Observable<number | null> {
    return this.mutate(
      this.repository.createPackage(payload),
      "PACKAGES.CREATED",
    ).pipe(
      map((res) => res?.data ?? null),
      tap((id) => id !== null && this.load()),
    );
  }

  /** Update names, services and prices → `true` on success; reloads the list. */
  updatePackage(id: number, payload: UpdatePackagePayload): Observable<boolean> {
    return this.mutate(
      this.repository.updatePackage(id, payload),
      "PACKAGES.UPDATED",
    ).pipe(
      map((res) => res !== null),
      tap((ok) => ok && this.load()),
    );
  }

  /**
   * Activate / deactivate → `true` on success; reloads the list (and the summary cards).
   * Re-activating can be refused (a service is no longer active, or no longer home-available).
   */
  toggleStatus(id: number): Observable<boolean> {
    return this.mutate(
      this.repository.togglePackageStatus(id),
      "PACKAGES.STATUS_UPDATED",
    ).pipe(
      map((res) => res !== null),
      tap((ok) => ok && this.load()),
    );
  }

  /** Permanently delete packages (all-or-nothing) → `true` on success; reloads the list. */
  remove(ids: number[]): Observable<boolean> {
    const payload: DeletePackagesRequest = { ids };

    return this.mutate(
      this.repository.deletePackages(payload),
      "PACKAGES.DELETED",
    ).pipe(
      map((res) => res !== null),
      tap((ok) => ok && this.reloadAfterRemoval(ids.length)),
    );
  }

  // ----------------------------------------------------------
  // Internals
  // ----------------------------------------------------------

  /** Keep the selected branch if it still exists, else fall back to the first one; then load. */
  private ensureBranchAndLoad(): void {
    const options = this._branches();
    const stillThere = options.some((b) => b.id === this._branchId());

    if (!stillThere) {
      this._branchId.set(options[0]?.id ?? null);
      this._query.update((q) => ({ ...q, pageNumber: 1 }));
      this._packages.set([]);
      this._meta.set(null);
    }
    this.load();
  }

  /** If the delete emptied the current page, step back one page first so the user isn't stranded. */
  private reloadAfterRemoval(removed: number): void {
    const pageEmptied =
      this._packages().length <= removed && this._query().pageNumber > 1;

    if (pageEmptied) {
      this._query.update((q) => ({ ...q, pageNumber: q.pageNumber - 1 }));
    }

    this.load();
  }

  /**
   * Runs a mutation with the `saving` flag, toasts our own i18n success key (the backend
   * message is English-only) and turns every failure into `null`.
   * A `status: false` body counts as a failure too.
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
