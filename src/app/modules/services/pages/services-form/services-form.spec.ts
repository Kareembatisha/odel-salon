import { TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  ParamMap,
  Router,
  convertToParamMap,
  provideRouter,
} from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockDb } from "@core/mock/mock-db";
import { BRANCH_REPOSITORY } from "../../../branches/repository/branch.repository";
import { BranchMockRepository } from "../../../branches/repository/branch-mock.repository";
import { SERVICE_REPOSITORY } from "../../repository/service.repository";
import { ServiceMockRepository } from "../../repository/service-mock.repository";
import { ServicesForm } from "./services-form";

describe("ServicesForm (rendered against the mock backend)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const route: { snapshot: { paramMap: ParamMap } } = {
    snapshot: { paramMap: convertToParamMap({}) },
  };

  function configure(params: Record<string, string> = {}) {
    route.snapshot.paramMap = convertToParamMap(params);
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ServicesForm],
      providers: [
        provideRouter([]),
        { provide: SERVICE_REPOSITORY, useClass: ServiceMockRepository },
        { provide: BRANCH_REPOSITORY, useClass: BranchMockRepository },
        { provide: ActivatedRoute, useValue: route },
      ],
    });
  }

  function setup(params: Record<string, string> = {}) {
    configure(params);
    const fixture = TestBed.createComponent(ServicesForm);
    fixture.detectChanges();
    return fixture;
  }

  async function settle(fixture: ReturnType<typeof setup>) {
    await vi.advanceTimersByTimeAsync(2000);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function type(el: HTMLElement, selector: string, value: string, index = 0) {
    const input = el.querySelectorAll<HTMLInputElement>(selector)[index];
    input.value = value;
    input.dispatchEvent(new Event("input"));
  }

  it("create: shows a price card for every branch and blocks an empty submit with inline errors", async () => {
    const fixture = setup();
    const el = await settle(fixture);
    const db = TestBed.inject(MockDb);
    expect(el.querySelectorAll(".branch-card")).toHaveLength(db.branches.length);

    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector(".banner")).not.toBeNull();
    expect(el.textContent).toContain("SERVICES.VALIDATION.NAME_EN_REQUIRED");
    expect(el.textContent).toContain("SERVICES.VALIDATION.DURATION_REQUIRED");
    expect(db.services.some((s) => s.nameEn === "Beard sculpt")).toBe(false);
  });

  it('create: "copy to all branches" fills every card, then a valid form creates the service and returns to the list', async () => {
    const fixture = setup();
    const el = await settle(fixture);
    const db = TestBed.inject(MockDb);
    const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);

    const inputs = "app-float-label-input input";
    type(el, inputs, "نحت اللحية", 0);
    type(el, inputs, "Beard sculpt", 1);
    // First card: duration, regular, vip.
    type(el, inputs, "30", 2);
    type(el, inputs, "120", 3);
    type(el, inputs, "160", 4);
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>(".branch-card__foot button")!.click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await vi.advanceTimersByTimeAsync(2000);
    fixture.detectChanges();

    const created = db.services.find((s) => s.nameEn === "Beard sculpt")!;
    expect(created.prices).toHaveLength(db.branches.length);
    expect(
      created.prices.every(
        (p) => p.regularPrice === 120 && p.vipPrice === 160 && p.durationMinutes === 30,
      ),
    ).toBe(true);
    expect(navigate).toHaveBeenCalledWith(["/main/services"]);
  });

  it('edit: loads the service, shows the "set prices" state for an unpriced branch and highlights unused booking types', async () => {
    configure({ id: "1" });
    const db = TestBed.inject(MockDb);
    const haircut = db.services.find((s) => s.nameEn === "Haircut")!;
    haircut.prices = haircut.prices.slice(1);
    route.snapshot.paramMap = convertToParamMap({ id: String(haircut.id) });
    const fixture = TestBed.createComponent(ServicesForm);
    fixture.detectChanges();
    const el = await settle(fixture);

    expect(el.querySelector<HTMLInputElement>("app-float-label-input input")!.value).toBe(
      haircut.nameAr,
    );
    expect(el.querySelectorAll(".branch-card")).toHaveLength(db.branches.length);
    expect(el.textContent).toContain("SERVICES.FORM.UNPRICED_NOTE");
    const idleByBranch = db.branches.some((b) => !b.allowsVip || !b.allowsRegular);
    expect(el.querySelector(".field--idle") !== null).toBe(idleByBranch);
  });

  it("edit: an unknown service shows the failed state with a retry", async () => {
    const fixture = setup({ id: "99999" });
    const el = await settle(fixture);
    expect(el.querySelector("app-failed-state")).not.toBeNull();
    expect(el.querySelector("form")).toBeNull();
  });
});
