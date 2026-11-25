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

/** The verification code is exactly this many digits (one box each). */
export const OTP_LENGTH = 6;

type OtpKey = "d0" | "d1" | "d2" | "d3" | "d4" | "d5";

/**
 * Western digits of a text: Arabic-Indic (٠-٩) and Persian (۰-۹) digits — what an Arabic keyboard
 * types — are converted, every other character (spaces, dashes, letters) is dropped.
 */
function digitsOf(text: string): string {
  return text
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "");
}

/**
 * Email verification (OTP) — one box per digit of the {@link OTP_LENGTH}-digit code.
 *
 * - **Typing** moves on to the next box; typing over a filled box replaces its digit.
 * - **Paste, SMS autofill (`autocomplete="one-time-code"`) and keyboard suggestions** can put the
 *   whole code into one box: it is spread over the boxes (a full code always starts at the first).
 * - **Keys:** Backspace on an empty box clears and goes back, Arrow Left / Right / Home / End move
 *   (the row is always left-to-right, even on the RTL page), letters are ignored.
 * - The code is verified by itself as soon as every box is filled — once, even for a paste (the
 *   boxes are filled in one update, so a half-new, half-old code is never sent).
 */
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

  @ViewChildren("digitInput") digitInputs!: QueryList<ElementRef<HTMLInputElement>>;

  protected readonly otpLength = OTP_LENGTH;
  protected readonly digitKeys: readonly OtpKey[] = ["d0", "d1", "d2", "d3", "d4", "d5"];

  protected readonly form = this.fb.nonNullable.group({
    d0: ["", [Validators.required, Validators.pattern(/^[0-9]$/)]],
    d1: ["", [Validators.required, Validators.pattern(/^[0-9]$/)]],
    d2: ["", [Validators.required, Validators.pattern(/^[0-9]$/)]],
    d3: ["", [Validators.required, Validators.pattern(/^[0-9]$/)]],
    d4: ["", [Validators.required, Validators.pattern(/^[0-9]$/)]],
    d5: ["", [Validators.required, Validators.pattern(/^[0-9]$/)]],
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
    const typed =
      (event as InputEvent).inputType === "insertText"
        ? digitsOf((event as InputEvent).data ?? "")
        : "";
    const digits = digitsOf(input.value);

    // One character typed over a filled box leaves two in it: the typed one wins.
    if (typed.length === 1) {
      this.fillFrom(index, typed);
      return;
    }
    // Several at once: a paste, an SMS autofill or a keyboard suggestion put the whole code here.
    if (digits.length > 1) {
      this.fillFrom(index, digits);
      return;
    }

    // None (deleted, or a non-digit typed) or one.
    this.form.controls[this.digitKeys[index]].setValue(digits);
    if (digits && index < OTP_LENGTH - 1) this.focusDigit(index + 1);
  }

  protected onDigitKeydown(index: number, event: KeyboardEvent): void {
    const control = this.form.controls[this.digitKeys[index]];

    switch (event.key) {
      case "Backspace":
        // An empty box: clear the previous one and go back to it.
        if (!control.value && index > 0) {
          event.preventDefault();
          this.form.controls[this.digitKeys[index - 1]].setValue("");
          this.focusDigit(index - 1);
        }
        return;
      case "ArrowLeft":
        event.preventDefault();
        this.focusDigit(Math.max(0, index - 1));
        return;
      case "ArrowRight":
        event.preventDefault();
        this.focusDigit(Math.min(OTP_LENGTH - 1, index + 1));
        return;
      case "Home":
        event.preventDefault();
        this.focusDigit(0);
        return;
      case "End":
        event.preventDefault();
        this.focusDigit(OTP_LENGTH - 1);
        return;
    }

    // Ignore letters and symbols (shortcuts like Ctrl+V and the keys that aren't characters stay).
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      digitsOf(event.key) === ""
    ) {
      event.preventDefault();
    }
  }

  protected onPaste(event: ClipboardEvent, index = 0): void {
    const pasted = digitsOf(event.clipboardData?.getData("text") ?? "");
    if (!pasted) return;
    event.preventDefault();
    this.fillFrom(index, pasted);
  }

  /** Selecting the digit on focus makes the next keystroke replace it. */
  protected selectDigit(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  /**
   * Spreads `digits` over the boxes from `start` — a whole code always starts at the first box — in
   * ONE update, so the code is verified once and never half old, half new. Focus goes to the box
   * after the last one filled (the last box when the code is complete).
   */
  private fillFrom(start: number, digits: string): void {
    const first = digits.length >= OTP_LENGTH ? 0 : start;
    const chars = digits.slice(0, OTP_LENGTH - first);
    const patch: Partial<Record<OtpKey, string>> = {};
    for (let i = 0; i < chars.length; i++) patch[this.digitKeys[first + i]] = chars[i];

    this.form.patchValue(patch);
    this.focusDigit(Math.min(first + chars.length, OTP_LENGTH - 1));
  }

  private focusDigit(index: number): void {
    const el = this.digitInputs.get(index)?.nativeElement;
    el?.focus();
    el?.select();
  }

  protected resendCode(): void {
    if (this.secondsLeft > 0) return;
    this.authService.forgotPassword({ email: this.email }).subscribe((success) => {
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
    // The form auto-submits via valueChanges once all 6 digits are filled
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
    const code = this.digitKeys.map((k) => this.form.controls[k].value).join("");

    this.authService.verifyPasswordCode({ email: this.email, code }).subscribe((resetToken) => {
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
