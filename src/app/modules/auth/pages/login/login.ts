import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";

import { FloatLabelInput } from "../../../../shared/components/float-label-input/float-label-input";
import { AuthService } from "../../service/auth.service";
import { sanitizeReturnUrl } from "../../utils/return-url.util";

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-login",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    FloatLabelInput,
  ],
  templateUrl: "./login.html",
  styleUrl: "./login.scss",
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly authService = inject(AuthService);

  // Template reads loading() directly to disable the submit button.
  protected readonly loading = this.authService.loading;

  /**
   * Captured once on construction (not re-read per submit) so it can't be
   * swapped out from under the user between page load and submit. Always
   * passed through sanitizeReturnUrl() before use — see return-url.util.ts
   * for why the raw query param is never trusted directly.
   */
  private readonly returnUrl = this.route.snapshot.queryParamMap.get(
    "returnUrl",
  );

  protected readonly form = this.fb.nonNullable.group({
    email: ["", [Validators.required, Validators.email]],
    password: ["", [Validators.required, Validators.minLength(6)]],
  });

  protected get email() {
    return this.form.controls.email;
  }

  protected get password() {
    return this.form.controls.password;
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();

    this.authService.login({ email, password }).subscribe((success) => {
      if (success) {
        // Never navigate to the raw query param — always through
        // sanitizeReturnUrl(), which rejects external/protocol-relative/
        // malformed values and falls back to the default app route.
        this.router.navigateByUrl(sanitizeReturnUrl(this.returnUrl));
      }
    });
  }

  protected goToForgotPassword(): void {
    this.router.navigate(["/forget-password"]);
  }
}
