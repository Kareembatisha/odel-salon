import { Injectable, inject, signal } from "@angular/core";
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
import {
  BranchDetails,
  BranchListItem,
  BranchPayload,
  BranchesQuery,
  DeleteBranchesRequest,
} from "../model/branch.model";
import { BRANCH_REPOSITORY } from "../repository/branch.repository";

// ============================================================
// Constants
// ============================================================

/** Default page size for the branch list. */
const PAGE_SIZE = 12;

// ============================================================
// Service
// ============================================================

/**
 * BranchesService — list state (server-side search, visibility filter, paging)
 * and branch mutations.
 *
 * Owns the query/result/loading signals that back the branch list screen,
 * and re-issues the list request whenever the query changes.
 *
 * Mutations resolve to a plain result (`id`/`true` on success, `null`/`false`
 * on failure). The service toasts a localized success message; failures were
 * already explained by the error interceptor, so callers only decide what to
 * do next (navigate, close a dialog…).
 */
@Injectable({ providedIn: "root" })
export class BranchesService {
  // ----------------------------------------------------------
  // Injected Dependencies
  // ----------------------------------------------------------

  private readonly repository = inject(BRANCH_REPOSITORY);
  private readonly notify = inject(NotificationService);

  // ----------------------------------------------------------
  // Private State
  // ----------------------------------------------------------

  private readonly _branches = signal<BranchListItem[]>([]);
  private readonly _meta = signal<PaginationMeta | null>(null);
  private readonly _query = signal<BranchesQuery>({
    pageNumber: 1,
    pageSize: PAGE_SIZE,
  });
  private readonly _loading = signal(false);
  private readonly _hasError = signal(false);
  private readonly _saving = signal(false);

  /**
   * In-flight list request — a newer one cancels it so a slow, stale
   * response can't overwrite fresh results.
   *
   * Paired with {@link requestId}: the unsubscribe alone stops the late
   * subscription, but `finalize` can still fire for a request that is
   * torn down mid-flight, so the id check is what actually prevents an
   * obsolete request from clearing the current request's `loading` flag.
   */
  private inFlight?: Subscription;
  private requestId = 0;

  // ----------------------------------------------------------
  // Public Read-Only State
  // ----------------------------------------------------------

  readonly branches = this._branches.asReadonly();
  readonly meta = this._meta.asReadonly();
  readonly query = this._query.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly hasError = this._hasError.asReadonly();
  /** A mutation (create / update / toggle / delete) is in flight. */
  readonly saving = this._saving.asReadonly();

  // ----------------------------------------------------------
  // List Commands
  // ----------------------------------------------------------

  /**
   * Issue a list request for the current {@link _query}.
   *
   * Safe to call concurrently: a newer call unsubscribes the previous
   * request and bumps {@link requestId}, so only the latest response is
   * permitted to write `branches` / `meta` or clear `loading`.
   *
   * Errors are swallowed into `hasError` — the previous `branches` and
   * `meta` are intentionally left in place so a transient failure does
   * not blank the screen.
   */
  load(): void {
    const currentRequest = ++this.requestId;

    this.inFlight?.unsubscribe();
    this._loading.set(true);
    this._hasError.set(false);
    this.inFlight = this.repository
      .getBranches(this._query())
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
        this._branches.set(res.data ?? []);
        this._meta.set(res.meta);
      });
  }

  /**
   * Apply filter changes and reload from page 1.
   *
   * Any filter change goes back to page 1 — otherwise a filter that
   * shrinks the result set could strand the user on a page that no
   * longer exists.
   */
  setFilters(
    filters: Partial<Pick<BranchesQuery, "search" | "isVisible">>,
  ): void {
    this._query.update((q) => ({ ...q, ...filters, pageNumber: 1 }));
    this.load();
  }

  /**
   * Jump to a specific page and reload.
   *
   * Does not clamp `pageNumber` against `meta.totalPages` — the caller
   * (typically a pager component) owns that bound. An out-of-range page
   * is a valid request; it simply comes back with empty `data`.
   */
  setPage(pageNumber: number): void {
    this._query.update((q) => ({ ...q, pageNumber }));
    this.load();
  }

  /**
   * Branches for dropdowns (e.g. the chairs filter and form). Independent of the list
   * screen's search / paging / loading state — it never touches those signals.
   * Capped at the API maximum page size (100); a failure yields an empty list.
   */
  loadOptions(): Observable<Array<Pick<BranchListItem, "id" | "nameAr" | "nameEn">>> {
    return this.repository.getBranches({ pageNumber: 1, pageSize: 100 }).pipe(
      map((res) =>
        (res.data ?? []).map((b) => ({ id: b.id, nameAr: b.nameAr, nameEn: b.nameEn })),
      ),
      catchError(() => of([])),
    );
  }

  // ----------------------------------------------------------
  // Detail
  // ----------------------------------------------------------

  /**
   * Fetch a single branch with its working hours.
   *
   * Resolves to `null` when the branch can't be loaded (HTTP error already
   * toasted by the interceptor, or a `status: false` body such as the mock's
   * 404) so pages can show a failed state instead of handling errors.
   */
  getBranch(id: number): Observable<BranchDetails | null> {
    return this.repository.getBranchById(id).pipe(
      map((res) => (res.status ? res.data : null)),
      catchError(() => of(null)),
    );
  }

  // ----------------------------------------------------------
  // Mutations
  // ----------------------------------------------------------

  /**
   * Create a branch → its new id, or `null` on failure.
   *
   * Does not reload the list: the list page resets and reloads itself on
   * entry, and the caller navigates away after a successful save.
   */
  createBranch(payload: BranchPayload): Observable<number | null> {
    return this.mutate(
      this.repository.createBranch(payload),
      "BRANCHES.CREATED",
    ).pipe(map((res) => res?.data ?? null));
  }

  /** Update a branch → `true` on success. Same list-refresh contract as {@link createBranch}. */
  updateBranch(id: number, payload: BranchPayload): Observable<boolean> {
    return this.mutate(
      this.repository.updateBranch(id, payload),
      "BRANCHES.UPDATED",
    ).pipe(map((res) => res !== null));
  }

  /** Show / hide a branch in the app → `true` on success; reloads the list. */
  toggleStatus(id: number): Observable<boolean> {
    return this.mutate(
      this.repository.toggleBranchStatus(id),
      "BRANCHES.STATUS_UPDATED",
    ).pipe(
      map((res) => res !== null),
      tap((ok) => ok && this.load()),
    );
  }

  /** Permanently delete branches (all-or-nothing) → `true` on success; reloads the list. */
  remove(ids: number[]): Observable<boolean> {
    const payload: DeleteBranchesRequest = { ids };

    return this.mutate(
      this.repository.deleteBranches(payload),
      "BRANCHES.DELETED",
    ).pipe(
      map((res) => res !== null),
      tap((ok) => ok && this.reloadAfterRemoval(ids.length)),
    );
  }

  /**
   * Reload after a delete. If it emptied the current page, step back one page
   * first — otherwise the user lands on a page that no longer exists.
   */
  private reloadAfterRemoval(removed: number): void {
    const pageEmptied =
      this._branches().length <= removed && this._query().pageNumber > 1;

    if (pageEmptied) {
      this._query.update((q) => ({ ...q, pageNumber: q.pageNumber - 1 }));
    }

    this.load();
  }

  /**
   * Runs a mutation with the `saving` flag, toasts our own i18n success key
   * (the backend message is English-only), and turns every failure into `null`.
   * A `status: false` body counts as a failure too (the mock answers 404 that way).
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
