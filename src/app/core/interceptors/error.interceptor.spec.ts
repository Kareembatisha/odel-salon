import { HttpClient, provideHttpClient, withInterceptors } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthApiRepository } from "../../modules/auth/repository/auth-api.repository";
import { AuthService } from "../../modules/auth/service/auth.service";
import { ErrorLoggingService } from "../services/error-logging.service";
import { NotificationService } from "../services/notification.service";
import { errorInterceptor } from "./error.interceptor";

describe("errorInterceptor — localized toasts", () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let warning: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: {} },
        { provide: AuthApiRepository, useValue: {} },
        { provide: ErrorLoggingService, useValue: { logHttpError: () => undefined } },
      ],
    });

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation("ar", {
      VALIDATION_FIELDS: { AllowsVip: "كراسي VIP" },
      ERRORS: { RETRY_AFTER: "حاول مرة أخرى بعد {{seconds}} ثانية", RATE_LIMITED: "طلبات كثيرة" },
    });
    translate.setTranslation("en", {
      VALIDATION_FIELDS: { AllowsVip: "VIP chairs" },
      ERRORS: { RETRY_AFTER: "Try again in {{seconds}}s" },
    });

    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    warning = vi.spyOn(TestBed.inject(NotificationService), "warning");
  });

  function fail(status: number, body: object, headers: Record<string, string> = {}) {
    http.get("/api/x").subscribe({ error: () => undefined });
    backend.expectOne("/api/x").flush(body, { status, statusText: "x", headers });
  }

  it("shows the translated field label with the server message as detail (Arabic)", () => {
    TestBed.inject(TranslateService).use("ar");
    fail(400, { errors: { AllowsVip: "أضف كرسيًا نشطًا من هذا النوع." } });

    expect(warning).toHaveBeenCalledWith("كراسي VIP", "أضف كرسيًا نشطًا من هذا النوع.");
  });

  it("shows the English label in English", () => {
    TestBed.inject(TranslateService).use("en");
    fail(400, { errors: { AllowsVip: "Add an active chair." } });

    expect(warning).toHaveBeenCalledWith("VIP chairs", "Add an active chair.");
  });

  it("falls back to a humanized field name when there is no translation for it", () => {
    TestBed.inject(TranslateService).use("ar");
    fail(400, { errors: { SomeNewField: "msg" } });

    expect(warning).toHaveBeenCalledWith("Some New Field", "msg");
  });

  it("shows the server message of a 409 as sent (already localized by Accept-Language)", () => {
    const notify = TestBed.inject(NotificationService);
    const spy = vi.spyOn(notify, "warning");
    fail(409, { message: "لا يمكن حذف «مدينة نصر» لأن به 3 كرسي." });

    expect(spy).toHaveBeenCalledWith("لا يمكن حذف «مدينة نصر» لأن به 3 كرسي.");
  });

  it('translates the rate-limit "try again" detail', () => {
    TestBed.inject(TranslateService).use("ar");
    fail(429, {}, { "Retry-After": "30" });

    expect(warning).toHaveBeenCalledWith("ERRORS.RATE_LIMITED", "حاول مرة أخرى بعد 30 ثانية");
  });
});
