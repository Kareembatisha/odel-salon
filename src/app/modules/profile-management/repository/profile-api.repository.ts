import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { environment } from "@env/environment";
import { ApiResponse } from "@shared/model/api_response.model";
import { UpdateProfileRequest, UserProfile } from "../model/profile.model";
import { buildProfileFormData } from "../utils/profile-form-data";
import { IProfileRepository } from "./profile.repository";

@Injectable({ providedIn: "root" })
export class ProfileApiRepository implements IProfileRepository {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/auth/profile`;

  getProfile(): Observable<ApiResponse<UserProfile>> {
    return this.http.get<ApiResponse<UserProfile>>(this.url);
  }

  /**
   * multipart/form-data: the Content-Type header is deliberately NOT set here —
   * the browser adds it together with the boundary when the body is FormData.
   */
  updateProfile(payload: UpdateProfileRequest): Observable<ApiResponse<null>> {
    return this.http.put<ApiResponse<null>>(this.url, buildProfileFormData(payload));
  }
}
