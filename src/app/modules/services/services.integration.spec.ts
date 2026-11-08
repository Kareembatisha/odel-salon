import { TestBed } from "@angular/core/testing";
import { TranslateModule } from "@ngx-translate/core";
import { Observable, firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockDb } from "@core/mock/mock-db";
import { NotificationService } from "@core/services/notification.service";
import { BRANCH_REPOSITORY } from "../branches/repository/branch.repository";
import { BranchMockRepository } from "../branches/repository/branch-mock.repository";
import { ServicePayload } from "./model/service.model";
import { SERVICE_REPOSITORY } from "./repository/service.repository";
import { ServiceMockRepository } from "./repository/service-mock.repository";
import { ServicesService } from "./service/services.service";

/** The real service on top of the real mock backend (no fakes): the path the app takes with `useMock: true`. */
describe("Services (service + mock backend)", () => {
  let service: ServicesService;
  let db: MockDb;

  async function run<T>(obs: Observable<T>): Promise<T> {
    const result = firstValueFrom(obs);
    result.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1000);
    return result;
  }

  async function init() {
    service.initialize();
    await vi.advanceTimersByTimeAsync(2000);
  }

  function payload(overrides: Partial<ServicePayload> = {}): ServicePayload {
    return {
      nameAr: "خدمة جديدة",
      nameEn: "Brand new service",
      branches: db.branches.map((b) => ({
        branchId: b.id,
        durationMinutes: 40,
        regularPrice: 100,
        vipPrice: 150,
        isHomeAvailable: false,
        homePrice: null,
        isActive: true,
      })),
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: SERVICE_REPOSITORY, useClass: ServiceMockRepository },
        { provide: BRANCH_REPOSITORY, useClass: BranchMockRepository },
      ],
    });
    service = TestBed.inject(ServicesService);
    db = TestBed.inject(MockDb);
    vi.spyOn(TestBed.inject(NotificationService), "success");
    vi.spyOn(TestBed.inject(NotificationService), "warning");
  });

  afterEach(() => vi.useRealTimers());

  it("opens on the first branch with its table and the four summary counts", async () => {
    await init();
    expect(service.branchId()).toBe(db.branches[0].id);
    expect(service.services()).toHaveLength(db.services.length);
    expect(service.summary()).toMatchObject({ total: db.services.length, unpriced: 0 });
  });

  it("shows unpriced services of a branch without prices, and counts them", async () => {
    await init();
    service.selectBranch(14);
    await vi.advanceTimersByTimeAsync(1000);
    const unpriced = service.services().filter((s) => !s.pricing.isPriced);
    expect(unpriced.length).toBe(service.summary().unpriced);
    expect(unpriced.length).toBeGreaterThan(0);
    expect(unpriced[0].pricing).toMatchObject({ regularPrice: null, isActive: false });
  });

  it("the row switch deactivates a service in ONE branch only", async () => {
    await init();
    const id = service.services()[0].id;
    const ok = await run(service.setStatusInBranch(id, 1, false));
    expect(ok).toBe(true);
    const prices = db.services.find((s) => s.id === id)!.prices;
    expect(prices.find((p) => p.branchId === 1)!.isActive).toBe(false);
    expect(prices.filter((p) => p.branchId !== 1 && p.isActive).length).toBeGreaterThan(0);
  });

  it("refuses to deactivate the last active service of a visible branch (409, nothing changes)", async () => {
    await init();
    db.services.forEach((s, i) => {
      if (i > 0) s.prices.forEach((p) => p.branchId === 1 && (p.isActive = false));
    });
    const only = db.services[0];
    const ok = await run(service.setStatusInBranch(only.id, 1, false));
    expect(ok).toBe(false);
    expect(only.prices.find((p) => p.branchId === 1)!.isActive).toBe(true);
  });

  it("create needs every branch exactly once and unique names", async () => {
    expect(
      await run(service.createService(payload({ branches: payload().branches.slice(1) }))),
    ).toBeNull();
    expect(await run(service.createService(payload({ nameEn: "Haircut" })))).toBeNull();
    const before = db.services.length;
    const id = await run(service.createService(payload()));
    expect(id).not.toBeNull();
    expect(db.services).toHaveLength(before + 1);
  });

  it("change by % rounds to whole pounds and leaves durations alone", async () => {
    await init();
    const haircut = db.services.find((s) => s.nameEn === "Haircut")!;
    const row = haircut.prices.find((p) => p.branchId === 3)!;
    const [reg, vip, minutes] = [row.regularPrice, row.vipPrice, row.durationMinutes];
    expect(
      await run(service.adjustPrices({ branchId: 3, percentage: 10, serviceIds: [haircut.id] })),
    ).toBe(true);
    expect(row.regularPrice).toBe(Math.round(reg * 1.1));
    expect(row.vipPrice).toBe(Math.round(vip * 1.1));
    expect(row.durationMinutes).toBe(minutes);
  });

  it("copy prices overwrites the target and refuses the same branch", async () => {
    expect(await run(service.copyPrices({ sourceBranchId: 3, targetBranchId: 3 }))).toBe(false);
    expect(await run(service.copyPrices({ sourceBranchId: 3, targetBranchId: 8 }))).toBe(true);
    const haircut = db.services.find((s) => s.nameEn === "Haircut")!;
    const [src, dst] = [3, 8].map((id) => haircut.prices.find((p) => p.branchId === id)!);
    expect({ ...dst, branchId: 0 }).toEqual({ ...src, branchId: 0 });
  });

  it("delete removes the service from every branch (all-or-nothing)", async () => {
    await init();
    const before = db.services.length;
    expect(await run(service.remove([9999]))).toBe(false);
    expect(db.services).toHaveLength(before);
    expect(await run(service.remove([db.services[0].id]))).toBe(true);
    expect(db.services).toHaveLength(before - 1);
  });
  it("lists every branch as a blank row for the create form, with the booking types each offers", async () => {
    const rows = await run(service.getBranchesForForm());
    expect(rows.map((r) => r.branchId)).toEqual(db.branches.map((b) => b.id).sort((a, b) => a - b));
    expect(rows[0]).toMatchObject({ isPriced: false, regularPrice: null, isActive: true });
    expect(rows[0].branchAllowsRegular).toBe(
      db.branches.find((b) => b.id === rows[0].branchId)!.allowsRegular,
    );
  });

  it("a form-built payload round-trips: create, then load it back with every branch", async () => {
    const id = (await run(service.createService(payload())))!;
    const loaded = (await run(service.getService(id)))!;
    expect(loaded.nameEn).toBe("Brand new service");
    expect(loaded.branches).toHaveLength(db.branches.length);
    expect(loaded.branches.every((b) => b.isPriced && b.regularPrice === 100)).toBe(true);
  });

  it("updating a service rewrites its names and prices in every branch", async () => {
    const id = (await run(service.createService(payload())))!;
    const body = payload({ nameEn: "Renamed service" });
    body.branches[0].regularPrice = 111;
    expect(await run(service.updateService(id, body))).toBe(true);
    const row = db.services.find((s) => s.id === id)!;
    expect(row.nameEn).toBe("Renamed service");
    expect(row.prices.find((p) => p.branchId === body.branches[0].branchId)!.regularPrice).toBe(
      111,
    );
  });

  it("loads EVERY priced service of a branch for the previews, independent of the table", async () => {
    const rows = await run(service.loadBranchServices(3));
    expect(rows).toHaveLength(
      db.services.filter((s) => s.prices.some((p) => p.branchId === 3)).length,
    );
    expect(rows.every((r) => r.pricing.isPriced)).toBe(true);
    expect(service.services()).toEqual([]);
  });

  it("sets the status of several services in several branches with one success toast", async () => {
    await init();
    const [a, b] = db.services.slice(0, 2);
    const notify = TestBed.inject(NotificationService);
    expect(await run(service.setStatusForServices([a.id, b.id], [3, 8], false))).toBe(true);
    [a, b].forEach((s) =>
      [3, 8].forEach((branch) =>
        expect(s.prices.find((p) => p.branchId === branch)!.isActive).toBe(false),
      ),
    );
    expect(notify.success).toHaveBeenCalledTimes(1);
  });

  it("bulk status reports failure when one service is refused (last-active lock) and still reloads", async () => {
    await init();
    db.services.forEach((s, i) => {
      if (i > 0) s.prices.forEach((p) => p.branchId === 1 && (p.isActive = false));
    });
    expect(await run(service.setStatusForServices([db.services[0].id], [1], false))).toBe(false);
    expect(db.services[0].prices.find((p) => p.branchId === 1)!.isActive).toBe(true);
  });
});
