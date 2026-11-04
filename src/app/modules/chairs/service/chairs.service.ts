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
import {
  ChairDetails,
  ChairListItem,
  ChairsQuery,
  CreateChairPayload,
  DeleteChairsRequest,
  UpdateChairPayload,
} from "../model/chair.model";
import { CHAIR_REPOSITORY } from "../repository/chair.repository";
import { readChairsSummary } from "../utils/chair-summary.util";

// ============================================================
// Constants
// ============================================================

/** Default page size for the chairs card grid (same as the Branches grid). */
const PAGE_SIZE = 12;

/** Filters the list screen can change (everything in the query except paging). */
export type ChairFilters = Partial<
  Pick<ChairsQuery, "search" | "branchId" | "type" | "isActive">
>;

// ============================================================
// Service
// ============================================================

/**
 * ChairsService — list state (server-side search, branch / type / status filters,
 * paging, summary counts) and chair mutations.
 *
 * Owns the query/result/loading signals behind the chairs screen and re-issues the
 * list request whenever the query changes.
 *
 * Mutations resolve to a plain result (`id` / `true` on success, `null` / `false`
 * on failure). The service toasts a localized success message; failures were already
 * explained by the error interceptor (400 / 403 / 404 / 409), so callers only decide
 * what to do next (close the drawer, clear the selection…).
 *
 * Unlike Branches, create / edit happen in a drawer on the list page itself, so every
 * successful mutation reloads the list (and with it the summary cards).
 */
@Injectable({ providedIn: "root" })
export class ChairsService {
  // ----------------------------------------------------------
  // Injected Dependencies
  // ----------------------------------------------------------

  private readonly repository = inject(CHAIR_REPOSITORY);
  private readonly notify = inject(NotificationService);

  // ----------------------------------------------------------
  // Private State
  // ----------------------------------------------------------

  private readonly _chairs = signal<ChairListItem[]>([]);
  private readonly _meta = signal<PaginationMeta | null>(null);
  private readonly _query = signal<ChairsQuery>({
    pageNumber: 1,
    pageSize: PAGE_SIZE,
  });
  private readonly _loading = signal(false);
  private readonly _hasError = signal(false);
  private readonly _saving = signal(false);

  /**
   * In-flight list request — a newer one cancels it so a slow, stale response can't
   * overwrite fresh results. Paired with {@link requestId}: the id check is what stops
   * an obsolete request's `finalize` from clearing the current request's `loading` flag.
   */
  private inFlight?: Subscription;
  private requestId = 0;

  // ----------------------------------------------------------
  // Public Read-Only State
  // ----------------------------------------------------------

  readonly chairs = this._chairs.asReadonly();
  readonly meta = this._meta.asReadonly();
  readonly query = this._query.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly hasError = this._hasError.asReadonly();
  /** A mutation (create / update / toggle / delete) is in flight. */
  readonly saving = this._saving.asReadonly();

  /**
   * The three summary cards. Counted by the backend over the selected branch (or all
   * branches) and independent of the type / status / search filters.
   */
  readonly summary = computed(() => readChairsSummary(this._meta()));

  // ----------------------------------------------------------
  // List Commands
  // ----------------------------------------------------------

  /**
   * Issue a list request for the current query. Safe to call concurrently: only the
   * latest response may write `chairs` / `meta` or clear `loading`. A failure sets
   * `hasError` but keeps the previous rows so a transient error doesn't blank the screen.
   */
  load(): void {
    const currentRequest = ++this.requestId;

    this.inFlight?.unsubscribe();
    this._loading.set(true);
    this._hasError.set(false);
    this.inFlight = this.repository
      .getChairs(this._query())
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
        this._chairs.set(res.data ?? []);
        this._meta.set(res.meta);
      });
  }

  /**
   * Apply filter changes and reload from page 1 — otherwise a filter that shrinks the
   * result set could strand the user on a page that no longer exists.
   * Pass `undefined` to clear a filter.
   */
  setFilters(filters: ChairFilters): void {
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

  /** One chair, or `null` when it can't be loaded (error already toasted / `status: false` body). */
  getChair(id: number): Observable<ChairDetails | null> {
    return this.repository.getChairById(id).pipe(
      map((res) => (res.status ? res.data : null)),
      catchError(() => of(null)),
    );
  }

  // ----------------------------------------------------------
  // Mutations
  // ----------------------------------------------------------

  /** Create a chair → its new id, or `null` on failure; reloads the list. */
  createChair(payload: CreateChairPayload): Observable<number | null> {
    return this.mutate(
      this.repository.createChair(payload),
      "CHAIRS.CREATED",
    ).pipe(
      map((res) => res?.data ?? null),
      tap((id) => id !== null && this.load()),
    );
  }

  /** Rename / change type → `true` on success; reloads the list. */
  updateChair(id: number, payload: UpdateChairPayload): Observable<boolean> {
    return this.mutate(
      this.repository.updateChair(id, payload),
      "CHAIRS.UPDATED",
    ).pipe(
      map((res) => res !== null),
      tap((ok) => ok && this.load()),
    );
  }

  /** Activate / deactivate → `true` on success; reloads the list (and the summary cards). */
  toggleStatus(id: number): Observable<boolean> {
    return this.mutate(
      this.repository.toggleChairStatus(id),
      "CHAIRS.STATUS_UPDATED",
    ).pipe(
      map((res) => res !== null),
      tap((ok) => ok && this.load()),
    );
  }

  /** Permanently delete chairs (all-or-nothing) → `true` on success; reloads the list. */
  remove(ids: number[]): Observable<boolean> {
    const payload: DeleteChairsRequest = { ids };

    return this.mutate(
      this.repository.deleteChairs(payload),
      "CHAIRS.DELETED",
    ).pipe(
      map((res) => res !== null),
      tap((ok) => ok && this.reloadAfterRemoval(ids.length)),
    );
  }

  /** If the delete emptied the current page, step back one page first so the user isn't stranded. */
  private reloadAfterRemoval(removed: number): void {
    const pageEmptied =
      this._chairs().length <= removed && this._query().pageNumber > 1;

    if (pageEmptied) {
      this._query.update((q) => ({ ...q, pageNumber: q.pageNumber - 1 }));
    }

    this.load();
  }

  /**
   * Runs a mutation with the `saving` flag, toasts our own i18n success key (the
   * backend message is English-only) and turns every failure into `null`.
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
