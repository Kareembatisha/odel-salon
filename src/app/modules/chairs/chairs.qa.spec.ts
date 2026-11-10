import { TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Observable, Subject, firstValueFrom, of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockChair, MockDb } from "@core/mock/mock-db";
import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import { AuthService } from "../auth/service/auth.service";
import { BRANCH_REPOSITORY } from "../branches/repository/branch.repository";
import { ChairForm } from "./components/chair-form/chair-form";
import { ChairType, ChairListItem } from "./model/chair.model";
import { CHAIR_REPOSITORY } from "./repository/chair.repository";
import { ChairMockRepository } from "./repository/chair-mock.repository";
import { ChairsList } from "./pages/chairs-list/chairs-list";
import { ChairsService } from "./service/chairs.service";
import { buildChairsParams } from "./utils/chair-query";
import { readChairsSummary } from "./utils/chair-summary.util";

/**
 * Chairs — QA suite (black-box boundaries + confirmed defects).
 * `it.fails` = confirmed defect: asserts the CORRECT behaviour, currently fails (reported as a pass).
 * When the defect is fixed it turns red — remove `.fails` then. Ids (CH-xx) match the QA report.
 */

const REGULAR = ChairType.Regular;
const VIP = ChairType.Vip;
const ok = <T>(data: T): ApiResponse<T> => ({
  status: true,
  statusCode: 200,
  message: "ok",
  errors: null,
  meta: null,
  data,
});

describe("Chairs QA — query & summary helpers", () => {
  const base = { pageNumber: 2, pageSize: 12 };

  it("always sends paging and omits every unset filter", () => {
    expect(buildChairsParams(base).toString()).toBe("pageNumber=2&pageSize=12");
  });

  it("sends type=0 (Regular) and isActive=false — falsy values are real filters", () => {
    const p = buildChairsParams({ ...base, type: REGULAR, isActive: false, branchId: 0 });
    expect(p.get("type")).toBe("0");
    expect(p.get("isActive")).toBe("false");
    expect(p.get("branchId")).toBe("0");
  });

  it("omits an empty search term", () => {
    expect(buildChairsParams({ ...base, search: "" }).has("search")).toBe(false);
  });

  it("readChairsSummary zeroes anything that is not a finite number", () => {
    const meta = (additionalData: Record<string, unknown>) =>
      ({
        currentPage: 1,
        pageSize: 12,
        totalPages: 1,
        totalCount: 0,
        hasPreviousPage: false,
        hasNextPage: false,
        additionalData,
      }) as never;
    expect(
      readChairsSummary(meta({ regularActive: "3", vipActive: NaN, inactive: Infinity })),
    ).toEqual({ regularActive: 0, vipActive: 0, inactive: 0 });
    expect(readChairsSummary(meta({ regularActive: 3, vipActive: 2, inactive: 1 }))).toEqual({
      regularActive: 3,
      vipActive: 2,
      inactive: 1,
    });
    expect(readChairsSummary(null)).toEqual({ regularActive: 0, vipActive: 0, inactive: 0 });
    expect(readChairsSummary(meta(null as never))).toEqual({
      regularActive: 0,
      vipActive: 0,
      inactive: 0,
    });
  });
});

