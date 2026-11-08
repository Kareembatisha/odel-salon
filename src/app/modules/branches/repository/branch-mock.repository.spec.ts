import { TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Observable, firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockDb } from "@core/mock/mock-db";
import { LanguageService } from "@core/services/language.service";
import { NotificationService } from "@core/services/notification.service";
import { BranchPayload } from "../model/branch.model";
import { BranchMockRepository } from "./branch-mock.repository";

const PAYLOAD: BranchPayload = {
  nameAr: "فرع جديد",
  nameEn: "New Branch",
  address: "1 Test St",
  mapUrl: "https://maps.example/x",
  phone: "+201001234567",
  allowsRegular: true,
  allowsVip: true,
  allowsHome: false,
  workingHours: [{ dayOfWeek: 6, isOpen: true, openTime: "09:00:00", closeTime: "23:00:00" }],
};

describe("BranchMockRepository", () => {
  let repo: BranchMockRepository;
  let db: MockDb;
  let warning: ReturnType<typeof vi.spyOn>;

  /** Resolves a mock response past its simulated latency. */
  async function settle<T>(obs: Observable<T>): Promise<T> {
    const result = firstValueFrom(obs);
    result.catch(() => undefined); // avoid an unhandled rejection while timers advance
    await vi.advanceTimersByTimeAsync(1000);
    return result;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation("en", {
      BRANCHES: {
        ERRORS: {
          DELETE_BLOCKED_CHAIRS: "{{name}} has {{count}} chair(s)",
          DELETE_BLOCKED_BARBERS: "{{name}} has {{count}} barber(s)",
        },
      },
    });
    translate.setTranslation("ar", {
      BRANCHES: { ERRORS: { DELETE_BLOCKED_CHAIRS: "لا يمكن حذف {{name}}: {{count}} كرسي" } },
    });
    translate.use("en");
    repo = TestBed.inject(BranchMockRepository);
    db = TestBed.inject(MockDb);
    warning = vi.spyOn(TestBed.inject(NotificationService), "warning");
  });

  afterEach(() => vi.useRealTimers());

  describe("getBranches", () => {
    it("lists newest first with pagination meta", async () => {
      const res = await settle(repo.getBranches({ pageNumber: 1, pageSize: 5 }));

      expect(res.data!.map((b) => b.id)).toEqual(
        [...db.branches.map((b) => b.id)].sort((a, b) => b - a).slice(0, 5),
      );
      expect(res.meta).toMatchObject({
        currentPage: 1,
        pageSize: 5,
        totalCount: db.branches.length,
        hasPreviousPage: false,
        hasNextPage: true,
      });
    });

    it("returns the requested page", async () => {
      const res = await settle(repo.getBranches({ pageNumber: 2, pageSize: 10 }));

      expect(res.data!.length).toBe(db.branches.length - 10);
      expect(res.meta).toMatchObject({ currentPage: 2, hasPreviousPage: true, hasNextPage: false });
    });

    it("searches name, address and phone — case-insensitive and trimmed", async () => {
      const byEn = await settle(
        repo.getBranches({ pageNumber: 1, pageSize: 50, search: "  ZAMALEK " }),
      );
      expect(byEn.data!.map((b) => b.nameEn)).toEqual(["Zamalek"]);

      const byAr = await settle(
        repo.getBranches({ pageNumber: 1, pageSize: 50, search: "المعادي" }),
      );
      expect(byAr.data!.map((b) => b.nameEn)).toEqual(["Maadi"]);

      const byAddress = await settle(
        repo.getBranches({ pageNumber: 1, pageSize: 50, search: "abbas el akkad" }),
      );
      expect(byAddress.data!.map((b) => b.nameEn)).toEqual(["Nasr City"]);

      const byPhone = await settle(
        repo.getBranches({ pageNumber: 1, pageSize: 50, search: "+201020304050" }),
      );
      expect(byPhone.data!.map((b) => b.nameEn)).toEqual(["Zamalek"]);
    });

    it("filters by visibility only when it is set — false means hidden only", async () => {
      const all = await settle(repo.getBranches({ pageNumber: 1, pageSize: 50 }));
      const shown = await settle(
        repo.getBranches({ pageNumber: 1, pageSize: 50, isVisible: true }),
      );
      const hidden = await settle(
        repo.getBranches({ pageNumber: 1, pageSize: 50, isVisible: false }),
      );

      expect(shown.data!.every((b) => b.isVisible)).toBe(true);
      expect(hidden.data!.length).toBeGreaterThan(0);
      expect(hidden.data!.every((b) => !b.isVisible)).toBe(true);
      expect(shown.data!.length + hidden.data!.length).toBe(all.data!.length);
    });

    it("hands out copies — mutating a result never touches the database", async () => {
      const res = await settle(repo.getBranches({ pageNumber: 1, pageSize: 50 }));
      res.data![0].nameEn = "Mutated";

      expect(db.branches.some((b) => b.nameEn === "Mutated")).toBe(false);
    });
  });

  describe("getBranchById", () => {
    it("returns the details with working hours, without the list-only counters", async () => {
      const res = await settle(repo.getBranchById(1));

      expect(res.status).toBe(true);
      expect(res.data!.nameEn).toBe("Zamalek");
      expect(res.data!.workingHours.length).toBe(7);
      expect(res.data).not.toHaveProperty("barbersCount");
    });

    it("answers a 404 body for an unknown id instead of throwing", async () => {
      const res = await settle(repo.getBranchById(9999));

      expect(res).toMatchObject({ status: false, statusCode: 404, data: null });
    });
  });

  describe("createBranch", () => {
    it("adds a hidden branch with zero counters and returns its id", async () => {
      const expectedId = db.nextBranchId;
      const res = await settle(repo.createBranch(PAYLOAD));

      expect(res.data).toBe(expectedId);
      const created = db.branches.find((b) => b.id === expectedId)!;
      expect(created).toMatchObject({
        nameEn: "New Branch",
        isVisible: false,
        barbersCount: 0,
        regularChairsCount: 0,
        vipChairsCount: 0,
        updatedAt: null,
      });
      expect(created.workingHours).toEqual(PAYLOAD.workingHours);
    });

    it("allocates a fresh id every time", async () => {
      const a = await settle(repo.createBranch(PAYLOAD));
      const b = await settle(repo.createBranch(PAYLOAD));

      expect(a.data).not.toBe(b.data);
    });
  });

  describe("updateBranch", () => {
    it("replaces the editable fields, stamps updatedAt and keeps visibility", async () => {
      const before = db.branches.find((b) => b.id === 1)!;
      const visible = before.isVisible;

      const res = await settle(repo.updateBranch(1, { ...PAYLOAD, nameEn: "Renamed" }));

      expect(res.status).toBe(true);
      expect(before.nameEn).toBe("Renamed");
      expect(before.isVisible).toBe(visible);
      expect(before.updatedAt).not.toBeNull();
    });

    it("answers a 404 body for an unknown id", async () => {
      const res = await settle(repo.updateBranch(9999, PAYLOAD));

      expect(res).toMatchObject({ status: false, statusCode: 404 });
    });
  });

  describe("toggleBranchStatus", () => {
    it("always allows hiding", async () => {
      const branch = db.branches.find((b) => b.isVisible)!;

      await settle(repo.toggleBranchStatus(branch.id));

      expect(branch.isVisible).toBe(false);
      expect(branch.updatedAt).not.toBeNull();
    });

    it("shows a hidden branch that has a barber and a chair for each enabled type", async () => {
      const branch = db.branches.find((b) => b.id === 1)!;
      branch.isVisible = false;

      const res = await settle(repo.toggleBranchStatus(1));

      expect(res.message).toBe("Branch Updated Successfully");
      expect(branch.isVisible).toBe(true);
    });

    it("refuses to show a branch missing a chair of an enabled type — and says what is missing", async () => {
      const branch = db.branches.find((b) => b.id === 1)!;
      Object.assign(branch, { isVisible: false, allowsVip: true, vipChairsCount: 0 });

      await expect(settle(repo.toggleBranchStatus(1))).rejects.toBeTruthy();

      expect(branch.isVisible).toBe(false);
      expect(warning).toHaveBeenCalledWith(
        "VALIDATION_FIELDS.AllowsVip",
        "BRANCHES.ERRORS.SHOW_NEEDS_CHAIR",
      );
    });

    it("refuses to show a branch with no barber", async () => {
      const branch = db.branches.find((b) => b.id === 1)!;
      Object.assign(branch, { isVisible: false, barbersCount: 0 });

      await expect(settle(repo.toggleBranchStatus(1))).rejects.toBeTruthy();

      expect(warning).toHaveBeenCalledWith(
        "VALIDATION_FIELDS.Barbers",
        "BRANCHES.ERRORS.SHOW_NEEDS_BARBER",
      );
    });

    it("fails with 404 for an unknown id", async () => {
      await expect(settle(repo.toggleBranchStatus(9999))).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("deleteBranches", () => {
    function emptyBranch(): number {
      const id = db.nextBranchId++;
      db.branches.push({
        ...db.branches[0],
        id,
        nameEn: `Empty ${id}`,
        barbersCount: 0,
        regularChairsCount: 0,
        vipChairsCount: 0,
      });
      return id;
    }

    it("deletes branches that have no chairs and no barbers", async () => {
      const a = emptyBranch();
      const b = emptyBranch();

      const res = await settle(repo.deleteBranches({ ids: [a, b] }));

      expect(res.message).toBe("Branch Deleted Successfully");
      expect(db.branches.some((x) => x.id === a || x.id === b)).toBe(false);
    });

    it("is all-or-nothing: one blocked branch (409) deletes none", async () => {
      const empty = emptyBranch();
      const blocked = db.branches.find((b) => b.barbersCount > 0 || b.regularChairsCount > 0)!;
      const count = db.branches.length;

      await expect(settle(repo.deleteBranches({ ids: [empty, blocked.id] }))).rejects.toMatchObject(
        { status: 409 },
      );

      expect(db.branches.length).toBe(count);
    });

    it("names the blocked branch in the 409 message", async () => {
      const blocked = db.branches.find((b) => b.regularChairsCount + b.vipChairsCount > 0)!;

      await expect(settle(repo.deleteBranches({ ids: [blocked.id] }))).rejects.toThrow(
        blocked.nameEn,
      );
    });

    it("words the 409 in Arabic, with the Arabic branch name, when the app is in Arabic", async () => {
      TestBed.inject(TranslateService).use("ar");
      TestBed.inject(LanguageService).setLang("ar");
      const blocked = db.branches.find((b) => b.regularChairsCount + b.vipChairsCount > 0)!;

      await expect(settle(repo.deleteBranches({ ids: [blocked.id] }))).rejects.toThrow(
        `لا يمكن حذف ${blocked.nameAr}`,
      );
      localStorage.clear();
    });

    it("fails with 404 when any id is unknown, deleting nothing", async () => {
      const empty = emptyBranch();
      const count = db.branches.length;

      await expect(settle(repo.deleteBranches({ ids: [empty, 9999] }))).rejects.toMatchObject({
        status: 404,
      });

      expect(db.branches.length).toBe(count);
    });

    it("rejects an empty id list with 400", async () => {
      await expect(settle(repo.deleteBranches({ ids: [] }))).rejects.toMatchObject({ status: 400 });
    });
  });
});
