import { TestBed } from "@angular/core/testing";
import { TranslateModule } from "@ngx-translate/core";
import { Observable, firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockDb } from "@core/mock/mock-db";
import { NotificationService } from "@core/services/notification.service";
import { BranchMockRepository } from "../branches/repository/branch-mock.repository";
import { BARBER_REPOSITORY } from "./repository/barber.repository";
import { BarberMockRepository } from "./repository/barber-mock.repository";
import { BarbersService } from "./service/barbers.service";

/**
 * The real service on top of the real mock backend (no fakes): the path the app takes
 * with `useMock: true`. Guards that the layers still agree with each other.
 */
describe("Barbers (service + mock backend)", () => {
  let service: BarbersService;
  let db: MockDb;
  let branches: BranchMockRepository;

  /** Run an observable past the mock's simulated latency. */
  async function run<T>(obs: Observable<T>): Promise<T> {
    const result = firstValueFrom(obs);
    result.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1000);
    return result;
  }

  async function reload() {
    service.load();
    await vi.advanceTimersByTimeAsync(1000);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [{ provide: BARBER_REPOSITORY, useClass: BarberMockRepository }],
    });
    service = TestBed.inject(BarbersService);
    db = TestBed.inject(MockDb);
    branches = TestBed.inject(BranchMockRepository);
    vi.spyOn(TestBed.inject(NotificationService), "success");
    vi.spyOn(TestBed.inject(NotificationService), "warning");
  });

  afterEach(() => vi.useRealTimers());

  it("loads the first page from the seeded barbers: 10 rows, sorted by name, with the right total", async () => {
    await reload();

    expect(service.barbers()).toHaveLength(10);
    expect(service.totalCount()).toBe(db.barbers.length);
    const names = service.barbers().map((b) => b.fullName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("finds the contract’s example barbers by name and by phone", async () => {
    service.setFilters({ search: "karim" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.barbers().map((b) => b.fullName)).toContain("Karim Mostafa");

    service.setFilters({ search: "+201112223344" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.barbers().map((b) => b.fullName)).toEqual(["Omar Adel"]);
  });

  it("create → shows up in the list and bumps the branch’s barbersCount", async () => {
    const branch = db.branches.find((b) => b.id === 3)!;
    const before = branch.barbersCount;

    service.setFilters({ branchId: 3 });
    await vi.advanceTimersByTimeAsync(1000);
    const id = await run(
      service.createBarber({ branchId: 3, fullName: "Aaa New Barber", phone: "+201555555551" }),
    );

    expect(id).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1000); // the reload the service triggers
    expect(service.barbers()[0]).toMatchObject({ id, fullName: "Aaa New Barber", isActive: true });
    expect(branch.barbersCount).toBe(before + 1);
  });

  it("a duplicate phone is refused and nothing is added", async () => {
    const taken = db.barbers[0].phone;
    const before = db.barbers.length;

    const id = await run(service.createBarber({ branchId: 3, fullName: "Dup", phone: taken }));

    expect(id).toBeNull();
    expect(db.barbers).toHaveLength(before);
  });

  it("suspending the last active barber of a visible branch is refused (409) and the row stays active", async () => {
    // Visible branch 1, with every barber but one already suspended.
    const mine = db.barbers.filter((b) => b.branchId === 1);
    expect(db.branches.find((b) => b.id === 1)!.isVisible).toBe(true);
    mine.forEach((b, i) => (b.isActive = i === 0));
    service.setFilters({ branchId: 1 });
    await vi.advanceTimersByTimeAsync(1000);

    expect(await run(service.toggleStatus(mine[0].id))).toBe(false);
    expect(mine[0].isActive).toBe(true);

    // Activating another barber lifts the lock.
    expect(await run(service.toggleStatus(mine[1].id))).toBe(true);
    expect(await run(service.toggleStatus(mine[0].id))).toBe(true);
    expect(mine[0].isActive).toBe(false);
  });

  it("bulk-deleting every active barber of a visible branch is refused as a whole", async () => {
    const group = db.barbers.filter((b) => b.branchId === 2);
    const before = db.barbers.length;

    expect(await run(service.remove(group.map((b) => b.id)))).toBe(false);
    expect(db.barbers).toHaveLength(before);
  });

  it("hiding a branch first lifts the lock, and its barbers can then be bulk-deleted (counts follow)", async () => {
    const branch = db.branches.find((b) => b.id === 2)!;
    await run(branches.toggleBranchStatus(2)); // hide
    expect(branch.isVisible).toBe(false);

    const ids = db.barbers.filter((b) => b.branchId === 2).map((b) => b.id);
    expect(await run(service.remove(ids))).toBe(true);
    expect(db.barbers.filter((b) => b.branchId === 2)).toHaveLength(0);
    expect(branch.barbersCount).toBe(0);
  });

  it("a hidden branch whose only barbers are suspended cannot be shown again", async () => {
    const branch = db.branches.find((b) => b.id === 9)!; // seeded hidden
    expect(branch.isVisible).toBe(false);
    db.barbers.filter((b) => b.branchId === 9).forEach((b) => (b.isActive = false));

    await expect(run(branches.toggleBranchStatus(9))).rejects.toBeTruthy();
    expect(branch.isVisible).toBe(false);
  });
});