describe("Chairs QA — ChairForm", () => {
  const BRANCHES = [{ id: 2, nameAr: "فرع", nameEn: "Branch" }];

  function create(inputs: { branches?: typeof BRANCHES; initialBranchId?: number | null } = {}) {
    TestBed.configureTestingModule({ imports: [ChairForm, TranslateModule.forRoot()] });
    TestBed.inject(TranslateService).use("en");
    const fixture = TestBed.createComponent(ChairForm);
    fixture.componentRef.setInput("mode", "create");
    fixture.componentRef.setInput("branches", inputs.branches ?? BRANCHES);
    fixture.componentRef.setInput("initialBranchId", inputs.initialBranchId ?? null);
    fixture.detectChanges();
    return {
      fixture,
      form: (fixture.componentInstance as unknown as { form: ChairForm["form" & keyof ChairForm] })
        .form as never as import("@angular/forms").FormGroup,
    };
  }

  it.each([
    ["a", true],
    ["a".repeat(50), true],
    ["a".repeat(51), false],
    ["   ", false],
    ["", false],
  ])("name %j → valid=%s", (name, valid) => {
    const { form } = create();
    form.get("name")!.setValue(name);
    expect(form.get("name")!.valid).toBe(valid);
  });

  it("a new create form is invalid until a branch is chosen", () => {
    const { form } = create();
    form.get("name")!.setValue("R1");
    expect(form.invalid).toBe(true);
    form.get("branchId")!.setValue("2");
    expect(form.valid).toBe(true);
  });

  it("pre-selects the filtered branch when it is already in the list", () => {
    expect(create({ initialBranchId: 2 }).form.get("branchId")!.value).toBe("2");
  });

  it("does not pre-select a branch that is not in the list", () => {
    expect(create({ initialBranchId: 99 }).form.get("branchId")!.value).toBe("");
  });

  // CH-01 — maxlength runs on the raw value but the payload is trimmed: a 50-char name with a
  // trailing space is refused although what would be sent (50 chars) is valid. The mock accepts it.
  it("CH-01: the 50-character limit is applied to the trimmed name", () => {
    const { form } = create();
    form.get("name")!.setValue("a".repeat(50) + " ");
    expect(form.get("name")!.errors).toBeNull();
  });

  // CH-02 — the drawer can open before the branch list has loaded; the initial branch is only
  // looked up once (ngOnInit), so it is never selected when the options arrive afterwards.
  it("CH-02: the filtered branch is pre-selected when the options arrive after the form opened", () => {
    const { fixture, form } = create({ branches: [], initialBranchId: 2 });
    fixture.componentRef.setInput("branches", BRANCHES);
    fixture.detectChanges();
    expect(form.get("branchId")!.value).toBe("2");
  });
});

