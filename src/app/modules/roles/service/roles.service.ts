import { computed, inject, Injectable, signal } from "@angular/core";
import { Observable, Subscription, catchError, finalize, map, of, tap } from "rxjs";

import { NotificationService } from "@core/services/notification.service";
import { ApiResponse, PaginationMeta } from "@shared/model/api_response.model";
import { TABLE_PAGE_SIZE } from "@shared/model/pagination.constants";
import { AuthService } from "../../auth/service/auth.service";
import {
  RoleDetails,
  RoleListItem,
  RolesQuery,
  UpdateRolePermissionsRequest,
} from "../model/role.model";
import { ROLE_REPOSITORY } from "../repository/role.repository";

/**
 * RolesService — list state (server-side search + paging) and role mutations.
 * Every mutation resolves to `true/false` so pages can close drawers or stay open
 * on failure; the error interceptor has already told the user what went wrong.
 */
@Injectable({ providedIn: "root" })
export class RolesService {
  private readonly notify = inject(NotificationService);
  private readonly auth = inject(AuthService);

  private readonly repository = inject(ROLE_REPOSITORY);

  private readonly _roles = signal<RoleListItem[]>([]);
  private readonly _meta = signal<PaginationMeta | null>(null);
  private readonly _query = signal<RolesQuery>({
    pageNumber: 1,
    pageSize: TABLE_PAGE_SIZE,
    includePermissions: true,
  });
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

  readonly roles = this._roles.asReadonly();
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
      .getRoles(this._query())
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
        this._roles.set(res.data ?? []);
        this._meta.set(res.meta);
      });
  }

  setSearch(search: string): void {
    this._query.update((q) => ({ ...q, search: search || undefined, pageNumber: 1 }));
    this.load();
  }

  setPage(pageNumber: number): void {
    this._query.update((q) => ({ ...q, pageNumber }));
    this.load();
  }

  /** All roles for dropdowns (user form, user filter). Independent of the list's search/paging. */
  loadOptions(): Observable<Array<{ id: number; name: string }>> {
    return this.repository.getRoles({ pageNumber: 1, pageSize: 100 }).pipe(
      map((res) => (res.data ?? []).map((r) => ({ id: r.id, name: r.name }))),
      catchError(() => of([])),
    );
  }

  // ── Detail ───────────────────────────────────────────
  getRole(id: number): Observable<RoleDetails | null> {
    return this.repository.getRoleById(id).pipe(
      map((res) => (res.status ? res.data : null)),
      catchError(() => of(null)),
    );
  }

  // ── Mutations ────────────────────────────────────────
  createRole(name: string): Observable<boolean> {
    return this.mutate(this.repository.createRole({ name: name.trim() }), "ROLES.CREATED");
  }

  rename(id: number, name: string): Observable<boolean> {
    return this.mutate(this.repository.updateRole(id, { name: name.trim() }), "ROLES.RENAMED");
  }

  /** Saves the permission set. If it belongs to the signed-in user's own role, their session is refreshed. */
  savePermissions(
    id: number,
    roleName: string,
    payload: UpdateRolePermissionsRequest,
  ): Observable<boolean> {
    return this.mutate(
      this.repository.updatePermissions(id, payload),
      "ROLES.PERMISSIONS_SAVED",
    ).pipe(
      tap((ok) => {
        if (ok && this.auth.hasRole(roleName)) this.auth.refreshToken().subscribe();
      }),
    );
  }

  remove(ids: number[]): Observable<boolean> {
    return this.mutate(this.repository.deleteRoles({ ids }), "ROLES.DELETED");
  }

  /**
   * Runs a mutation, toasts a localized success message (our own i18n key — the
   * backend's message is English-only text), and reloads the list on success.
   */
  private mutate(
    request: Observable<ApiResponse<unknown>>,
    successKey: string,
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
      tap((ok) => ok && this.load()),
    );
  }
}
