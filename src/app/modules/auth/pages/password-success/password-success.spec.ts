import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { describe, expect, it, vi } from "vitest";

import { PasswordSuccess } from "./password-success";

describe("PasswordSuccess", () => {
  it("renders and sends the user to the login page", () => {
    const navigate = vi.fn();
    TestBed.configureTestingModule({
      imports: [PasswordSuccess, TranslateModule.forRoot()],
      providers: [{ provide: Router, useValue: { navigate } }],
    });
    TestBed.inject(TranslateService).use("en");
    const fixture = TestBed.createComponent(PasswordSuccess);
    fixture.detectChanges();

    (fixture.componentInstance as unknown as { goToLogin(): void }).goToLogin();

    expect(navigate).toHaveBeenCalledWith(["/login"]);
  });
});
