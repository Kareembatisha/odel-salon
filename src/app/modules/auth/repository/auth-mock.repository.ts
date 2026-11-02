import { Injectable } from "@angular/core";
import { Observable, delay, of, throwError } from "rxjs";

import { ApiResponse } from "@shared/model/api_response.model";
import {
  ChangePasswordRequest,
  ForgotPasswordRequest,
  ForgotPasswordResponseData,
  LoginRequest,
  LoginResponseData,
  LogoutRequest,
  RefreshTokenRequest,
  RefreshTokenResponseData,
  ResetPasswordRequest,
  VerifyPasswordCodeRequest,
  VerifyPasswordCodeResponseData,
} from "../model/auth.model";
import { ALL_PERMISSIONS, Permission } from "@core/auth/permissions";
import { MOCK_MANAGER_PERMISSIONS } from "@core/mock/mock-db";
import { IAuthRepository } from "./auth.repository";


/**
 * Two demo identities so permission-driven UI (sidebar filtering, route
 * guards, no-access page) can be exercised without a backend:
 *   admin@odel.com    → SuperAdmin   (everything)
 *   manager@odel.com  → BranchManager (operations only: no catalog edits,
 *                        reports export, settings, users or roles)
 * Any email starting with "manager" gets the manager session. Password: 6+ chars.
 */
const MANAGER_PERMISSIONS: Permission[] = MOCK_MANAGER_PERMISSIONS as Permission[];

let MOCK_EMAIL = "admin@odel.com";

/** After a page reload the module state above resets — recover the email from the persisted session. */
function persistedEmail(): string {
  try {
    const raw = localStorage.getItem("odl_user");
    return raw ? (JSON.parse(raw) as { email?: string }).email ?? MOCK_EMAIL : MOCK_EMAIL;
  } catch {
    return MOCK_EMAIL;
  }
}

function sessionFor(email: string): { role: string; permissions: string[] } {
  return email.toLowerCase().startsWith("manager")
    ? { role: "BranchManager", permissions: MANAGER_PERMISSIONS }
    : { role: "SuperAdmin", permissions: ALL_PERMISSIONS };
}

/** Simulated network latency so loading/skeleton states are visible during dev. */
const MOCK_DELAY_MS = 600;

/**
 * AuthMockRepository
 *
 * Drop-in replacement for AuthApiRepository — same interface, same
 * ApiResponse<T> envelope, but resolves against static fixtures instead of
 * a live backend. Lets the frontend team build and demo auth flows before
 * the API is ready, just by flipping `environment.useMock`.
 */
@Injectable({ providedIn: "root" })
export class AuthMockRepository implements IAuthRepository {
  login(payload: LoginRequest): Observable<ApiResponse<LoginResponseData>> {
    if (payload.password.length < 6) {
      return throwError(() => ({
        error: {
          status: false,
          statusCode: 422,
          message: "Validation failed.",
          data: null,
          meta: null,
          errors: { password: "AUTH.PASSWORD_MIN" },
        },
      })).pipe(delay(MOCK_DELAY_MS));
    }

    MOCK_EMAIL = payload.email;
    return of<ApiResponse<LoginResponseData>>({
      status: true,
      statusCode: 200,
      message: "Login successful",
      errors: null,
      meta: null,
      data: {
        user: {
          id: 1,
          fullName: payload.email.toLowerCase().startsWith("manager") ? "Layla Hassan" : "Omar Khaled",
          email: payload.email,
          imageUrl: null,
        },
        tokens: {
          accessToken: "mock-access-token.eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
          refreshToken: "mock-refresh-token.uY29tIiwianR",
        },
        role: sessionFor(MOCK_EMAIL).role,
        permissions: sessionFor(MOCK_EMAIL).permissions,
      },
    }).pipe(delay(MOCK_DELAY_MS));
  }

  logout(_payload: LogoutRequest): Observable<ApiResponse<null>> {
    return of<ApiResponse<null>>({
      status: true,
      statusCode: 200,
      message: "Logout successful",
      errors: null,
      meta: null,
      data: null,
    }).pipe(delay(MOCK_DELAY_MS));
  }

  refreshToken(
    _payload: RefreshTokenRequest,
  ): Observable<ApiResponse<RefreshTokenResponseData>> {
    return of<ApiResponse<RefreshTokenResponseData>>({
      status: true,
      statusCode: 200,
      message: "Token refreshed successfully.",
      errors: null,
      meta: null,
      data: {
        accessToken: "mock-access-token.refreshed",
        refreshToken: "mock-refresh-token.refreshed",
        role: sessionFor(persistedEmail()).role,
        permissions: sessionFor(persistedEmail()).permissions,
      },
    }).pipe(delay(MOCK_DELAY_MS));
  }

  changePassword(_payload: ChangePasswordRequest): Observable<ApiResponse<null>> {
    return of<ApiResponse<null>>({
      status: true,
      statusCode: 200,
      message: "Password changed successfully.",
      errors: null,
      meta: null,
      data: null,
    }).pipe(delay(MOCK_DELAY_MS));
  }

  forgotPassword(
    payload: ForgotPasswordRequest,
  ): Observable<ApiResponse<ForgotPasswordResponseData>> {
    return of<ApiResponse<ForgotPasswordResponseData>>({
      status: true,
      statusCode: 200,
      message: "Verification code sent successfully.",
      errors: null,
      meta: null,
      data: { email: payload.email },
    }).pipe(delay(MOCK_DELAY_MS));
  }

  verifyPasswordCode(
    payload: VerifyPasswordCodeRequest,
  ): Observable<ApiResponse<VerifyPasswordCodeResponseData>> {
    if (payload.code !== "1234") {
      return throwError(() => ({
        error: {
          status: false,
          statusCode: 422,
          message: "Invalid code.",
          data: null,
          meta: null,
          errors: { code: "AUTH.OTP_INVALID" },
        },
      })).pipe(delay(MOCK_DELAY_MS));
    }

    return of<ApiResponse<VerifyPasswordCodeResponseData>>({
      status: true,
      statusCode: 200,
      message: "Code verified successfully.",
      errors: null,
      meta: null,
      data: {
        email: payload.email,
        token:
          "e7a36439cc1a410b5656b33d991b2657d3b400aed9ef07ddb87eec28103e1df2",
      },
    }).pipe(delay(MOCK_DELAY_MS));
  }

  resetPassword(_payload: ResetPasswordRequest): Observable<ApiResponse<null>> {
    return of<ApiResponse<null>>({
      status: true,
      statusCode: 200,
      message: "Password reset successfully.",
      errors: null,
      meta: null,
      data: null,
    }).pipe(delay(MOCK_DELAY_MS));
  }
}