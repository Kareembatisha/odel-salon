import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";

import { FloatLabelInput } from "@shared/components/float-label-input/float-label-input";
import { AuthService } from "../../service/auth.service";
import {
  PASSWORD_POLICY_RULES,
  PasswordStrengthRule,
  passedPasswordRules,
  passwordPolicyValidator,
} from "@shared/validators/password-policy.validator";

function passwordMatchValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get("password")?.value ?? "";
    const confirm = group.get("confirmPassword")?.value ?? "";
    if (!confirm) return null;
    return password === confirm ? null : { mismatch: true };
  };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-create-new-password",
  standalone: true,
  imports: [ReactiveFormsModule, TranslateModule, FloatLabelInput],
  templateUrl: "./create-new-password.html",
  styleUrl: "./create-new-password.scss",
})
export class CreateNewPassword {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly authService = inject(AuthService);

  protected readonly loading = this.authService.loading;

  /** Carried over from the email-verification step via query params. */
  private readonly email = this.route.snapshot.queryParamMap.get("email") ?? "";
  private readonly resetToken = this.route.snapshot.queryParamMap.get("token") ?? "";

  constructor() {
    // This page must never present a working-looking reset form when it
    // doesn't actually have a valid reset context (missing/blank email or
    // token — e.g. someone typed the URL directly, or navigated back after
    // the flow already completed). Showing the form anyway would let the
    // user fill it in and submit, only to get a confusing backend error.
    // Send them back to start a fresh Forgot Password flow instead.
    if (!this.email || !this.resetToken) {
      this.router.navigate(["/forget-password"]);
    }

    this.form.controls.password.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => this.passwordValue.set(v));
  }

  // PM-8 — these rules now live in @shared/validators/password-policy.validator
  // so the Profile "Change Password" flow enforces exactly the same policy.
  // Same five rules, same label keys, same behaviour as before the move.
  protected readonly rules: readonly PasswordStrengthRule[] = PASSWORD_POLICY_RULES;

  protected readonly form = this.fb.nonNullable.group(
    {
      password: ["", [Validators.required, passwordPolicyValidator()]],
      confirmPassword: ["", [Validators.required]],
    },
    { validators: passwordMatchValidator() },
  );

  protected get password() {
    return this.form.controls.password;
  }
  protected get confirmPassword() {
    return this.form.controls.confirmPassword;
  }

  private readonly passwordValue = signal("");

  protected readonly passedRules = computed(() => passedPasswordRules(this.passwordValue()));

  protected readonly strengthScore = computed(() => this.passedRules().size);

  protected readonly strengthLabel = computed(() => {
    const score = this.strengthScore();
    if (score <= 1) return "AUTH.STRENGTH_WEAK";
    if (score <= 3) return "AUTH.STRENGTH_MEDIUM";
    if (score === 4) return "AUTH.STRENGTH_GOOD";
    return "AUTH.STRENGTH_STRONG";
  });

  protected readonly strengthLevel = computed(() => {
    // 0..4 → number of filled bars (out of 4)
    const score = this.strengthScore();
    return Math.min(4, Math.ceil((score / this.rules.length) * 4));
  });

  protected isRulePassed(key: PasswordStrengthRule["key"]): boolean {
    return this.passedRules().has(key);
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { password, confirmPassword } = this.form.getRawValue();

    this.authService
      .resetPassword({
        email: this.email,
        token: this.resetToken,
        newPassword: password,
        newPasswordConfirmation: confirmPassword,
      })
      .subscribe((success) => {
        if (success) this.router.navigate(["/password-success"]);
      });
  }

  protected cancel(): void {
    this.router.navigate(["/login"]);
  }
}
