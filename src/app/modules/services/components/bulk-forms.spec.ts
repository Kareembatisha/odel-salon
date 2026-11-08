import { TestBed } from "@angular/core/testing";
import { TranslateModule } from "@ngx-translate/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockDb } from "@core/mock/mock-db";
import { BRANCH_REPOSITORY } from "../../branches/repository/branch.repository";
import { BranchMockRepository } from "../../branches/repository/branch-mock.repository";
import { SERVICE_REPOSITORY } from "../repository/service.repository";
import { ServiceMockRepository } from "../repository/service-mock.repository";
import { AdjustPricesForm } from "./adjust-prices-form/adjust-prices-form";
import { BulkStatusForm } from "./bulk-status-form/bulk-status-form";
import { CopyPricesForm } from "./copy-prices-form/copy-prices-form";

describe("Services bulk tools (rendered against the mock backend)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: SERVICE_REPOSITORY, useClass: ServiceMockRepository },
        { provide: BRANCH_REPOSITORY, useClass: BranchMockRepository },
      ],
    });
  });
  afterEach(() => vi.useRealTimers());

  const branches = () =>
    TestBed.inject(MockDb).branches.map((b) => ({ id: b.id, nameAr: b.nameAr, nameEn: b.nameEn }));

  function mount<T>(type: new () => T, inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(type);
    Object.entries(inputs).forEach(([k, v]) => fixture.componentRef.setInput(k, v));
    fixture.detectChanges();
    return fixture;
  }
  const settle = async (f: { detectChanges(): void }) => {
    await vi.advanceTimersByTimeAsync(2000);
    f.detectChanges();
  };

  it("change by %: previews old → new prices with the backend rounding and applies only when valid", async () => {
    const db = TestBed.inject(MockDb);
    const fixture = mount(AdjustPricesForm, { branches: branches(), initialBranchId: 3 });
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const submit = () => el.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit().disabled).toBe(true);

    const input = el.querySelector<HTMLInputElement>("app-float-label-input input")!;
    input.value = "10";
    input.dispatchEvent(new Event("input"));
    fixture.detectChanges();
    expect(el.querySelectorAll(".preview__row").length).toBeGreaterThan(0);
    expect(el.querySelector(".preview__prices strong")!.textContent).toMatch(/\d/);
    expect(submit().disabled).toBe(false);

    const haircut = db.services
      .find((s) => s.nameEn === "Haircut")!
      .prices.find((p) => p.branchId === 3)!;
    const before = haircut.regularPrice;
    let done = false;
    fixture.componentInstance.done.subscribe(() => (done = true));
    submit().click();
    await settle(fixture);
    expect(haircut.regularPrice).toBe(Math.round(before * 1.1));
    expect(done).toBe(true);
  });

  it("change by %: blocks a result above 100,000 EGP", async () => {
    const db = TestBed.inject(MockDb);
    db.services[0].prices.find((p) => p.branchId === 3)!.regularPrice = 90_000;
    const fixture = mount(AdjustPricesForm, { branches: branches(), initialBranchId: 3 });
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>("app-float-label-input input")!;
    input.value = "50";
    input.dispatchEvent(new Event("input"));
    fixture.detectChanges();
    expect(el.querySelector(".bf__note--warn")).not.toBeNull();
    expect(el.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  });

  it("copy prices: counts what will be copied, refuses the same branch and copies onto the target", async () => {
    const db = TestBed.inject(MockDb);
    const fixture = mount(CopyPricesForm, { branches: branches(), initialBranchId: 3 });
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const selects = el.querySelectorAll<HTMLSelectElement>("select");
    expect(selects[1].value).toBe("3");
    expect(el.textContent).toContain("SERVICES.BULK.COPY_COUNT");

    selects[0].value = "3";
    selects[0].dispatchEvent(new Event("change"));
    fixture.detectChanges();
    expect(el.textContent).toContain("SERVICES.ERRORS.SAME_BRANCH");
    expect(el.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);

    selects[0].value = "8";
    selects[0].dispatchEvent(new Event("change"));
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await settle(fixture);
    const haircut = db.services.find((s) => s.nameEn === "Haircut")!;
    const [src, dst] = [8, 3].map((id) => haircut.prices.find((p) => p.branchId === id)!);
    expect({ ...dst, branchId: 0 }).toEqual({ ...src, branchId: 0 });
  });

  it("set status in branches: needs a branch, then sets the chosen state for the ticked services", async () => {
    const db = TestBed.inject(MockDb);
    const ids = db.services.slice(0, 2).map((s) => s.id);
    const fixture = mount(BulkStatusForm, { branches: branches(), serviceIds: ids });
    const el = fixture.nativeElement as HTMLElement;
    const submit = () => el.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit().disabled).toBe(true);

    el.querySelectorAll<HTMLInputElement>(".choice--branches input")[2].click();
    el.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].click();
    fixture.detectChanges();
    expect(submit().disabled).toBe(false);

    submit().click();
    await settle(fixture);
    const branchId = branches()[1].id;
    ids.forEach((id) =>
      expect(
        db.services.find((s) => s.id === id)!.prices.find((p) => p.branchId === branchId)!.isActive,
      ).toBe(false),
    );
  });
});
