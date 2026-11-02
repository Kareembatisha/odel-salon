import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChildren,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";

import { AuthService } from "../../service/auth.service";

@Component({
  selector: "app-email-verification",
  standalone: true,
  imports: [ReactiveFormsModule, TranslateModule],
  templateUrl: "./email-verification.html",
  styleUrl: "./email-verification.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmailVerification implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  protected readonly authService = inject(AuthService);

  protected readonly loading = this.authService.loading;

  @ViewChildren("digitInput") digitInputs!: QueryList<
    ElementRef<HTMLInputElement>
  >;

  protected readonly digitKeys = ["d0", "d1", "d2", "d3"] as const;

  protected readonly form = this.fb.nonNullable.group({
    d0: ["", [Validators.required, Validators.pattern(/^[0-9]$/)]],
    d1: ["", [Validators.required, Validators.pattern(/^[0-9]$/)]],
    d2: ["", [Validators.required, Validators.pattern(/^[0-9]$/)]],
    d3: ["", [Validators.required, Validators.pattern(/^[0-9]$/)]],
  });

  protected email = "";
  protected secondsLeft = 45;
  protected submitError = "";
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    const email = this.route.snapshot.queryParamMap.get("email");

    // This screen only makes sense as a continuation of Forgot Password —
    // it needs the email that requested the code. A fake placeholder like
    // "user@company.com" used to be shown here on direct/stale access,
    // which is misleading (looks like a real, verifiable OTP session when
    // there isn't one). Route back to the step that actually establishes
    // this context instead.
    if (!email) {
      this.router.navigate(["/forget-password"]);
      return;
    }

    this.email = email;
    this.startTimer();

    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((val) => {
      const complete = this.digitKeys.every((k) => (val[k] ?? "").length === 1);
      if (complete) this.onSubmit();
    });
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private startTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.secondsLeft = 45;
    this.timer = setInterval(() => {
      if (this.secondsLeft > 0) {
        this.secondsLeft--;
      } else if (this.timer) {
        clearInterval(this.timer);
      }
      this.cdr.markForCheck();
    }, 1000);
  }

  protected get formattedTime(): string {
    const m = Math.floor(this.secondsLeft / 60)
      .toString()
      .padStart(2, "0");
    const s = (this.secondsLeft % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  protected onDigitInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/[^0-9]/g, "");
    const char = raw.slice(-1);
    this.form.controls[this.digitKeys[index]].setValue(char);

    if (char && index < this.digitKeys.length - 1) {
      this.focusDigit(index + 1);
    }
  }

  protected onDigitKeydown(index: number, event: KeyboardEvent): void {
    const control = this.form.controls[this.digitKeys[index]];
    if (event.key === "Backspace" && !control.value && index > 0) {
      this.focusDigit(index - 1);
    }
  }

  protected onPaste(event: ClipboardEvent): void {
    const pasted =
      event.clipboardData?.getData("text").replace(/[^0-9]/g, "") ?? "";
    if (!pasted) return;
    event.preventDefault();
    this.digitKeys.forEach((key, i) => {
      this.form.controls[key].setValue(pasted[i] ?? "");
    });
    const lastIndex = Math.min(pasted.length, this.digitKeys.length) - 1;
    if (lastIndex >= 0) this.focusDigit(lastIndex);
  }

  private focusDigit(index: number): void {
    const el = this.digitInputs.get(index)?.nativeElement;
    el?.focus();
    el?.select();
  }

  protected resendCode(): void {
    if (this.secondsLeft > 0) return;
    this.authService
      .forgotPassword({ email: this.email })
      .subscribe((success) => {
        if (success) this.startTimer();
      });
  }

  protected changeEmail(): void {
    this.router.navigate(["/forget-password"]);
  }

  protected backToLogin(): void {
    this.router.navigate(["/login"]);
  }

  protected onSubmit(): void {
    // The form auto-submits via valueChanges once all 4 digits are filled
    // (see ngOnInit), but the <form> also has (ngSubmit)="onSubmit()" —
    // pressing Enter right after typing the last digit fires both,
    // sending this single-use OTP code to the server twice.
    if (this.authService.loading()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.submitError = "AUTH.OTP_INVALID";
      return;
    }
    this.submitError = "";
    const code = this.digitKeys
      .map((k) => this.form.controls[k].value)
      .join("");

    this.authService
      .verifyPasswordCode({ email: this.email, code })
      .subscribe((resetToken) => {
        if (!resetToken) {
          this.submitError = "AUTH.OTP_INVALID";
          this.cdr.markForCheck();
          return;
        }
        this.router.navigate(["/create-new-password"], {
          queryParams: { email: this.email, token: resetToken },
        });
      });
  }
}
