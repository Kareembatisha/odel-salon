import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockDb } from "@core/mock/mock-db";
import { AuthService } from "../../../auth/service/auth.service";
import { BRANCH_REPOSITORY } from "../../../branches/repository/branch.repository";
import { BranchMockRepository } from "../../../branches/repository/branch-mock.repository";
import { SERVICE_REPOSITORY } from "../../repository/service.repository";
import { ServiceMockRepository } from "../../repository/service-mock.repository";
import { ServicesList } from "./services-list";

describe("ServicesList (rendered against the mock backend)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ServicesList],
      providers: [
        provideRouter([]),
        { provide: SERVICE_REPOSITORY, useClass: ServiceMockRepository },
        { provide: BRANCH_REPOSITORY, useClass: BranchMockRepository },
        { provide: AuthService, useValue: { hasPermission: () => true } },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  async function render() {
    const fixture = TestBed.createComponent(ServicesList);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(2000);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("renders the four summary cards and one row per service of the first branch", async () => {
    const el = await render();
    const db = TestBed.inject(MockDb);
    expect(el.querySelectorAll("app-stat-card")).toHaveLength(4);
    expect(el.querySelectorAll("tbody tr").length).toBe(db.services.length);
    expect(el.textContent).toContain("Haircut");
  });

  it('marks services without a price in the branch as "Not priced" and gives them no switch', async () => {
    const el = await render();
    const db = TestBed.inject(MockDb);
    TestBed.inject(MockDb).services.find((s) => s.nameEn === "Hair colour")!.prices = [];
    // Re-open the page state so the table reflects the edited DB.
    const fixture = TestBed.createComponent(ServicesList);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(2000);
    fixture.detectChanges();
    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll("tbody tr"));
    const colour = rows.find((r) => r.textContent?.includes("Hair colour"))!;
    expect(colour.textContent).toContain("SERVICES.STATUS.NOT_PRICED");
    expect(colour.querySelector("app-switch")).toBeNull();
    expect(db.services.length).toBeGreaterThan(0);
    expect(el).toBeTruthy();
  });
});
