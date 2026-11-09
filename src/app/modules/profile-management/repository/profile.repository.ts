import { InjectionToken } from "@angular/core";
import { Observable } from "rxjs";

import { ApiResponse } from "@shared/model/api_response.model";
import { UpdateProfileRequest, UserProfile } from "../model/profile.model";

/** Contract shared by the HTTP and mock repositories (pure data access). */
export interface IProfileRepository {
  /** GET /auth/profile */
  getProfile(): Observable<ApiResponse<UserProfile>>;
  /** PUT /auth/profile (multipart/form-data) */
  updateProfile(payload: UpdateProfileRequest): Observable<ApiResponse<null>>;
}

/** DI token: `app.providers*.ts` decides whether the API or the mock implementation backs it. */
export const PROFILE_REPOSITORY = new InjectionToken<IProfileRepository>("PROFILE_REPOSITORY");
