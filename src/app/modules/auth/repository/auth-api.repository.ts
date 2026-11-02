import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { ApiResponse } from '@shared/model/api_response.model';
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
} from '../model/auth.model';
import { IAuthRepository } from './auth.repository';

/**
 * AuthApiRepository
 *
 * Real HTTP implementation of IAuthRepository. Talks to the backend
 * exactly as described in the Authentication API contract — no logic,
 * no error handling, no state. Just HTTP methods in, observables out.
 */
@Injectable({ providedIn: 'root' })
export class AuthApiRepository implements IAuthRepository {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/auth`;

  login(payload: LoginRequest): Observable<ApiResponse<LoginResponseData>> {
    return this.http.post<ApiResponse<LoginResponseData>>(`${this.baseUrl}/login`, payload);
  }

  logout(payload: LogoutRequest): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(`${this.baseUrl}/logout`, payload);
  }

  refreshToken(payload: RefreshTokenRequest): Observable<ApiResponse<RefreshTokenResponseData>> {
    return this.http.post<ApiResponse<RefreshTokenResponseData>>(`${this.baseUrl}/refresh-token`, payload);
  }

  /** PATCH /auth/password/change — requires the Bearer token (attached by tokenInterceptor). */
  changePassword(payload: ChangePasswordRequest): Observable<ApiResponse<null>> {
    return this.http.patch<ApiResponse<null>>(`${this.baseUrl}/password/change`, payload);
  }

  forgotPassword(payload: ForgotPasswordRequest): Observable<ApiResponse<ForgotPasswordResponseData>> {
    return this.http.post<ApiResponse<ForgotPasswordResponseData>>(`${this.baseUrl}/password/forgot`, payload);
  }

  verifyPasswordCode(payload: VerifyPasswordCodeRequest): Observable<ApiResponse<VerifyPasswordCodeResponseData>> {
    return this.http.post<ApiResponse<VerifyPasswordCodeResponseData>>(`${this.baseUrl}/password/verify`, payload);
  }

  resetPassword(payload: ResetPasswordRequest): Observable<ApiResponse<null>> {
    return this.http.patch<ApiResponse<null>>(`${this.baseUrl}/password/reset`, payload);
  }
}
