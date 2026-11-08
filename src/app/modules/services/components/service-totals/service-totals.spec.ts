import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { beforeEach, describe, expect, it } from "vitest";

import { LanguageService } from "@core/services/language.service";
import { ServicesTotals } from "../../utils/service-option.util";
import { ServiceTotals } from "./service-totals";

describe("ServiceTotals", () => {
  let fixture: ComponentFixture<ServiceTotals>;
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? "";

  async function setup(totals: ServicesTotals, showHome: boolean) {
    TestBed.configureTestingModule({ imports: [ServiceTotals, TranslateModule.forRoot()] });
    TestBed.inject(TranslateService).use("en");
    TestBed.inject(LanguageService).setLang("en");
    fixture = TestBed.createComponent(ServiceTotals);
    fixture.componentRef.setInput("totals", totals);
    fixture.componentRef.setInput("showHome", showHome);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => localStorage.clear());

  it("shows the Regular and VIP totals and the duration", async () => {
    await setup({ regular: 160, vip: 250, home: null, durationMinutes: 45 }, false);
    expect(text()).toContain("160");
    expect(text()).toContain("250");
    expect(text()).toContain("45 SERVICES.UNITS.MIN");
    expect(text()).not.toContain("SERVICE_PICKER.HOME");
  });

  it("shows the Home total only when asked to", async () => {
    await setup({ regular: 160, vip: 250, home: 320, durationMinutes: 45 }, true);
    expect(text()).toContain("SERVICE_PICKER.HOME");
    expect(text()).toContain("320");
  });
});
