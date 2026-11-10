import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FormGroup } from "@angular/forms";
import { Router } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { of } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../service/auth.service";
import { ForgetPassword } from "./forget-password";

type Internals = { form: FormGroup; onSubmit(): void; backToLogin(): void };

describe("ForgetPassword", () => {
  let forgotPassword: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;

  function create() {
    TestBed.configureTestingModule({
      imports: [ForgetPassword, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: { forgotPassword, loading: signal(false) } },
        { provide: Router, useValue: { navigate } },
      ],
    });
    TestBed.inject(TranslateService).use("en");
    const fixture = TestBed.createComponent(ForgetPassword);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Internals;
  }

  beforeEach(() => {
    forgotPassword = vi.fn(() => of(true));
    navigate = vi.fn();
  });

  it.each(["", "not-an-email"])("sends nothing for the email %j", (email) => {
    const page = create();
    page.form.patchValue({ email });
    page.onSubmit();

    expect(forgotPassword).not.toHaveBeenCalled();
    expect(page.form.get("email")!.touched).toBe(true);
  });

  it("requests a code and continues to verification with the email", () => {
    const page = create();
    page.form.patchValue({ email: "sara@example.com" });
    page.onSubmit();

    expect(forgotPassword).toHaveBeenCalledWith({ email: "sara@example.com" });
    expect(navigate).toHaveBeenCalledWith(["/email-verification"], {
      queryParams: { email: "sara@example.com" },
    });
  });

  it("stays on the page when the request fails", () => {
    forgotPassword.mockReturnValue(of(false));
    const page = create();
    page.form.patchValue({ email: "sara@example.com" });
    page.onSubmit();

    expect(navigate).not.toHaveBeenCalled();
  });

  it("can go back to the login page", () => {
    create().backToLogin();
    expect(navigate).toHaveBeenCalledWith(["/login"]);
  });
});