describe("Chairs QA — ChairMockRepository business rules", () => {
  let repo: ChairMockRepository;
  let db: MockDb;

  async function settle<T>(obs: Observable<T>): Promise<T> {
    const result = firstValueFrom(obs);
    result.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1000);
    return result;
  }
  async function failure(obs: Observable<unknown>): Promise<{ status: number }> {
    try {
      await settle(obs);
    } catch (e) {
      return e as { status: number };
    }
    throw new Error("expected the call to fail");
  }

  function arrange(
    chairs: Array<[string, ChairType, boolean]>,
    branch: { isVisible?: boolean; allowsRegular?: boolean; allowsVip?: boolean } = {},
  ): MockChair[] {
    Object.assign(
      db.branches.find((b) => b.id === 1)!,
      { isVisible: true, allowsRegular: true, allowsVip: true, ...branch },
    );
    db.chairs = db.chairs.filter((c) => c.branchId !== 1);
    const made = chairs.map(([name, type, isActive]) => ({
      id: db.nextChairId++,
      branchId: 1,
      branchNameAr: "الزمالك",
      branchNameEn: "Zamalek",
      name,
      type,
      isActive,
      createdAt: "2026-11-02T14:20:11Z",
      updatedAt: null,
    }));
    db.chairs.push(...made);
    return made;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    TestBed.inject(TranslateService).use("en");
    vi.spyOn(TestBed.inject(NotificationService), "warning").mockImplementation(() => undefined);
    db = TestBed.inject(MockDb);
    repo = TestBed.inject(ChairMockRepository);
  });
  afterEach(() => vi.useRealTimers());

  it("bulk delete of EVERY active chair of an offered type is blocked, even one by one it would pass", async () => {
    const [a, b] = arrange([
      ["R1", REGULAR, true],
      ["R2", REGULAR, true],
    ]);
    expect((await failure(repo.deleteChairs({ ids: [a.id, b.id] }))).status).toBe(409);
    expect((await settle(repo.deleteChairs({ ids: [a.id] }))).status).toBe(true);
  });

  it("a bulk delete that leaves one active chair of the type is allowed", async () => {
    const [a, , c] = arrange([
      ["R1", REGULAR, true],
      ["R2", REGULAR, true],
      ["R3", REGULAR, true],
    ]);
    expect((await settle(repo.deleteChairs({ ids: [a.id, c.id] }))).status).toBe(true);
    expect(db.chairs.filter((x) => x.branchId === 1)).toHaveLength(1);
  });

  it("duplicate ids in one delete request are tolerated", async () => {
    const [a] = arrange([
      ["R1", REGULAR, true],
      ["R2", REGULAR, true],
    ]);
    expect((await settle(repo.deleteChairs({ ids: [a.id, a.id] }))).status).toBe(true);
  });

  it("one unknown id aborts the whole delete (404) and removes nothing", async () => {
    const [a] = arrange([
      ["R1", REGULAR, true],
      ["R2", REGULAR, true],
    ]);
    expect((await failure(repo.deleteChairs({ ids: [a.id, 99999] }))).status).toBe(404);
    expect(db.chairs.some((c) => c.id === a.id)).toBe(true);
  });

  it("a hidden branch is never restricted", async () => {
    const [a] = arrange([["R1", REGULAR, true]], { isVisible: false });
    expect((await settle(repo.toggleChairStatus(a.id))).status).toBe(true);
    expect(a.isActive).toBe(false);
  });

  it("a type the branch does not offer is never restricted", async () => {
    const [v] = arrange(
      [
        ["V1", VIP, true],
        ["R1", REGULAR, true],
      ],
      { allowsVip: false },
    );
    expect((await settle(repo.toggleChairStatus(v.id))).status).toBe(true);
  });

  it("changing the type of the last active chair of an offered type is blocked (409)", async () => {
    const [r] = arrange([
      ["R1", REGULAR, true],
      ["V1", VIP, true],
    ]);
    expect((await failure(repo.updateChair(r.id, { name: "R1", type: VIP }))).status).toBe(409);
    expect(r.type).toBe(REGULAR);
  });

  it("name uniqueness is per branch and case-insensitive; renaming a chair to its own name in another case is allowed", async () => {
    const [r1] = arrange([
      ["R1", REGULAR, true],
      ["R2", REGULAR, true],
    ]);
    expect(
      (await failure(repo.createChair({ branchId: 1, name: " r1 ", type: REGULAR }))).status,
    ).toBe(400);
    expect((await failure(repo.updateChair(r1.id, { name: "r2", type: REGULAR }))).status).toBe(
      400,
    );
    expect((await settle(repo.updateChair(r1.id, { name: "r1", type: REGULAR }))).status).toBe(
      true,
    );
    expect(r1.name).toBe("r1");
  });

  it("the same name may exist in another branch", async () => {
    arrange([["QA-1", REGULAR, true]]);
    expect(
      (await settle(repo.createChair({ branchId: 2, name: "QA-1", type: REGULAR }))).statusCode,
    ).toBe(201);
  });

  it("keeps the branch totals in sync on create and delete (inactive chairs count)", async () => {
    const [, i] = arrange(
      [
        ["R1", REGULAR, true],
        ["R2", REGULAR, false],
      ],
      { isVisible: false },
    );
    const branch = db.branches.find((b) => b.id === 1)!;
    await settle(repo.createChair({ branchId: 1, name: "V1", type: VIP }));
    expect([branch.regularChairsCount, branch.vipChairsCount]).toEqual([2, 1]);
    await settle(repo.deleteChairs({ ids: [i.id] }));
    expect([branch.regularChairsCount, branch.vipChairsCount]).toEqual([1, 1]);
  });

  it("summary counts ignore type / status / search filters but follow the branch", async () => {
    arrange([
      ["R1", REGULAR, true],
      ["V1", VIP, true],
      ["R2", REGULAR, false],
    ]);
    const res = await settle(
      repo.getChairs({ pageNumber: 1, pageSize: 12, branchId: 1, type: VIP, search: "zzz" }),
    );
    expect(res.meta!.additionalData).toEqual({ regularActive: 1, vipActive: 1, inactive: 1 });
  });

  it("sorts names naturally (R2 before R10) and Regular before VIP", async () => {
    arrange([
      ["R10", REGULAR, true],
      ["V1", VIP, true],
      ["R2", REGULAR, true],
    ]);
    const res = await settle(repo.getChairs({ pageNumber: 1, pageSize: 12, branchId: 1 }));
    expect(res.data!.map((c) => c.name)).toEqual(["R2", "R10", "V1"]);
  });

  it("a page beyond the last returns no rows but a consistent meta", async () => {
    arrange([["R1", REGULAR, true]]);
    const res = await settle(repo.getChairs({ pageNumber: 5, pageSize: 12, branchId: 1 }));
    expect(res.data).toEqual([]);
    expect(res.meta).toMatchObject({
      totalCount: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: true,
    });
  });

  // CH-05 — fixed in Step 06: the mock rejects an out-of-range type like the real API does.
  it("CH-05: creating a chair with an invalid type is rejected (400)", async () => {
    arrange([["R1", REGULAR, true]]);
    expect(
      (await failure(repo.createChair({ branchId: 1, name: "X", type: 7 as ChairType }))).status,
    ).toBe(400);
  });
});

