import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FormGroup } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../service/auth.service";
import { EmailVerification } from "./email-verification";

type Internals = {
  form: FormGroup;
  secondsLeft: number;
  submitError: string;
  formattedTime: string;
  onSubmit(): void;
  resendCode(): void;
  changeEmail(): void;
  onPaste(e: ClipboardEvent): void;
};

describe("EmailVerification", () => {
  let verifyPasswordCode: ReturnType<typeof vi.fn>;
  let forgotPassword: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let loading: ReturnType<typeof signal<boolean>>;

  function create(email: string | null = "sara@example.com") {
    TestBed.configureTestingModule({
      imports: [EmailVerification, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: { verifyPasswordCode, forgotPassword, loading } },
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => email } } },
        },
      ],
    });
    TestBed.inject(TranslateService).use("en");
    const fixture = TestBed.createComponent(EmailVerification);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance as unknown as Internals };
  }

  const fill = (page: Internals, digits: string) =>
    page.form.setValue({ d0: digits[0], d1: digits[1], d2: digits[2], d3: digits[3] });

  beforeEach(() => {
    vi.useFakeTimers();
    verifyPasswordCode = vi.fn(() => of("reset-token"));
    forgotPassword = vi.fn(() => of(true));
    navigate = vi.fn();
    loading = signal(false);
  });

  afterEach(() => vi.useRealTimers());

  it("goes back to forgot-password when opened without an email", () => {
    create(null);
    expect(navigate).toHaveBeenCalledWith(["/forget-password"]);
  });

  it("verifies automatically once all four digits are in and continues with the reset token", () => {
    const { page } = create();
    fill(page, "1234");

    expect(verifyPasswordCode).toHaveBeenCalledWith({ email: "sara@example.com", code: "1234" });
    expect(navigate).toHaveBeenCalledWith(["/create-new-password"], {
      queryParams: { email: "sara@example.com", token: "reset-token" },
    });
  });

  it("shows an error and stays when the code is wrong", () => {
    verifyPasswordCode.mockReturnValue(of(null));
    const { page } = create();
    fill(page, "1234");

    expect(page.submitError).toBe("AUTH.OTP_INVALID");
    expect(navigate).not.toHaveBeenCalledWith(["/create-new-password"], expect.anything());
  });

  it("does not send the single-use code twice while a request is running", () => {
    const { page } = create();
    loading.set(true);
    fill(page, "1234");
    page.onSubmit();

    expect(verifyPasswordCode).not.toHaveBeenCalled();
  });

  it("an incomplete code is invalid and sends nothing", () => {
    const { page } = create();
    page.form.patchValue({ d0: "1", d1: "2" });
    page.onSubmit();

    expect(verifyPasswordCode).not.toHaveBeenCalled();
    expect(page.submitError).toBe("AUTH.OTP_INVALID");
  });

  it("pasting a code fills the digits and verifies", () => {
    const { page } = create();
    page.onPaste({
      clipboardData: { getData: () => " 98-76 " },
      preventDefault: () => undefined,
    } as unknown as ClipboardEvent);

    expect(verifyPasswordCode).toHaveBeenCalledWith({ email: "sara@example.com", code: "9876" });
  });

  describe("resend countdown", () => {
    it("starts at 00:45, counts down, and resend is blocked until it reaches zero", () => {
      const { page } = create();
      expect(page.formattedTime).toBe("00:45");

      page.resendCode();
      expect(forgotPassword).not.toHaveBeenCalled();

      vi.advanceTimersByTime(10_000);
      expect(page.formattedTime).toBe("00:35");

      vi.advanceTimersByTime(35_000);
      expect(page.secondsLeft).toBe(0);
    });

    it("after the countdown, resend asks for a new code and restarts the timer", () => {
      const { page } = create();
      vi.advanceTimersByTime(46_000);

      page.resendCode();

      expect(forgotPassword).toHaveBeenCalledWith({ email: "sara@example.com" });
      expect(page.secondsLeft).toBe(45);
    });

    it("a failed resend keeps the countdown at zero", () => {
      forgotPassword.mockReturnValue(of(false));
      const { page } = create();
      vi.advanceTimersByTime(46_000);

      page.resendCode();
      expect(page.secondsLeft).toBe(0);
    });
  });

  it("can change the email", () => {
    const { page } = create();
    page.changeEmail();
    expect(navigate).toHaveBeenCalledWith(["/forget-password"]);
  });
});
