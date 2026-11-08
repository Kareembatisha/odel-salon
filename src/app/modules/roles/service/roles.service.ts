import { Injectable, inject, signal } from "@angular/core";
import { Observable, catchError, finalize, map, of, tap } from "rxjs";

import { environment } from "@env/environment";
import { NotificationService } from "@core/services/notification.service";
import { PaginationMeta } from "@shared/model/api_response.model";
import { AuthService } from "../../auth/service/auth.service";
import {
  RoleDetails,
  RoleListItem,
  RolesQuery,
  UpdateRolePermissionsRequest,
} from "../model/role.model";
import { RoleApiRepository } from "../repository/role-api.repository";
import { RoleMockRepository } from "../repository/role-mock.repository";
import { IRoleRepository } from "../repository/role.repository";

const PAGE_SIZE = 10;

/**
 * RolesService — list state (server-side search + paging) and role mutations.
 * Every mutation resolves to `true/false` so pages can close drawers or stay open
 * on failure; the error interceptor has already told the user what went wrong.
 */
@Injectable({ providedIn: "root" })
export class RolesService {
  private readonly notify = inject(NotificationService);
  private readonly auth = inject(AuthService);

  private readonly repository: IRoleRepository = environment.useMock
    ? inject(RoleMockRepository)
    : inject(RoleApiRepository);

  private readonly _roles = signal<RoleListItem[]>([]);
  private readonly _meta = signal<PaginationMeta | null>(null);
  private readonly _query = signal<RolesQuery>({
    pageNumber: 1,
    pageSize: PAGE_SIZE,
    includePermissions: true,
  });
  private readonly _loading = signal(false);
  private readonly _saving = signal(false);
  private readonly _hasError = signal(false);

  readonly roles = this._roles.asReadonly();
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
      .getRoles(this._query())
      .pipe(
        catchError(() => {
          this._hasError.set(true);
          return of(null);
        }),
        finalize(() => this._loading.set(false)),
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
    return this.repository.getRole(id).pipe(
      map((res) => res.data),
      catchError(() => of(null)),
    );
  }

  // ── Mutations ────────────────────────────────────────
  create(name: string): Observable<boolean> {
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