describe("Chairs QA — overlapping mutations and handler guards", () => {
  let toggles: Subject<ApiResponse<null>>[];
  let deletes: Subject<ApiResponse<null>>[];
  const toggled: number[] = [];
  const deleted: number[][] = [];

  const item: ChairListItem = {
    id: 7,
    branchId: 3,
    branchNameAr: "م",
    branchNameEn: "N",
    name: "R1",
    type: REGULAR,
    isActive: true,
  };

  function configure(perms: string[]) {
    toggles = [];
    deletes = [];
    toggled.length = 0;
    deleted.length = 0;
    TestBed.configureTestingModule({
      imports: [ChairsList, TranslateModule.forRoot()],
      providers: [
        { provide: NotificationService, useValue: { success: vi.fn(), warning: vi.fn() } },
        {
          provide: CHAIR_REPOSITORY,
          useValue: {
            getChairs: () => new Subject(),
            toggleChairStatus: (id: number) => {
              toggled.push(id);
              const s = new Subject<ApiResponse<null>>();
              toggles.push(s);
              return s;
            },
            deleteChairs: (p: { ids: number[] }) => {
              deleted.push(p.ids);
              const s = new Subject<ApiResponse<null>>();
              deletes.push(s);
              return s;
            },
            updateChair: () => of(ok(null)),
          },
        },
        {
          provide: BRANCH_REPOSITORY,
          useValue: { getBranches: () => of({ ...ok([]), meta: null }) },
        },
        { provide: AuthService, useValue: { hasPermission: (p: string) => perms.includes(p) } },
      ],
    });
  }

  it("`saving` is true during a single mutation and false after", () => {
    configure(["Chair.View"]);
    const service = TestBed.inject(ChairsService);
    service.toggleStatus(1).subscribe();
    expect(service.saving()).toBe(true);
    toggles[0].next(ok(null));
    toggles[0].complete();
    expect(service.saving()).toBe(false);
  });

  // CH-03 — same pattern as BR-04: one boolean flag shared by every mutation.
  it("CH-03: `saving` stays true until the LAST overlapping mutation finishes", () => {
    configure(["Chair.View"]);
    const service = TestBed.inject(ChairsService);
    service.toggleStatus(1).subscribe();
    service.remove([2]).subscribe();
    toggles[0].next(ok(null));
    toggles[0].complete();
    expect(service.saving()).toBe(true);
    deletes[0].next(ok(null));
    deletes[0].complete();
    expect(service.saving()).toBe(false);
  });

  // CH-04 — defence in depth: the card hides the controls, but the page handlers themselves
  // never check Chair.ToggleStatus / Chair.Delete / Chair.Edit (openEdit is the only one that does).
  it("openEdit already refuses without Chair.Edit (the model the other handlers should follow)", () => {
    configure(["Chair.View"]);
    const page = TestBed.createComponent(ChairsList).componentInstance as unknown as {
      openEdit(c: ChairListItem): void;
      drawerOpen(): boolean;
    };
    page.openEdit(item);
    expect(page.drawerOpen()).toBe(false);
  });

  it("CH-04: toggle() sends nothing without Chair.ToggleStatus", () => {
    configure(["Chair.View"]);
    const page = TestBed.createComponent(ChairsList).componentInstance as unknown as {
      toggle(c: ChairListItem): void;
    };
    page.toggle(item);
    expect(toggled).toEqual([]);
  });

  it("CH-04: askDelete() + confirmDelete() send nothing without Chair.Delete", () => {
    configure(["Chair.View"]);
    const page = TestBed.createComponent(ChairsList).componentInstance as unknown as {
      askDelete(c: ChairListItem): void;
      confirmDelete(): void;
    };
    page.askDelete(item);
    page.confirmDelete();
    expect(deleted).toEqual([]);
  });
});
