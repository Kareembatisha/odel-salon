import { Injectable, computed, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { Observable, catchError, finalize, map, of, tap } from "rxjs";

import { environment } from "@env/environment";
import { ApiResponse } from "@shared/model/api_response.model";
import { NotificationService } from "@core/services/notification.service";

import {
  AuthUser,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  LoginRequest,
  ResetPasswordRequest,
  VerifyPasswordCodeRequest,
} from "../model/auth.model";
import { AuthApiRepository } from "../repository/auth-api.repository";
import { AuthMockRepository } from "../repository/auth-mock.repository";
import { IAuthRepository } from "../repository/auth.repository";

const ACCESS_TOKEN_KEY = "odl_access_token";
const REFRESH_TOKEN_KEY = "odl_refresh_token";
const USER_KEY = "odl_user";
const ROLE_KEY = "odl_role";
const PERMISSIONS_KEY = "odl_permissions";

/**
 * AuthService
 *
 * Owns all authentication business logic and state for the Auth feature.
 * Pages never talk to a repository directly — they inject this service,
 * call its methods, and read its signals.
 *
 * Repository selection:
 *   `environment.useMock` decides, once, which IAuthRepository
 *   implementation this service delegates to (real HTTP vs mock data).
 *   Swapping environments is the only thing pages/components ever need —
 *   nothing else in the call chain changes.
 *
 * State management: Angular signals (no NgRx/Rxjs store needed for this
 * scope). Pages read `loading()`, `currentUser()`, etc.
 * directly in templates.
 */
@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly notify = inject(NotificationService);
  private readonly apiRepository = inject(AuthApiRepository);
  private readonly mockRepository = inject(AuthMockRepository);
  private readonly router = inject(Router);

  /** Single flag drives which repository implementation is used everywhere. */
  private readonly repository: IAuthRepository = environment.useMock
    ? this.mockRepository
    : this.apiRepository;

  // ── State (signals) ──────────────────────────────────────────────────────
  private readonly _loading = signal(false);
  private readonly _hasError = signal(false);
  private readonly _currentUser = signal<AuthUser | null>(null);
  private readonly _role = signal<string | null>(null);
  private readonly _permissions = signal<string[]>([]);

  // UI state signals - exposed as readonly for components
  readonly loading = this._loading.asReadonly();
  readonly hasError = this._hasError.asReadonly();

  // Business state signals
  readonly currentUser = this._currentUser.asReadonly();
  readonly role = this._role.asReadonly();
  readonly permissions = this._permissions.asReadonly();
  readonly isAuthenticated = computed(() => !!this._currentUser());

  constructor() {
    this.restoreSession();
    this.setupCrossTabSync();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /** POST /login */
  login(payload: LoginRequest): Observable<boolean> {
    this.beginRequest();

    return this.repository.login(payload).pipe(
      map((res) => {
        const data = res.data;
        // A truthy HTTP response isn't the same thing as "we actually got
        // a session back" — mapToSuccessFlag() would have reported this
        // as success even with no data, sending the caller to /main with
        // no user/role/permissions ever set (isAuthenticated() false, then
        // immediately bounced by the route guard).
        if (!data) {
          this._hasError.set(true);
          return false;
        }
        this.persistTokens(data.tokens.accessToken, data.tokens.refreshToken);
        this.persistSession(data.user, data.role, data.permissions);
        this._currentUser.set(data.user);
        this._role.set(data.role);
        this._permissions.set(data.permissions);
        this._hasError.set(false);
        this.notify.success(res.message ?? "AUTH.LOGIN_SUCCESS");
        return true;
      }),
      catchError(() => {
        this._hasError.set(true);
        return of(false);
      }),
      finalize(() => this._loading.set(false)),
    );
  }

  /** POST /auth/logout */
  logout(): Observable<boolean> {
    const refreshToken = this.getStoredRefreshToken();
    this.beginRequest();

    if (!refreshToken) {
      this.clearSession();
      this._loading.set(false);
      this._hasError.set(false);
      return of(true);
    }

    return this.repository.logout({ refreshToken }).pipe(
      tap((res) => {
        this.clearSession();
        this._hasError.set(false);
        this.notify.success(res.message ?? "AUTH.LOGOUT_SUCCESS");
      }),
      this.mapToSuccessFlag(),
    );
  }

  /** POST /auth/refresh-token */
  refreshToken(): Observable<boolean> {
    const refreshToken = this.getStoredRefreshToken();
    if (!refreshToken) {
      this._hasError.set(true);
      return of(false);
    }

    this.beginRequest();
    return this.repository.refreshToken({ refreshToken }).pipe(
      map((res) => {
        // Same class of bug as login(): mapToSuccessFlag() would report
        // success on any non-throwing response, even one with no new
        // accessToken. A caller (e.g. a future 401-retry interceptor)
        // trusting that boolean would retry the original request with the
        // same stale, already-expired token — an infinite 401 loop instead
        // of a clean logout.
        if (!res.data?.accessToken) {
          this._hasError.set(true);
          return false;
        }
        this.persistTokens(res.data.accessToken, res.data.refreshToken);
        // The refresh response now carries the current role/permissions too
        // (e.g. an admin edited this user's role since they last logged in)
        // -- keep localStorage + in-memory signals in sync, same as login().
        this.persistRoleAndPermissions(res.data.role, res.data.permissions);
        this._role.set(res.data.role);
        this._permissions.set(res.data.permissions);
        this._hasError.set(false);
        return true;
      }),
      catchError(() => {
        this._hasError.set(true);
        return of(false);
      }),
      finalize(() => this._loading.set(false)),
    );
  }

  /**
   * PATCH /auth/password/change (signed-in user).
   * The session is kept: the contract doesn't say the backend revokes tokens
   * on a password change. If it does, the next request 401s and the error
   * interceptor signs the user out cleanly.
   */
  changePassword(payload: ChangePasswordRequest): Observable<boolean> {
    this.beginRequest();
    return this.repository.changePassword(payload).pipe(
      tap((res) => {
        this._hasError.set(false);
        this.notify.success(res.message ?? "PROFILE.PASSWORD_CHANGED");
      }),
      this.mapToSuccessFlag(),
    );
  }

  /** POST /auth/password/forgot */
  forgotPassword(payload: ForgotPasswordRequest): Observable<boolean> {
    this.beginRequest();
    return this.repository.forgotPassword(payload).pipe(
      tap((res) => {
        this._hasError.set(false);
        this.notify.success(res.message ?? "AUTH.CODE_SENT");
      }),
      this.mapToSuccessFlag(),
    );
  }

  /** POST /auth/password/verify */
  verifyPasswordCode(payload: VerifyPasswordCodeRequest): Observable<string | null> {
    this.beginRequest();
    return this.repository.verifyPasswordCode(payload).pipe(
      tap((res) => {
        this._hasError.set(false);
        this.notify.success(res.message ?? "AUTH.CODE_VERIFIED");
      }),
      // Map straight to the reset token the next step needs — keeps
      // pages/components free of ApiResponse<T> plumbing.
      map((res) => res.data?.token ?? null),
      catchError(() => {
        // Let interceptor handle notifications, just set error state
        this._hasError.set(true);
        return of(null);
      }),
      finalize(() => this._loading.set(false)),
    );
  }

  /** PATCH /auth/password/reset */
  resetPassword(payload: ResetPasswordRequest): Observable<boolean> {
    this.beginRequest();
    return this.repository.resetPassword(payload).pipe(
      tap((res) => {
        this._hasError.set(false);
        this.notify.success(res.message ?? "AUTH.PASSWORD_RESET_SUCCESS");
      }),
      this.mapToSuccessFlag(),
    );
  }

  /** Clears in-memory + persisted session without calling the API (e.g. on 401). */
  clearSession(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(PERMISSIONS_KEY);
    this.clearInMemoryState();
  }

  /**
   * Clears only the in-memory signals, leaving localStorage untouched.
   * Used by the cross-tab sync handler below, where another tab has
   * *already* removed the persisted keys — re-removing them here would be
   * redundant, and more importantly would itself fire a same-tab
   * `localStorage.removeItem()` call that (harmlessly, but needlessly)
   * re-triggers this tab's own storage bookkeeping.
   */
  private clearInMemoryState(): void {
    this._currentUser.set(null);
    this._role.set(null);
    this._permissions.set([]);
    this._hasError.set(false);
  }

  /** True if the current user's permission list includes `permission`. */
  hasPermission(permission: string): boolean {
    return this._permissions().includes(permission);
  }

  /** True if the current user's permission list includes ANY of `permissions`. */
  hasAnyPermission(permissions: string[]): boolean {
    if (!permissions.length) return true;
    return permissions.some((p) => this._permissions().includes(p));
  }

  /** True if the current user's role matches `role`. */
  hasRole(role: string): boolean {
    return this._role() === role;
  }

  /**
   * Applies a freshly refreshed access/refresh token (+ role/permissions)
   * to both localStorage and the in-memory signals.
   *
   * Exists as a public entry point specifically for the error interceptor:
   * `handleUnauthorized()` there calls `AuthApiRepository.refreshToken()`
   * directly (it has to — it needs the raw HTTP call outside the
   * loading()/hasError() UI-state plumbing that `AuthService.refreshToken()`
   * wraps it in), which previously meant it only ever wrote the two token
   * keys to localStorage and never touched role/permissions or this
   * service's signals at all. That left three different kinds of drift
   * after any interceptor-triggered silent refresh:
   *   - localStorage.odl_role / odl_permissions going stale, and
   *   - `role()` / `permissions()` signals never updating in the *current*
   *     tab even though the server just sent fresher values, and
   *   - `permissionGuard` checks against those stale signals afterward.
   * Routing both refresh paths (AuthService.refreshToken() for
   * component-initiated calls, and this method for the interceptor's
   * silent 401 retry) through the same persistence logic keeps them in
   * sync.
   */
  applyRefreshedSession(
    accessToken: string,
    refreshToken: string | null,
    role: string,
    permissions: string[],
  ): void {
    this.persistTokens(accessToken, refreshToken);
    this.persistRoleAndPermissions(role, permissions);
    this._role.set(role);
    this._permissions.set(permissions);
  }

  /**
   * Merges a partial update (e.g. fullName/email from the Profile module)
   * into the in-memory + persisted user, so the header and anywhere else
   * `currentUser()` is read reflect the change immediately — no reload.
   */
  patchCurrentUser(partial: Partial<AuthUser>): void {
    const current = this._currentUser();
    if (!current) return;
    const updated = { ...current, ...partial };
    this._currentUser.set(updated);
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private beginRequest(): void {
    this._loading.set(true);
    this._hasError.set(false);
  }

  /** Shared map/catchError/finalize pipeline for the boolean-result methods. */
  private mapToSuccessFlag() {
    return (source: Observable<ApiResponse<unknown>>): Observable<boolean> =>
      source.pipe(
        map(() => {
          this._hasError.set(false);
          return true;
        }),
        catchError(() => {
          // Let interceptor handle notifications, just set error state
          this._hasError.set(true);
          return of(false);
        }),
        finalize(() => this._loading.set(false)),
      );
  }

  private persistTokens(accessToken: string, refreshToken?: string | null): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    // Backend doesn't always rotate the refresh token (returns null) --
    // only overwrite the stored one when a new value is actually given.
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
  }

  private persistSession(user: AuthUser, role: string, permissions: string[]): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.persistRoleAndPermissions(role, permissions);
  }

  /** Writes role + permissions to localStorage — shared by login() and refreshToken(). */
  private persistRoleAndPermissions(role: string, permissions: string[]): void {
    localStorage.setItem(ROLE_KEY, role);
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
  }

  private getStoredRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  /**
   * Cross-tab session synchronization.
   *
   * The `storage` event fires in every *other* same-origin tab/window
   * whenever one tab changes localStorage — never in the tab that made the
   * change itself, so this can't loop back on the tab that just logged
   * out/in. That makes it a safe, browser-native way to keep every open
   * tab's auth state consistent without any polling or extra dependency.
   *
   * Tracks the access token key specifically (rather than every key this
   * service writes) because it's the single source of truth for
   * `isAuthenticated()` everywhere else in the app — user/role/permissions
   * always change together with it (see persistTokens/persistSession/
   * clearSession above), so watching it alone is enough to detect both
   * "logged out elsewhere" and "logged in elsewhere" without redundant
   * listeners per key.
   */
  private setupCrossTabSync(): void {
    if (typeof window === "undefined") return; // SSR/build-time guard

    window.addEventListener("storage", (event: StorageEvent) => {
      if (event.key !== ACCESS_TOKEN_KEY) return;
      // `storage` also fires for localStorage.clear() calls, where `key`
      // is null on some browsers — not applicable here since nothing in
      // this app calls clear(), but excluded explicitly above for safety.

      const tokenRemovedElsewhere = event.newValue === null;
      const tokenAddedElsewhere = event.oldValue === null && event.newValue !== null;

      if (tokenRemovedElsewhere && this._currentUser() !== null) {
        // Logout, forced session invalidation (e.g. refresh failure), or
        // manual localStorage tampering in another tab — either way, this
        // tab's session is no longer valid. Clear in-memory state (the
        // other tab already cleared localStorage — see clearInMemoryState
        // doc) and send the user back to login, same as a local logout.
        this.clearInMemoryState();
        this.router.navigate(["/login"]);
        return;
      }

      if (tokenAddedElsewhere && this._currentUser() === null) {
        // A login happened in another tab while this tab was signed out
        // (e.g. two tabs open on the login screen). Rehydrate this tab's
        // signals from what the other tab just persisted, instead of
        // leaving it stuck showing a stale "logged out" UI until the next
        // manual reload.
        this.restoreSession();
      }
    });
  }

  /**
   * Best-effort session restore on app boot (token exists ⇒ assume authenticated).
   * User/role/permissions are hydrated from what was persisted at login time.
   * If the backend later exposes a "me" endpoint, prefer refetching from there
   * instead of trusting client-stored data.
   */
  private restoreSession(): void {
    const hasToken = !!localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!hasToken) return;

    const rawUser = localStorage.getItem(USER_KEY);
    const rawPermissions = localStorage.getItem(PERMISSIONS_KEY);
    const role = localStorage.getItem(ROLE_KEY);

    if (rawUser) {
      try {
        this._currentUser.set(JSON.parse(rawUser) as AuthUser);
      } catch {
        // Corrupted value — don't leave a half-restored session (token +
        // role/permissions persisted, but no user) sitting around forever.
        // Route guards would bounce the user to login anyway since
        // isAuthenticated() depends on currentUser, but the stale data
        // would never get cleaned up on its own.
        this.clearSession();
        return;
      }
    }

    if (role) this._role.set(role);

    if (rawPermissions) {
      try {
        this._permissions.set(JSON.parse(rawPermissions) as string[]);
      } catch {
        // Corrupted value — ignore, permissions stay empty.
      }
    }
  }
}
