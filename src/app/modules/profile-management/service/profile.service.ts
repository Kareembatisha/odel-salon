import { computed, inject, Injectable, signal } from "@angular/core";
import { Observable, catchError, finalize, map, of, tap } from "rxjs";

import { NotificationService } from "@core/services/notification.service";
import { AuthService } from "../../auth/service/auth.service";
import { UpdateProfileRequest, UserProfile } from "../model/profile.model";
import { PROFILE_REPOSITORY } from "../repository/profile.repository";

/**
 * ProfileService — state + business logic for the signed-in user's profile.
 *
 * After a successful update the backend returns no body, so the service
 * refetches GET /auth/profile (the only way to learn the new imageUrl) and
 * pushes fullName / email / imageUrl into AuthService.currentUser — that is
 * what makes the header name and avatar change instantly, with no reload.
 */
@Injectable({ providedIn: "root" })
export class ProfileService {
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotificationService);

  private readonly repository = inject(PROFILE_REPOSITORY);

  private readonly _profile = signal<UserProfile | null>(null);
  private readonly _loading = signal(false);
  /** Mutations in flight. A counter (not a boolean) so one finishing can't clear `saving` while another is still running. */
  private readonly pendingMutations = signal(0);
  private readonly _hasError = signal(false);

  readonly profile = this._profile.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = computed(() => this.pendingMutations() > 0);
  readonly hasError = this._hasError.asReadonly();

  /** GET /auth/profile */
  load(): void {
    this._loading.set(true);
    this._hasError.set(false);
    this.repository
      .getProfile()
      .pipe(
        catchError(() => {
          this._hasError.set(true);
          return of(null);
        }),
        finalize(() => this._loading.set(false)),
      )
      .subscribe((res) => {
        if (res?.data) this.apply(res.data);
        else if (res) this._hasError.set(true);
      });
  }

  /** PUT /auth/profile, then refetch. Emits true on success. */
  update(payload: UpdateProfileRequest): Observable<boolean> {
    this.pendingMutations.update((n) => n + 1);
    return this.repository.updateProfile(payload).pipe(
      tap((res) => this.notify.success(res.message ?? "PROFILE.PROFILE_UPDATED")),
      tap(() => this.load()),
      map(() => true),
      // The error interceptor already showed the backend's message / field errors.
      catchError(() => of(false)),
      finalize(() => this.pendingMutations.update((n) => n - 1)),
    );
  }

  private apply(profile: UserProfile): void {
    this._profile.set(profile);
    this.auth.patchCurrentUser({
      fullName: profile.fullName,
      email: profile.email,
      imageUrl: profile.imageUrl,
    });
  }
}
