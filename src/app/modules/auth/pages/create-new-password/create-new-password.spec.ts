import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FormGroup } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { of } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../service/auth.service";
import { CreateNewPassword } from "./create-new-password";

type Internals = {
  form: FormGroup;
  strengthLabel(): string;
  strengthLevel(): number;
  onSubmit(): void;
  cancel(): void;
};

const STRONG = "Str0ng!Pass";

describe("CreateNewPassword", () => {
  let resetPassword: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;

  function create(params: { email?: string | null; token?: string | null } = {}) {
    const query: Record<string, string | null> = {
      email: params.email === undefined ? "sara@example.com" : params.email,
      token: params.token === undefined ? "reset-token" : params.token,
    };
    TestBed.configureTestingModule({
      imports: [CreateNewPassword, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: { resetPassword, loading: signal(false) } },
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: (k: string) => query[k] } } },
        },
      ],
    });
    TestBed.inject(TranslateService).use("en");
    const fixture = TestBed.createComponent(CreateNewPassword);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Internals;
  }

  beforeEach(() => {
    resetPassword = vi.fn(() => of(true));
    navigate = vi.fn();
  });

  it.each([
    ["no email", { email: null }],
    ["a blank email", { email: "" }],
    ["no token", { token: null }],
    ["a blank token", { token: "" }],
  ])("sends the user back to forgot-password when the link has %s", (_n, params) => {
    create(params);
    expect(navigate).toHaveBeenCalledWith(["/forget-password"]);
  });

  it("stays on the page with a valid reset link", () => {
    create();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("rejects a weak password and a mismatching confirmation", () => {
    const page = create();
    page.form.setValue({ password: "weak", confirmPassword: "weak" });
    page.onSubmit();
    expect(resetPassword).not.toHaveBeenCalled();

    page.form.setValue({ password: STRONG, confirmPassword: "Different1!" });
    expect(page.form.hasError("mismatch")).toBe(true);
    page.onSubmit();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("resets the password with the email and token from the link, then shows success", () => {
    const page = create();
    page.form.setValue({ password: STRONG, confirmPassword: STRONG });
    page.onSubmit();

    expect(resetPassword).toHaveBeenCalledWith({
      email: "sara@example.com",
      token: "reset-token",
      newPassword: STRONG,
      newPasswordConfirmation: STRONG,
    });
    expect(navigate).toHaveBeenCalledWith(["/password-success"]);
  });

  it("stays on the page when the reset fails", () => {
    resetPassword.mockReturnValue(of(false));
    const page = create();
    page.form.setValue({ password: STRONG, confirmPassword: STRONG });
    page.onSubmit();

    expect(navigate).not.toHaveBeenCalledWith(["/password-success"]);
  });

  it("the strength meter follows the policy rules", () => {
    const page = create();
    page.form.controls["password"].setValue("a");
    expect(page.strengthLabel()).toBe("AUTH.STRENGTH_WEAK");

    page.form.controls["password"].setValue(STRONG);
    expect(page.strengthLabel()).toBe("AUTH.STRENGTH_STRONG");
    expect(page.strengthLevel()).toBe(4);
  });

  it("cancel goes back to the login page", () => {
    create().cancel();
    expect(navigate).toHaveBeenCalledWith(["/login"]);
  });
});
