import { Injectable, inject, signal } from "@angular/core";
import { Observable, Subscription, catchError, finalize, of } from "rxjs";

import { ApiResponse, PaginationMeta } from "@shared/model/api_response.model";
import {
  BranchDetails,
  BranchListItem,
  BranchPayload,
  BranchesQuery,
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
 * BranchesService — list state (server-side search, visibility filter, paging).
 *
 * Phase 1 is read-only; mutations arrive with their phases.
 *
 * Owns the query/result/loading signals that back the branch list screen,
 * and re-issues the list request whenever the query changes. Single-branch
 * reads and mutations are thin pass-throughs to {@link BRANCH_REPOSITORY},
 * exposed here only so consumers depend on a single facade rather than
 * reaching for the repository directly.
 */
@Injectable({ providedIn: "root" })
export class BranchesService {
  // ----------------------------------------------------------
  // Injected Dependencies
  // ----------------------------------------------------------

  private readonly repository = inject(BRANCH_REPOSITORY);

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

  // ----------------------------------------------------------
  // Repository Pass-Throughs
  // ----------------------------------------------------------

  /**
   * Fetch a single branch by id.
   *
   * Error handling is the repository's concern — this method does not
   * wrap or translate failures, so callers observe whatever the active
   * implementation emits.
   */
  getBranchById(id: number): Observable<ApiResponse<BranchDetails>> {
    return this.repository.getBranchById(id);
  }

  /**
   * Create a branch and return its new id.
   *
   * Does **not** refresh the list — the caller is expected to call
   * {@link load} (or navigate back to the list) after a successful save.
   */
  createBranch(payload: BranchPayload): Observable<ApiResponse<number>> {
    return this.repository.createBranch(payload);
  }

  /**
   * Update a branch.
   *
   * Does **not** refresh the list — see {@link createBranch} for the
   * refresh contract.
   */
  updateBranch(
    id: number,
    payload: BranchPayload,
  ): Observable<ApiResponse<null>> {
    return this.repository.updateBranch(id, payload);
  }
}
