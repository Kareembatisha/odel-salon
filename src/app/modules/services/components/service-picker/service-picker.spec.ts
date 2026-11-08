import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { beforeEach, describe, expect, it } from "vitest";

import { LanguageService } from "@core/services/language.service";
import { ServiceOption } from "../../model/service.model";
import { ServicePicker, UnavailableService } from "./service-picker";

const opt = (id: number, over: Partial<ServiceOption> = {}): ServiceOption => ({
  id,
  nameAr: `[AR] Service ${id}`,
  nameEn: `Service ${id}`,
  durationMinutes: 70,
  regularPrice: 100,
  vipPrice: 150,
  isHomeAvailable: false,
  homePrice: null,
  ...over,
});

describe("ServicePicker", () => {
  let fixture: ComponentFixture<ServicePicker>;
  const el = () => fixture.nativeElement as HTMLElement;
  const checks = () => Array.from(el().querySelectorAll<HTMLInputElement>(".sp__check"));

  async function setup(
    inputs: {
      options?: ServiceOption[];
      selected?: number[];
      unavailable?: UnavailableService[];
      hint?: string;
      error?: string;
      lang?: "en" | "ar";
    } = {},
  ) {
    TestBed.configureTestingModule({ imports: [ServicePicker, TranslateModule.forRoot()] });
    TestBed.inject(TranslateService).use("en");
    TestBed.inject(LanguageService).setLang(inputs.lang ?? "en");
    fixture = TestBed.createComponent(ServicePicker);
    fixture.componentRef.setInput("options", inputs.options ?? [opt(1), opt(2)]);
    fixture.componentRef.setInput("selected", inputs.selected ?? []);
    fixture.componentRef.setInput("unavailable", inputs.unavailable ?? []);
    fixture.componentRef.setInput("hint", inputs.hint ?? "");
    fixture.componentRef.setInput("error", inputs.error ?? "");
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => localStorage.clear());

  it("lists one checkbox per option with its duration and prices", async () => {
    await setup();
    expect(checks()).toHaveLength(2);
    const row = el().querySelector(".sp__service")!.textContent!;
    expect(row).toContain("Service 1");
    expect(row).toContain("1 SERVICES.UNITS.H 10 SERVICES.UNITS.MIN");
    expect(row).toContain("100");
    expect(row).toContain("150");
  });

  it("checks the selected ones", async () => {
    await setup({ selected: [2] });
    expect(checks().map((c) => c.checked)).toEqual([false, true]);
    expect(el().querySelectorAll(".sp__service--checked")).toHaveLength(1);
  });

  it("emits the id of the toggled service and never changes the selection itself", async () => {
    await setup();
    const ids: number[] = [];
    fixture.componentInstance.toggled.subscribe((id) => ids.push(id));

    checks()[1].click();
    expect(ids).toEqual([2]);
  });

  it("lists unavailable services after the active ones, marked as no longer active", async () => {
    await setup({
      unavailable: [{ id: 9, nameAr: "[AR] Old", nameEn: "Old service" }],
      selected: [9],
    });
    expect(checks()).toHaveLength(3);
    const stale = el().querySelector(".sp__service--unavailable")!;
    expect(stale.textContent).toContain("Old service");
    expect(stale.textContent).toContain("SERVICE_PICKER.UNAVAILABLE");
    expect((stale.querySelector("input") as HTMLInputElement).checked).toBe(true);
  });

  it("uses the Arabic names when the UI is Arabic", async () => {
    await setup({ lang: "ar" });
    expect(el().querySelector(".sp__name")!.textContent).toContain("[AR] Service 1");
  });

  it("shows the hint, and says so when there are no services", async () => {
    await setup({ options: [], hint: "X.HINT" });
    expect(el().textContent).toContain("X.HINT");
    expect(el().textContent).toContain("SERVICE_PICKER.EMPTY");
    expect(checks()).toHaveLength(0);
  });

  it("shows the error and marks the group invalid", async () => {
    await setup({ error: "X.ERROR" });
    expect(el().querySelector('[role="alert"]')!.textContent).toContain("X.ERROR");
    expect(el().querySelector(".sp--invalid")).not.toBeNull();
  });

  it("shows no error and is not invalid by default", async () => {
    await setup();
    expect(el().querySelector('[role="alert"]')).toBeNull();
    expect(el().querySelector(".sp--invalid")).toBeNull();
  });
});
