import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FormGroup } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { of } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../service/auth.service";
import { Login } from "./login";

type Internals = { form: FormGroup; onSubmit(): void; goToForgotPassword(): void };

describe("Login", () => {
  let login: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;

  function create(returnUrl: string | null = null) {
    TestBed.configureTestingModule({
      imports: [Login, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: { login, loading: signal(false) } },
        { provide: Router, useValue: { navigateByUrl, navigate } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => returnUrl } } },
        },
      ],
    });
    TestBed.inject(TranslateService).use("en");
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Internals;
  }

  beforeEach(() => {
    login = vi.fn(() => of(true));
    navigateByUrl = vi.fn();
    navigate = vi.fn();
  });

  it("does not call the API and marks fields touched when the form is empty", () => {
    const page = create();
    page.onSubmit();

    expect(login).not.toHaveBeenCalled();
    expect(page.form.get("email")!.touched).toBe(true);
  });

  it.each([
    ["not-an-email", "secret1"],
    ["a@b.co", "12345"],
  ])("rejects email %j with password %j", (email, password) => {
    const page = create();
    page.form.patchValue({ email, password });
    page.onSubmit();
    expect(login).not.toHaveBeenCalled();
  });

  it("signs in with the typed credentials and goes to the default page", () => {
    const page = create();
    page.form.patchValue({ email: "sara@example.com", password: "secret1" });
    page.onSubmit();

    expect(login).toHaveBeenCalledWith({ email: "sara@example.com", password: "secret1" });
    expect(navigateByUrl).toHaveBeenCalledWith("/main");
  });

  it("returns to a safe returnUrl after signing in", () => {
    const page = create("/main/users?page=2");
    page.form.patchValue({ email: "sara@example.com", password: "secret1" });
    page.onSubmit();

    expect(navigateByUrl).toHaveBeenCalledWith("/main/users?page=2");
  });

  it.each(["https://evil.com", "//evil.com", "javascript:alert(1)", "/login"])(
    "ignores the unsafe returnUrl %j",
    (returnUrl) => {
      const page = create(returnUrl);
      page.form.patchValue({ email: "sara@example.com", password: "secret1" });
      page.onSubmit();

      expect(navigateByUrl).toHaveBeenCalledWith("/main");
    },
  );

  it("stays on the page when the sign-in fails", () => {
    login.mockReturnValue(of(false));
    const page = create();
    page.form.patchValue({ email: "sara@example.com", password: "wrong-pw" });
    page.onSubmit();

    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it("goes to the forgot-password page", () => {
    create().goToForgotPassword();
    expect(navigate).toHaveBeenCalledWith(["/forget-password"]);
  });
});
