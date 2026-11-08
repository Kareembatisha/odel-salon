import { Injectable, inject, signal } from "@angular/core";
import { Observable, catchError, finalize, map, of, tap } from "rxjs";

import { environment } from "@env/environment";
import { NotificationService } from "@core/services/notification.service";
import { PaginationMeta } from "@shared/model/api_response.model";
import {
  CreateUserRequest,
  UpdateUserRequest,
  UserDetails,
  UserListItem,
  UsersQuery,
} from "../model/user.model";
import { UserApiRepository } from "../repository/user-api.repository";
import { UserMockRepository } from "../repository/user-mock.repository";
import { IUserRepository } from "../repository/user.repository";

const PAGE_SIZE = 10;

/**
 * UsersService — list state (server-side search, role/status filters, paging)
 * and user mutations. Mutations resolve to true/false; the error interceptor has
 * already told the user what went wrong, so callers only decide what to do next.
 */
@Injectable({ providedIn: "root" })
export class UsersService {
  private readonly notify = inject(NotificationService);

  private readonly repository: IUserRepository = environment.useMock
    ? inject(UserMockRepository)
    : inject(UserApiRepository);

  private readonly _users = signal<UserListItem[]>([]);
  private readonly _meta = signal<PaginationMeta | null>(null);
  private readonly _query = signal<UsersQuery>({ pageNumber: 1, pageSize: PAGE_SIZE });
  private readonly _loading = signal(false);
  private readonly _saving = signal(false);
  private readonly _hasError = signal(false);

  readonly users = this._users.asReadonly();
  readonly meta = this._meta.asReadonly();
  readonly query = this._query.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly hasError = this._hasError.asReadonly();

  // ── List ─────────────────────────────────────────────
  load(): void {
    this._loading.set(true);
    this._hasError.set(false);
    this.repository
      .getUsers(this._query())
      .pipe(
        catchError(() => {
          this._hasError.set(true);
          return of(null);
        }),
        finalize(() => this._loading.set(false)),
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
    return this.repository.getUser(id).pipe(
      map((res) => res.data),
      catchError(() => of(null)),
    );
  }

  // ── Mutations ────────────────────────────────────────
  create(payload: CreateUserRequest): Observable<boolean> {
    return this.mutate(this.repository.createUser(payload), "USERS.CREATED");
  }

  update(id: number, payload: UpdateUserRequest): Observable<boolean> {
    return this.mutate(this.repository.updateUser(id, payload), "USERS.UPDATED");
  }

  toggleStatus(id: number): Observable<boolean> {
    return this.mutate(this.repository.toggleStatus(id), "USERS.STATUS_UPDATED");
  }

  remove(ids: number[]): Observable<boolean> {
    return this.mutate(this.repository.deleteUsers({ ids }), "USERS.DELETED");
  }

  /**
   * Runs a mutation, toasts a localized success message (our own i18n key — the
   * backend's message is English-only text), and reloads the list on success.
   */
  private mutate(request: Observable<unknown>, successKey: string): Observable<boolean> {
    this._saving.set(true);
    return request.pipe(
      tap(() => this.notify.success(successKey)),
      map(() => true),
      catchError(() => of(false)),
      finalize(() => this._saving.set(false)),
      tap((ok) => ok && this.load()),
    );
  }
}
