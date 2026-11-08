import { TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Observable, firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockDb } from "@core/mock/mock-db";
import { NotificationService } from "@core/services/notification.service";
import { BarberMockRepository } from "./barbers/repository/barber-mock.repository";
import { BranchPayload } from "./branches/model/branch.model";
import { BranchMockRepository } from "./branches/repository/branch-mock.repository";
import { ChairType } from "./chairs/model/chair.model";
import { ChairMockRepository } from "./chairs/repository/chair-mock.repository";

/**
 * Cross-module QA — Branches ⇄ Chairs ⇄ Barbers wired through the shared MockDb.
 * `it.fails` = confirmed defect (asserts the CORRECT behaviour, currently fails). Ids (XM-xx) match the QA summary.
 */

describe("Salon cross-module QA", () => {
  let db: MockDb;
  let branches: BranchMockRepository;
  let chairs: ChairMockRepository;
  let barbers: BarberMockRepository;

  async function settle<T>(obs: Observable<T>): Promise<T> {
    const result = firstValueFrom(obs);
    result.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1000);
    return result;
  }
  async function failure(obs: Observable<unknown>): Promise<{ status?: number; message: string }> {
    try {
      await settle(obs);
    } catch (e) {
      return e as { status?: number; message: string };
    }
    throw new Error("expected the call to fail");
  }
  const branch = (id: number) => db.branches.find((b) => b.id === id)!;

  /** A fresh branch with exactly the given chairs / barbers, hidden unless stated. */
  async function newBranch(over: Partial<BranchPayload> = {}): Promise<number> {
    const payload: BranchPayload = {
      nameAr: "فرع اختبار",
      nameEn: "QA Branch",
      address: "x",
      mapUrl: null,
      phone: "+201001102194",
      allowsRegular: true,
      allowsVip: false,
      allowsHome: false,
      workingHours: [],
      ...over,
    };
    return (await settle(branches.createBranch(payload))).data!;
  }
  const addChair = async (branchId: number, name: string, type = ChairType.Regular) =>
    (await settle(chairs.createChair({ branchId, name, type }))).data!;
  let phoneSeq = 0;
  const addBarber = async (branchId: number, name = "QA Barber") =>
    (
      await settle(
        barbers.createBarber({
          branchId,
          fullName: name,
          phone: `+20109900${String(1000 + phoneSeq++)}`,
        }),
      )
    ).data!;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    TestBed.inject(TranslateService).use("en");
    const notify = TestBed.inject(NotificationService);
    vi.spyOn(notify, "warning").mockImplementation(() => undefined);
    vi.spyOn(notify, "success").mockImplementation(() => undefined);
    db = TestBed.inject(MockDb);
    branches = TestBed.inject(BranchMockRepository);
    chairs = TestBed.inject(ChairMockRepository);
    barbers = TestBed.inject(BarberMockRepository);
  });
  afterEach(() => vi.useRealTimers());

  describe("seed data integrity", () => {
    it("branch totals equal the real chair and barber rows", () => {
      for (const b of db.branches) {
        expect(
          db.chairs.filter((c) => c.branchId === b.id && c.type === ChairType.Regular),
        ).toHaveLength(b.regularChairsCount);
        expect(
          db.chairs.filter((c) => c.branchId === b.id && c.type === ChairType.Vip),
        ).toHaveLength(b.vipChairsCount);
        expect(db.barbers.filter((x) => x.branchId === b.id)).toHaveLength(b.barbersCount);
      }
    });

    it("ids are unique, phones are unique, chair names are unique per branch", () => {
      expect(new Set(db.chairs.map((c) => c.id)).size).toBe(db.chairs.length);
      expect(new Set(db.barbers.map((x) => x.id)).size).toBe(db.barbers.length);
      expect(new Set(db.barbers.map((x) => x.phone)).size).toBe(db.barbers.length);
      expect(new Set(db.chairs.map((c) => `${c.branchId}:${c.name.toLowerCase()}`)).size).toBe(
        db.chairs.length,
      );
    });

    it("every seeded phone is a valid Egyptian mobile", () => {
      db.barbers.forEach((x) => expect(x.phone).toMatch(/^\+201\d{9}$/));
    });

    it("denormalised branch names on chairs and barbers match their branch", () => {
      for (const c of db.chairs)
        expect([c.branchNameAr, c.branchNameEn]).toEqual([
          branch(c.branchId).nameAr,
          branch(c.branchId).nameEn,
        ]);
      for (const x of db.barbers)
        expect([x.branchNameAr, x.branchNameEn]).toEqual([
          branch(x.branchId).nameAr,
          branch(x.branchId).nameEn,
        ]);
    });

    it('every VISIBLE seeded branch already satisfies the "can be shown" rules', () => {
      for (const b of db.branches.filter((x) => x.isVisible)) {
        const active = (type: ChairType) =>
          db.chairs.some((c) => c.branchId === b.id && c.type === type && c.isActive);
        if (b.allowsRegular) expect(active(ChairType.Regular), `${b.nameEn}: regular`).toBe(true);
        if (b.allowsVip) expect(active(ChairType.Vip), `${b.nameEn}: vip`).toBe(true);
        expect(
          db.barbers.some((x) => x.branchId === b.id && x.isActive),
          `${b.nameEn}: barber`,
        ).toBe(true);
      }
    });
  });

  describe("branch ⇄ chairs ⇄ barbers rules", () => {
    it("a new branch is hidden and cannot be shown until it has a chair and an active barber", async () => {
      const id = await newBranch();
      expect(branch(id).isVisible).toBe(false);
      expect((await failure(branches.toggleBranchStatus(id))).status).toBeUndefined(); // validation, not HTTP
      await addChair(id, "R1");
      expect((await failure(branches.toggleBranchStatus(id))).status).toBeUndefined(); // still no barber
      await addBarber(id);
      expect((await settle(branches.toggleBranchStatus(id))).status).toBe(true);
      expect(branch(id).isVisible).toBe(true);
    });

    it("a suspended barber does not make a branch showable", async () => {
      const id = await newBranch();
      await addChair(id, "R1");
      const bid = await addBarber(id);
      await settle(barbers.toggleBarberStatus(bid));
      expect((await failure(branches.toggleBranchStatus(id))).status).toBeUndefined();
    });

    it("once visible, the last active chair and the last active barber are locked (409)", async () => {
      const id = await newBranch();
      const cid = await addChair(id, "R1");
      const bid = await addBarber(id);
      await settle(branches.toggleBranchStatus(id));
      expect((await failure(chairs.toggleChairStatus(cid))).status).toBe(409);
      expect((await failure(barbers.toggleBarberStatus(bid))).status).toBe(409);
      // hiding releases both locks
      await settle(branches.toggleBranchStatus(id));
      expect((await settle(chairs.toggleChairStatus(cid))).status).toBe(true);
      expect((await settle(barbers.toggleBarberStatus(bid))).status).toBe(true);
    });

    it("a branch with chairs or barbers cannot be deleted (409); an empty one can", async () => {
      const id = await newBranch();
      const cid = await addChair(id, "R1");
      expect((await failure(branches.deleteBranches({ ids: [id] }))).status).toBe(409);
      await settle(chairs.deleteChairs({ ids: [cid] }));
      const bid = await addBarber(id);
      expect((await failure(branches.deleteBranches({ ids: [id] }))).status).toBe(409);
      await settle(barbers.deleteBarbers({ ids: [bid] }));
      expect((await settle(branches.deleteBranches({ ids: [id] }))).status).toBe(true);
      expect(db.branches.some((b) => b.id === id)).toBe(false);
    });

    it("a bulk branch delete is all-or-nothing", async () => {
      const empty = await newBranch();
      const busy = await newBranch();
      await addChair(busy, "R1");
      expect((await failure(branches.deleteBranches({ ids: [empty, busy] }))).status).toBe(409);
      expect(db.branches.some((b) => b.id === empty)).toBe(true);
    });

    it("the branch list shows the live chair and barber totals after changes in the other modules", async () => {
      const id = await newBranch({ allowsVip: true });
      await addChair(id, "R1");
      await addChair(id, "V1", ChairType.Vip);
      await addChair(id, "V2", ChairType.Vip);
      await addBarber(id);
      const res = await settle(branches.getBranches({ pageNumber: 1, pageSize: 100 }));
      const item = res.data!.find((b) => b.id === id)!;
      expect([item.regularChairsCount, item.vipChairsCount, item.barbersCount]).toEqual([1, 2, 1]);
    });

    it("moving a barber to another branch updates the barber lists of both", async () => {
      const a = await newBranch();
      const b = await newBranch();
      const x = await addBarber(a);
      await addBarber(a, "Second");
      const barber = db.barbers.find((y) => y.id === x)!;
      await settle(
        barbers.updateBarber(x, {
          branchId: b,
          fullName: barber.fullName,
          phone: barber.phone,
          image: null,
          removeImage: false,
        }),
      );
      expect(branch(a).barbersCount).toBe(1);
      expect(branch(b).barbersCount).toBe(1);
    });
  });

  describe("confirmed defects", () => {
    // XM-01 — the branch mock checks ACTIVE barbers but only TOTAL chair counts, so a branch whose only
    // chair is inactive can be shown. The real API (and the mock's own comment) require an ACTIVE chair.
    it.fails("XM-01: a branch whose only chair is inactive cannot be shown", async () => {
      const id = await newBranch();
      const cid = await addChair(id, "R1");
      await settle(chairs.toggleChairStatus(cid)); // hidden branch → deactivating is allowed
      await addBarber(id);
      await failure(branches.toggleBranchStatus(id));
    });

    // XM-02 — renaming a branch leaves the old name on its chairs and barbers (denormalised copies are
    // never refreshed), so the Chairs / Barbers lists show a stale branch name until a reload of the mock DB.
    it.fails("XM-02: renaming a branch is reflected on its chairs and barbers", async () => {
      const id = await newBranch();
      await addChair(id, "R1");
      await addBarber(id);
      await settle(
        branches.updateBranch(id, {
          nameAr: "اسم جديد",
          nameEn: "Renamed",
          address: "x",
          mapUrl: null,
          phone: "+201001102194",
          allowsRegular: true,
          allowsVip: false,
          allowsHome: false,
          workingHours: [],
        }),
      );
      expect(
        db.chairs.filter((c) => c.branchId === id).every((c) => c.branchNameEn === "Renamed"),
      ).toBe(true);
      expect(
        db.barbers.filter((x) => x.branchId === id).every((x) => x.branchNameEn === "Renamed"),
      ).toBe(true);
    });
  });
});
