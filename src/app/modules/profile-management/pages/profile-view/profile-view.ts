import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

import { NotificationService } from '@core/services/notification.service';
import { LanguageService } from '@core/services/language.service';
import {
  PASSWORD_POLICY_RULES,
  passedPasswordRules,
  passwordPolicyValidator,
} from '@shared/validators/password-policy.validator';
import { AuthService } from '../../../auth/service/auth.service';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { FailedStateComponent } from '../../../../shared/components/failed-state/failed-state.component';
import { FloatLabelInput } from '../../../../shared/components/float-label-input/float-label-input';
import { countryOptions } from '@shared/utils/countries';
import { FloatLabelSelect, SelectOption } from '../../../../shared/components/float-label-select/float-label-select';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { ProfileService } from '../../service/profile.service';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];


function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const next = group.get('newPassword')?.value ?? '';
  const confirm = group.get('newPasswordConfirmation')?.value ?? '';
  return confirm && next !== confirm ? { mismatch: true } : null;
}

function differsFromCurrent(group: AbstractControl): ValidationErrors | null {
  const current = group.get('currentPassword')?.value ?? '';
  const next = group.get('newPassword')?.value ?? '';
  return current && next && current === next ? { sameAsCurrent: true } : null;
}

/**
 * Profile page — "who am I" (photo, name, contact) and "keep me safe" (password).
 * Data comes from GET /auth/profile; saving sends multipart PUT /auth/profile and
 * the header updates immediately through ProfileService → AuthService.patchCurrentUser.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-profile-view',
  standalone: true,
  imports: [
    ReactiveFormsModule, TranslateModule, PageHeaderComponent, StatusBadgeComponent, AvatarComponent,
    AppButtonComponent, FloatLabelInput, FloatLabelSelect, FailedStateComponent, SkeletonComponent,
  ],
  templateUrl: './profile-view.html',
  styleUrl: './profile-view.scss',
})
export class ProfileView implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly notify = inject(NotificationService);
  private readonly language = inject(LanguageService);

  protected readonly profile = this.profileService.profile;
  protected readonly loading = this.profileService.loading;
  protected readonly saving = this.profileService.saving;
  protected readonly hasError = this.profileService.hasError;
  protected readonly changingPassword = this.auth.loading;
  protected readonly permissions = this.auth.permissions;

  // ── Photo ────────────────────────────────────────────
  protected readonly pendingImage = signal<File | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly removeImage = signal(false);

  protected readonly shownImage = computed(() =>
    this.previewUrl() ?? (this.removeImage() ? null : this.profile()?.imageUrl ?? null),
  );
  protected readonly hasPhoto = computed(() => !!this.shownImage());

  // ── Details form ─────────────────────────────────────
  protected readonly details = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    countryCode: ['+20'],
    phoneNumber: ['', [Validators.pattern(/^\d{6,15}$/)]],
  });

  protected readonly countryOptions = computed<SelectOption[]>(() =>
    countryOptions(this.language.currentLang(), this.profile()?.countryCode),
  );

  // ── Password form ────────────────────────────────────
  protected readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, passwordPolicyValidator()]],
      newPasswordConfirmation: ['', [Validators.required]],
    },
    { validators: [passwordsMatch, differsFromCurrent] },
  );

  protected readonly rules = PASSWORD_POLICY_RULES;
  private readonly newPasswordValue = signal('');
  protected readonly passedRules = computed(() => passedPasswordRules(this.newPasswordValue()));
  protected readonly strengthLevel = computed(() =>
    Math.min(4, Math.ceil((this.passedRules().size / this.rules.length) * 4)),
  );
  protected readonly strengthLabel = computed(() => {
    const score = this.passedRules().size;
    if (score <= 1) return 'AUTH.STRENGTH_WEAK';
    if (score <= 3) return 'AUTH.STRENGTH_MEDIUM';
    if (score === 4) return 'AUTH.STRENGTH_GOOD';
    return 'AUTH.STRENGTH_STRONG';
  });

  constructor() {
    // Whenever fresh profile data arrives (first load, or refetch after a save)
    // reset the form + pending photo to it, so the form always shows what the server has.
    effect(() => {
      const p = this.profile();
      if (!p) return;
      // untracked: resetting reads/writes the photo signals, and this effect must
      // re-run ONLY when the server profile changes — not when the user picks a photo.
      untracked(() => {
        this.details.reset({
          fullName: p.fullName,
          email: p.email,
          countryCode: p.countryCode || '+20',
          phoneNumber: p.phoneNumber ?? '',
        });
        this.clearPendingPhoto();
      });
    });

    this.passwordForm.controls.newPassword.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => this.newPasswordValue.set(v));

    inject(DestroyRef).onDestroy(() => this.revokePreview());
  }

  ngOnInit(): void {
    this.profileService.load();
  }

  // ── Derived UI state ─────────────────────────────────
  protected get detailsChanged(): boolean {
    return this.details.dirty || !!this.pendingImage() || this.removeImage();
  }

  protected fieldError(name: 'fullName' | 'email' | 'phoneNumber'): string {
    const c = this.details.controls[name];
    if (!c.touched) return '';
    if (c.hasError('required')) return name === 'fullName' ? 'PROFILE.NAME_REQUIRED' : 'AUTH.EMAIL_REQUIRED';
    if (c.hasError('maxlength')) return 'PROFILE.NAME_MAX';
    if (c.hasError('email')) return 'AUTH.EMAIL_INVALID';
    if (c.hasError('pattern')) return 'PROFILE.PHONE_INVALID';
    return '';
  }

  protected passwordError(name: 'currentPassword' | 'newPassword' | 'newPasswordConfirmation'): string {
    const c = this.passwordForm.controls[name];
    if (!c.touched) return '';
    if (c.hasError('required')) {
      return name === 'currentPassword'
        ? 'PROFILE.CURRENT_PASSWORD_REQUIRED'
        : name === 'newPassword' ? 'AUTH.PASSWORD_REQUIRED' : 'AUTH.CONFIRM_PASSWORD_REQUIRED';
    }
    if (name === 'newPassword' && c.hasError('weak')) return 'AUTH.PASSWORD_WEAK';
    if (name === 'newPassword' && this.passwordForm.hasError('sameAsCurrent')) return 'PROFILE.SAME_AS_CURRENT';
    if (name === 'newPasswordConfirmation' && this.passwordForm.hasError('mismatch')) return 'AUTH.PASSWORD_MISMATCH';
    return '';
  }

  // ── Photo handlers ───────────────────────────────────
  protected onPickPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again later
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      this.notify.error('FILE_VALIDATION.UNSUPPORTED_TYPE', 'PROFILE.PHOTO_HINT');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.notify.error('FILE_VALIDATION.FILE_TOO_LARGE', 'PROFILE.PHOTO_HINT');
      return;
    }
    this.revokePreview();
    this.pendingImage.set(file);
    this.previewUrl.set(URL.createObjectURL(file));
    this.removeImage.set(false);
  }

  protected removePhoto(): void {
    this.revokePreview();
    this.pendingImage.set(null);
    this.previewUrl.set(null);
    this.removeImage.set(!!this.profile()?.imageUrl);
  }

  // ── Actions ──────────────────────────────────────────
  protected saveDetails(): void {
    if (this.details.invalid) {
      this.details.markAllAsTouched();
      return;
    }
    const v = this.details.getRawValue();
    this.profileService
      .update({
        fullName: v.fullName,
        email: v.email,
        countryCode: v.countryCode,
        phoneNumber: v.phoneNumber,
        image: this.pendingImage(),
        removeImage: this.removeImage(),
      })
      .subscribe();
  }

  protected discardDetails(): void {
    const p = this.profile();
    if (!p) return;
    this.details.reset({
      fullName: p.fullName,
      email: p.email,
      countryCode: p.countryCode || '+20',
      phoneNumber: p.phoneNumber ?? '',
    });
    this.clearPendingPhoto();
  }

  protected submitPassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.auth.changePassword(this.passwordForm.getRawValue()).subscribe((ok) => {
      if (ok) {
        this.passwordForm.reset();
        this.newPasswordValue.set('');
      }
    });
  }

  protected reload(): void {
    this.profileService.load();
  }

  private clearPendingPhoto(): void {
    this.revokePreview();
    this.pendingImage.set(null);
    this.previewUrl.set(null);
    this.removeImage.set(false);
  }

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
  }
}
