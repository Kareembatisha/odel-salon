import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';

import { ApiResponse } from '@shared/model/api_response.model';
import { UpdateProfileRequest, UserProfile } from '../model/profile.model';
import { IProfileRepository } from './profile.repository';

const MOCK_DELAY_MS = 600;

function persistedUser(): { id?: number; fullName?: string; email?: string } {
  try {
    return JSON.parse(localStorage.getItem('odl_user') ?? '{}');
  } catch {
    return {};
  }
}

/**
 * In-memory profile: seeded from the signed-in user, edits survive navigation
 * (not a reload). A chosen photo becomes a blob: URL, so after a reload the
 * avatar falls back to initials — acceptable for mock mode.
 */
@Injectable({ providedIn: 'root' })
export class ProfileMockRepository implements IProfileRepository {
  private profile: UserProfile | null = null;

  getProfile(): Observable<ApiResponse<UserProfile>> {
    return of(this.ok(this.current())).pipe(delay(MOCK_DELAY_MS));
  }

  updateProfile(payload: UpdateProfileRequest): Observable<ApiResponse<null>> {
    const current = this.current();
    this.profile = {
      ...current,
      fullName: payload.fullName.trim(),
      email: payload.email.trim(),
      countryCode: payload.countryCode,
      phoneNumber: payload.phoneNumber.trim(),
      imageUrl: payload.image
        ? URL.createObjectURL(payload.image)
        : payload.removeImage
          ? null
          : current.imageUrl,
    };
    return of<ApiResponse<null>>({
      status: true,
      statusCode: 200,
      message: 'Profile updated successfully.',
      errors: null,
      meta: null,
      data: null,
    }).pipe(delay(MOCK_DELAY_MS));
  }

  private current(): UserProfile {
    if (!this.profile) {
      const user = persistedUser();
      this.profile = {
        id: user.id ?? 1,
        fullName: user.fullName ?? 'Omar Khaled',
        email: user.email ?? 'admin@odel.com',
        countryCode: '+20',
        phoneNumber: '1029005195',
        role: localStorage.getItem('odl_role') ?? 'SuperAdmin',
        imageUrl: null,
      };
    }
    return this.profile;
  }

  private ok<T>(data: T): ApiResponse<T> {
    return { status: true, statusCode: 200, message: 'OK', errors: null, meta: null, data };
  }
}
