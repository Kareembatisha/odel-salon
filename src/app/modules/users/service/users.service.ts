import { computed, inject, Injectable, signal } from "@angular/core";
import { Observable, Subscription, catchError, finalize, map, of, tap } from "rxjs";

import { NotificationService } from "@core/services/notification.service";
import { ApiResponse, PaginationMeta } from "@shared/model/api_response.model";
import { TABLE_PAGE_SIZE } from "@shared/model/pagination.constants";
import {
  CreateUserPayload,
  UpdateUserPayload,
  UserDetails,
  UserListItem,
  UsersQuery,
} from "../model/user.model";
import { USER_REPOSITORY } from "../repository/user.repository";

/**
 * UsersService — list state (server-side search, role/status filters, paging)
 * and user mutations. Mutations resolve to true/false; the error interceptor has
 * already told the user what went wrong, so callers only decide what to do next.
 */
@Injectable({ providedIn: "root" })
export class UsersService {
  private readonly notify = inject(NotificationService);

  private readonly repository = inject(USER_REPOSITORY);

  private readonly _users = signal<UserListItem[]>([]);
  private readonly _meta = signal<PaginationMeta | null>(null);
  private readonly _query = signal<UsersQuery>({ pageNumber: 1, pageSize: TABLE_PAGE_SIZE });
  private readonly _loading = signal(false);
  /** Mutations in flight. A counter (not a boolean) so one finishing can't clear `saving` while another is still running. */
  private readonly pendingMutations = signal(0);
  private readonly _hasError = signal(false);

  /**
   * In-flight list request — a newer one cancels it so a slow, stale response can't overwrite
   * fresh results; the id check stops an obsolete request's `finalize` from clearing `loading`.
   */
  private inFlight?: Subscription;
  private requestId = 0;

  readonly users = this._users.asReadonly();
  readonly meta = this._meta.asReadonly();
  readonly query = this._query.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = computed(() => this.pendingMutations() > 0);
  readonly hasError = this._hasError.asReadonly();

  // ── List ─────────────────────────────────────────────
  load(): void {
    const currentRequest = ++this.requestId;

    this.inFlight?.unsubscribe();
    this._loading.set(true);
    this._hasError.set(false);
    this.inFlight = this.repository
      .getUsers(this._query())
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
        this._users.set(res.data ?? []);
        this._meta.set(res.meta);
      });
  }

  /** Any filter change goes back to page 1. */
  setFilters(filters: Partial<Pick<UsersQuery, "search" | "roleId" | "status">>): void {
    this._query.update((q) => ({ ...q, ...filters, pageNumber: 1 }));
    this.load();
  }

  setPage(pageNumber: number): void {
    this._query.update((q) => ({ ...q, pageNumber }));
    this.load();
  }

  // ── Detail ───────────────────────────────────────────
  getUser(id: number): Observable<UserDetails | null> {
    return this.repository.getUserById(id).pipe(
      map((res) => (res.status ? res.data : null)),
      catchError(() => of(null)),
    );
  }

  // ── Mutations ────────────────────────────────────────
  createUser(payload: CreateUserPayload): Observable<boolean> {
    return this.mutate(this.repository.createUser(payload), "USERS.CREATED");
  }

  updateUser(id: number, payload: UpdateUserPayload): Observable<boolean> {
    return this.mutate(this.repository.updateUser(id, payload), "USERS.UPDATED");
  }

  toggleStatus(id: number): Observable<boolean> {
    return this.mutate(this.repository.toggleUserStatus(id), "USERS.STATUS_UPDATED");
  }

  remove(ids: number[]): Observable<boolean> {
    return this.mutate(this.repository.deleteUsers({ ids }), "USERS.DELETED", () =>
      this.reloadAfterRemoval(ids.length),
    );
  }

  /** If the delete emptied the current page, step back one page first so the user isn't stranded. */
  private reloadAfterRemoval(removed: number): void {
    const pageEmptied = this._users().length <= removed && this._query().pageNumber > 1;

    if (pageEmptied) {
      this._query.update((q) => ({ ...q, pageNumber: q.pageNumber - 1 }));
    }

    this.load();
  }

  /**
   * Runs a mutation, toasts a localized success message (our own i18n key — the
   * backend's message is English-only text), and reloads the list on success
   * (`afterSuccess` lets a caller reload differently, e.g. after a delete).
   */
  private mutate(
    request: Observable<ApiResponse<unknown>>,
    successKey: string,
    afterSuccess: () => void = () => this.load(),
  ): Observable<boolean> {
    this.pendingMutations.update((n) => n + 1);
    return request.pipe(
      map((res) => {
        if (!res.status) throw new Error(res.message);
        return true;
      }),
      tap(() => this.notify.success(successKey)),
      catchError(() => of(false)),
      finalize(() => this.pendingMutations.update((n) => n - 1)),
      tap((ok) => ok && afterSuccess()),
    );
  }
}
