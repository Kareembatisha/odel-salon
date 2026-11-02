/**
 * auth.model.ts
 *
 * Data contracts for the Authentication module.
 * Mirrors `Authentication_Contract_Api.md` 1:1 — field names/casing/shape
 * must stay in sync with the backend contract. Consumed by:
 *   - repository/*  (HTTP + mock implementations)
 *   - service/auth.service.ts (business logic)
 *   - pages/*        (forms, view state)
 */

// ── Shared ─────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  fullName: string;
  email: string;
  /**
   * Returned by /login (null when the user has no photo). The Profile page
   * keeps it — together with fullName/email — in sync with the header through
   * AuthService.patchCurrentUser() after every successful profile update.
   */
  imageUrl?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ── POST /login ─────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponseData {
  user: AuthUser;
  tokens: AuthTokens;
  role: string;
  permissions: string[];
}

// ── POST /auth/logout ────────────────────────────────────────────────────

export interface LogoutRequest {
  refreshToken: string;
}

// LogoutResponse data is always null — no dedicated interface needed.

// ── POST /auth/refresh-token ─────────────────────────────────────────────

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponseData {
  accessToken: string;
  // Backend may not rotate the refresh token on every call and returns
  // null in that case -- the previously stored refresh token must be
  // kept in that scenario, never overwritten with null.
  refreshToken: string | null;
  // Refresh now also returns the user's current role/permissions, so a
  // permission change (e.g. a role edit) takes effect on the next silent
  // refresh instead of requiring a full re-login.
  role: string;
  permissions: string[];
}

// ── PATCH /auth/password/change ──────────────────────────────────────────

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirmation: string;
}

// ChangePasswordResponse data is always null — no dedicated interface needed.

// ── POST /auth/password/forgot ───────────────────────────────────────────

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponseData {
  email: string;
}

// ── POST /auth/password/verify ───────────────────────────────────────────

export interface VerifyPasswordCodeRequest {
  email: string;
  code: string;
}

export interface VerifyPasswordCodeResponseData {
  email: string;
  token: string;
}

// ── PATCH /auth/password/reset ───────────────────────────────────────────

export interface ResetPasswordRequest {
  email: string;
  token: string;
  newPassword: string;
  newPasswordConfirmation: string;
}

// ResetPasswordResponse data is always null — no dedicated interface needed.