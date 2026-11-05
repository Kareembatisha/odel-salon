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
  BarberDetails,
  BarberListItem,
  BarbersQuery,
  CreateBarberPayload,
  DeleteBarbersRequest,
  UpdateBarberPayload,
} from "../model/barber.model";
import { BARBER_REPOSITORY } from "../repository/barber.repository";

// ============================================================
// Constants
// ============================================================

/** Default page size for the barbers table (same as Users). */
const PAGE_SIZE = 10;

/** Filters the list screen can change (everything in the query except paging). */
export type BarberFilters = Partial<
  Pick<BarbersQuery, "search" | "branchId" | "isActive">
>;

// ============================================================
// Service
// ============================================================

/**
 * BarbersService — list state (server-side search, branch / status filters, paging)
 * and barber mutations.
 *
 * Owns the query / result / loading signals behind the barbers screen and re-issues
 * the list request whenever the query changes.
 *
 * Mutations resolve to a plain result (`id` / `true` on success, `null` / `false` on
 * failure). The service toasts a localized success message; failures were already
 * explained by the error interceptor (400 / 403 / 404 / 409), so callers only decide
 * what to do next (close the drawer, clear the selection…).
 *
 * Create / edit happen in a drawer on the list page itself, so every successful
 * mutation reloads the list.
 */
@Injectable({ providedIn: "root" })
export class BarbersService {
  private readonly repository = inject(BARBER_REPOSITORY);
  private readonly notify = inject(NotificationService);

  private readonly _barbers = signal<BarberListItem[]>([]);
  private readonly _meta = signal<PaginationMeta | null>(null);
  private readonly _query = signal<BarbersQuery>({
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

  readonly barbers = this._barbers.asReadonly();
  readonly meta = this._meta.asReadonly();
  readonly query = this._query.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly hasError = this._hasError.asReadonly();
  /** A mutation (create / update / toggle / delete) is in flight. */
  readonly saving = this._saving.asReadonly();

  /** Total matches for the current filters (0 before the first response). */
  readonly totalCount = computed(() => this._meta()?.totalCount ?? 0);

  // ----------------------------------------------------------
  // List Commands
  // ----------------------------------------------------------

  /**
   * Issue a list request for the current query. Safe to call concurrently: only the
   * latest response may write `barbers` / `meta` or clear `loading`. A failure sets
   * `hasError` but keeps the previous rows so a transient error doesn't blank the screen.
   */
  load(): void {
    const currentRequest = ++this.requestId;

    this.inFlight?.unsubscribe();
    this._loading.set(true);
    this._hasError.set(false);
    this.inFlight = this.repository
      .getBarbers(this._query())
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
        this._barbers.set(res.data ?? []);
        this._meta.set(res.meta);
      });
  }

  /**
   * Apply filter changes and reload from page 1 — otherwise a filter that shrinks the
   * result set could strand the user on a page that no longer exists.
   * Pass `undefined` to clear a filter.
   */
  setFilters(filters: BarberFilters): void {
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

  /** One barber, or `null` when it can't be loaded (error already toasted / `status: false` body). */
  getBarber(id: number): Observable<BarberDetails | null> {
    return this.repository.getBarberById(id).pipe(
      map((res) => (res.status ? res.data : null)),
      catchError(() => of(null)),
    );
  }

  // ----------------------------------------------------------
  // Mutations
  // ----------------------------------------------------------

  /** Create a barber → its new id, or `null` on failure; reloads the list. */
  createBarber(payload: CreateBarberPayload): Observable<number | null> {
    return this.mutate(
      this.repository.createBarber(payload),
      "BARBERS.CREATED",
    ).pipe(
      map((res) => res?.data ?? null),
      tap((id) => id !== null && this.load()),
    );
  }

  /** Edit / replace or remove the photo / transfer branch → `true` on success; reloads the list. */
  updateBarber(id: number, payload: UpdateBarberPayload): Observable<boolean> {
    return this.mutate(
      this.repository.updateBarber(id, payload),
      "BARBERS.UPDATED",
    ).pipe(
      map((res) => res !== null),
      tap((ok) => ok && this.load()),
    );
  }

  /**
   * Suspend / activate → `true` on success; reloads the list. The toast says which way it
   * went (read from the row on screen before the flip); suspending the last active barber of
   * a visible branch is refused by the backend with a 409 the interceptor already showed.
   */
  toggleStatus(id: number): Observable<boolean> {
    const row = this._barbers().find((b) => b.id === id);
    const key = !row
      ? "BARBERS.STATUS_UPDATED"
      : row.isActive
        ? "BARBERS.SUSPENDED"
        : "BARBERS.ACTIVATED";

    return this.mutate(this.repository.toggleBarberStatus(id), key).pipe(
      map((res) => res !== null),
      tap((ok) => ok && this.load()),
    );
  }

  /** Permanently delete one or more barbers (all-or-nothing) → `true` on success; reloads the list. */
  remove(ids: number[]): Observable<boolean> {
    const payload: DeleteBarbersRequest = { ids };

    return this.mutate(
      this.repository.deleteBarbers(payload),
      ids.length === 1 ? "BARBERS.DELETED" : "BARBERS.DELETED_MANY",
    ).pipe(
      map((res) => res !== null),
      tap((ok) => ok && this.reloadAfterRemoval(ids.length)),
    );
  }

  /** If the delete emptied the current page, step back one page first so the user isn't stranded. */
  private reloadAfterRemoval(removed: number): void {
    const pageEmptied =
      this._barbers().length <= removed && this._query().pageNumber > 1;

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
