import { Observable } from 'rxjs';

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

/**
 * IAuthRepository
 *
 * Contract shared by the real HTTP repository and the mock repository.
 * Repositories are pure data-access: no business logic, no error handling,
 * no notifications — just "make the call, return the observable". All of
 * that lives one layer up, in AuthService.
 */
export interface IAuthRepository {
  login(payload: LoginRequest): Observable<ApiResponse<LoginResponseData>>;
  logout(payload: LogoutRequest): Observable<ApiResponse<null>>;
  refreshToken(payload: RefreshTokenRequest): Observable<ApiResponse<RefreshTokenResponseData>>;
  changePassword(payload: ChangePasswordRequest): Observable<ApiResponse<null>>;
  forgotPassword(payload: ForgotPasswordRequest): Observable<ApiResponse<ForgotPasswordResponseData>>;
  verifyPasswordCode(payload: VerifyPasswordCodeRequest): Observable<ApiResponse<VerifyPasswordCodeResponseData>>;
  resetPassword(payload: ResetPasswordRequest): Observable<ApiResponse<null>>;
}
