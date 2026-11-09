import { FormGroup } from "@angular/forms";
import { TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Observable, Subject, firstValueFrom, of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockBarber, MockDb } from "@core/mock/mock-db";
import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import { AuthService } from "../auth/service/auth.service";
import { BRANCH_REPOSITORY } from "../branches/repository/branch.repository";
import { BarberForm } from "./components/barber-form/barber-form";
import { BarberListItem } from "./model/barber.model";
import { BarberMockRepository } from "./repository/barber-mock.repository";
import { BARBER_REPOSITORY } from "./repository/barber.repository";
import { BarbersList } from "./pages/barbers-list/barbers-list";
import { BarbersService } from "./service/barbers.service";
import { buildCreateBarberFormData, buildUpdateBarberFormData } from "./utils/barber-form-data";
import { egyptianMobile } from "./utils/barber-form.validators";
import { validateBarberImage } from "./utils/barber-image.util";
import { isValidEgyptianMobile, normalizeEgyptianPhone } from "./utils/barber-phone.util";
import { buildBarbersParams } from "./utils/barber-query";

/**
 * Barbers — QA suite (black-box boundaries + confirmed defects).
 * `it.fails` = confirmed defect: asserts the CORRECT behaviour, currently fails (reported as a pass).
 * When the defect is fixed it turns red — remove `.fails` then. Ids (BA-xx) match the QA summary.
 */

const ok = <T>(data: T): ApiResponse<T> => ({
  status: true,
  statusCode: 200,
  message: "ok",
  errors: null,
  meta: null,
  data,
});
const file = (bytes: number, type: string, name = "p.png") =>
  new File([new Uint8Array(bytes)], name, { type });

describe("Barbers QA — phone normaliser & validator", () => {
  it.each([
    ["01001234567", "+201001234567"],
    ["1001234567", "+201001234567"],
    ["201001234567", "+201001234567"],
    ["+201001234567", "+201001234567"],
    ["00201001234567", "+201001234567"],
    ["+20 100 123 4567", "+201001234567"],
    ["010-0123-4567", "+201001234567"],
    ["010.0123.4567", "+201001234567"],
    ["  01001234567  ", "+201001234567"],
  ])("normalises %j → %s", (input, expected) => {
    expect(normalizeEgyptianPhone(input)).toBe(expected);
    expect(isValidEgyptianMobile(normalizeEgyptianPhone(input))).toBe(true);
  });

  it.each([
    "",
    "123",
    "0100123456",
    "010012345678",
    "+20100123456",
    "+2010012345678",
    "+441001234567",
    "02012345678",
  ])("rejects %j", (input) => {
    expect(isValidEgyptianMobile(normalizeEgyptianPhone(input))).toBe(false);
  });

  it("the validator leaves an empty value to `required`", () => {
    expect(egyptianMobile({ value: "" } as never)).toBeNull();
    expect(egyptianMobile({ value: null } as never)).toBeNull();
  });

  // BA-03 — every non-digit is stripped before matching, so text around a number is silently accepted
  // and the stored phone differs from what was typed.
  it.fails.each(["0100123456a7", "abc01001234567", "01001234567xyz"])(
    'BA-03: %j is rejected, not "cleaned" into a valid phone',
    (input) => {
      expect(egyptianMobile({ value: input } as never)).not.toBeNull();
    },
  );
});

describe("Barbers QA — photo, multipart and query helpers", () => {
  const MB = 1024 * 1024;

  it("accepts JPG / PNG / WEBP up to exactly 5 MB and rejects 5 MB + 1 byte", () => {
    expect(validateBarberImage(file(5 * MB, "image/jpeg"))).toBeNull();
    expect(validateBarberImage(file(1, "image/png"))).toBeNull();
    expect(validateBarberImage(file(1, "image/webp"))).toBeNull();
    expect(validateBarberImage(file(5 * MB + 1, "image/png"))).toBe("size");
  });

  it.each(["image/gif", "image/svg+xml", "application/pdf", ""])("rejects type %j", (type) => {
    expect(validateBarberImage(file(10, type))).toBe("type");
  });

  it("a wrong type wins over a too-large size", () => {
    expect(validateBarberImage(file(6 * MB, "image/gif"))).toBe("type");
  });

  it("create body: PascalCase fields, trimmed, no Image when none chosen", () => {
    const body = buildCreateBarberFormData({
      branchId: 3,
      fullName: " Ali ",
      phone: " +201001234567 ",
      image: null,
    });
    expect(Object.fromEntries(body.entries())).toEqual({
      BranchId: "3",
      FullName: "Ali",
      Phone: "+201001234567",
    });
  });

  it('update body: RemoveImage is "false" when a new image is chosen, even if removeImage was set', () => {
    const body = buildUpdateBarberFormData({
      branchId: 3,
      fullName: "Ali",
      phone: "+201001234567",
      image: file(5, "image/png"),
      removeImage: true,
    });
    expect(body.get("RemoveImage")).toBe("false");
    expect(body.get("Image")).toBeInstanceOf(File);
  });

  it('update body: RemoveImage is "true" only with no new image', () => {
    const body = buildUpdateBarberFormData({
      branchId: 3,
      fullName: "Ali",
      phone: "+201001234567",
      image: null,
      removeImage: true,
    });
    expect(body.get("RemoveImage")).toBe("true");
    expect(body.has("Image")).toBe(false);
  });

  it("query params send isActive=false and omit unset filters", () => {
    expect(buildBarbersParams({ pageNumber: 1, pageSize: 10 }).toString()).toBe(
      "pageNumber=1&pageSize=10",
    );
    const p = buildBarbersParams({
      pageNumber: 1,
      pageSize: 10,
      isActive: false,
      branchId: 4,
      search: "ali",
    });
    expect([p.get("isActive"), p.get("branchId"), p.get("search")]).toEqual(["false", "4", "ali"]);
  });
});

describe("Barbers QA — BarberForm", () => {
  const BRANCHES = [{ id: 2, nameAr: "فرع", nameEn: "Branch" }];

  function create(saving = false) {
    TestBed.configureTestingModule({ imports: [BarberForm, TranslateModule.forRoot()] });
    TestBed.inject(TranslateService).use("en");
    const fixture = TestBed.createComponent(BarberForm);
    fixture.componentRef.setInput("mode", "create");
    fixture.componentRef.setInput("branches", BRANCHES);
    fixture.componentRef.setInput("saving", saving);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as unknown as { form: FormGroup; submit(): void };
    const emitted: unknown[] = [];
    fixture.componentInstance.submitted.subscribe((p) => emitted.push(p));
    return { fixture, cmp, emitted };
  }

  it.each([
    ["a", true],
    ["a".repeat(100), true],
    ["a".repeat(101), false],
    ["   ", false],
    ["", false],
  ])("full name %j → valid=%s", (name, valid) => {
    const { cmp } = create();
    cmp.form.get("fullName")!.setValue(name);
    expect(cmp.form.get("fullName")!.valid).toBe(valid);
  });

  it("submits a normalised phone and a trimmed name", () => {
    const { cmp, emitted } = create();
    cmp.form.patchValue({ branchId: "2", fullName: "  Ali  ", phone: "010 0123 4567" });
    cmp.submit();
    expect(emitted).toEqual([
      { branchId: 2, fullName: "Ali", phone: "+201001234567", image: null },
    ]);
  });

  it("an invalid form emits nothing and marks every field touched", () => {
    const { cmp, emitted } = create();
    cmp.submit();
    expect(emitted).toEqual([]);
    expect(cmp.form.get("fullName")!.touched).toBe(true);
  });

  // BA-01 — ChairForm refuses to emit while `saving`; BarberForm does not, so pressing Enter in a
  // field during a running save sends the same request twice.
  it("BA-01: submit() emits nothing while a save is already running", () => {
    const { cmp, emitted } = create(true);
    cmp.form.patchValue({ branchId: "2", fullName: "Ali", phone: "+201001234567" });
    cmp.submit();
    expect(emitted).toEqual([]);
  });

  // BA-02 — same as CH-01: the 100-character limit is checked before trimming.
  it("BA-02: the 100-character limit applies to the trimmed name", () => {
    const { cmp } = create();
    cmp.form.get("fullName")!.setValue("a".repeat(100) + " ");
    expect(cmp.form.get("fullName")!.errors).toBeNull();
  });
});

describe("Barbers QA — BarberMockRepository business rules", () => {
  let repo: BarberMockRepository;
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

  /** Replaces the barbers of branch 1 with exactly these ([name, phone, isActive]) and configures the branch. */
  function arrange(
    list: Array<[string, string, boolean]>,
    branch: { isVisible?: boolean } = {},
  ): MockBarber[] {
    Object.assign(
      db.branches.find((b) => b.id === 1)!,
      { isVisible: true, ...branch },
    );
    db.barbers = db.barbers.filter((b) => b.branchId !== 1);
    const made = list.map(([fullName, phone, isActive]) => ({
      id: db.nextBarberId++,
      branchId: 1,
      branchNameAr: "الزمالك",
      branchNameEn: "Zamalek",
      fullName,
      phone,
      imageUrl: "https://img/x.png",
      isActive,
      createdAt: "2026-11-02T14:20:11Z",
      updatedAt: null,
    }));
    db.barbers.push(...made);
    return made;
  }
  const P1 = "+201090000001";
  const P2 = "+201090000002";
  const P3 = "+201090000003";
  const update = (
    b: MockBarber,
    over: Partial<{
      branchId: number;
      fullName: string;
      phone: string;
      image: File | null;
      removeImage: boolean;
    }> = {},
  ) =>
    repo.updateBarber(b.id, {
      branchId: b.branchId,
      fullName: b.fullName,
      phone: b.phone,
      image: null,
      removeImage: false,
      ...over,
    });

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    TestBed.inject(TranslateService).use("en");
    vi.spyOn(TestBed.inject(NotificationService), "warning").mockImplementation(() => undefined);
    db = TestBed.inject(MockDb);
    repo = TestBed.inject(BarberMockRepository);
  });
  afterEach(() => vi.useRealTimers());

  it("phone must be unique across ALL branches, but a barber may keep his own", async () => {
    const [a] = arrange([["Ali", P1, true]]);
    expect(
      (await failure(repo.createBarber({ branchId: 2, fullName: "Omar", phone: P1 }))).status,
    ).toBe(400);
    expect((await settle(update(a, { fullName: "Ali Renamed" }))).status).toBe(true);
  });

  it("a phone is compared after trimming", async () => {
    arrange([["Ali", P1, true]]);
    expect(
      (await failure(repo.createBarber({ branchId: 2, fullName: "Omar", phone: ` ${P1} ` })))
        .status,
    ).toBe(400);
  });

  it("rejects an invalid photo (type / size) and creates without one", async () => {
    arrange([["Ali", P1, true]]);
    expect(
      (
        await failure(
          repo.createBarber({
            branchId: 1,
            fullName: "N",
            phone: P2,
            image: file(10, "image/gif"),
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await failure(
          repo.createBarber({
            branchId: 1,
            fullName: "N",
            phone: P2,
            image: file(5 * 1024 * 1024 + 1, "image/png"),
          }),
        )
      ).status,
    ).toBe(400);
    const res = await settle(repo.createBarber({ branchId: 1, fullName: "N", phone: P2 }));
    expect(res.statusCode).toBe(201);
    expect(db.barbers.find((b) => b.id === res.data)!.imageUrl).toBeNull();
  });

  it("photo rules on edit: replace wins over remove, remove clears, neither keeps", async () => {
    const [a] = arrange([
      ["Ali", P1, true],
      ["Omar", P2, true],
    ]);
    await settle(update(a));
    expect(a.imageUrl).toBe("https://img/x.png");
    await settle(update(a, { removeImage: true }));
    expect(a.imageUrl).toBeNull();
    await settle(update(a, { image: file(5, "image/png"), removeImage: true }));
    expect(a.imageUrl).not.toBeNull();
  });

  it("the last active barber of a visible branch cannot be suspended, deleted or transferred (409)", async () => {
    const [a] = arrange([
      ["Ali", P1, true],
      ["Sus", P2, false],
    ]);
    expect((await failure(repo.toggleBarberStatus(a.id))).status).toBe(409);
    expect((await failure(repo.deleteBarbers({ ids: [a.id] }))).status).toBe(409);
    expect((await failure(update(a, { branchId: 2 }))).status).toBe(409);
    expect(db.barbers.some((b) => b.id === a.id && b.isActive && b.branchId === 1)).toBe(true);
  });

  it("a suspended barber never blocks, and a hidden branch is unrestricted", async () => {
    const [a, s] = arrange([
      ["Ali", P1, true],
      ["Sus", P2, false],
    ]);
    expect((await settle(repo.deleteBarbers({ ids: [s.id] }))).status).toBe(true);
    Object.assign(
      db.branches.find((b) => b.id === 1)!,
      { isVisible: false },
    );
    expect((await settle(repo.toggleBarberStatus(a.id))).status).toBe(true);
  });

  it("bulk delete of every active barber is blocked, leaving one is allowed", async () => {
    const [a, b, c] = arrange([
      ["A", P1, true],
      ["B", P2, true],
      ["C", P3, true],
    ]);
    expect((await failure(repo.deleteBarbers({ ids: [a.id, b.id, c.id] }))).status).toBe(409);
    expect((await settle(repo.deleteBarbers({ ids: [a.id, b.id] }))).status).toBe(true);
    expect(db.branches.find((x) => x.id === 1)!.barbersCount).toBe(1);
  });

  it("a transfer keeps both branch totals in sync", async () => {
    const [a] = arrange([
      ["A", P1, true],
      ["B", P2, true],
    ]);
    const target = db.branches.find((b) => b.id === 2)!;
    const before = target.barbersCount;
    await settle(update(a, { branchId: 2 }));
    expect(db.branches.find((b) => b.id === 1)!.barbersCount).toBe(1);
    expect(target.barbersCount).toBe(before + 1);
    expect(a.branchNameEn).toBe(target.nameEn);
  });

  it("suspended barbers count in the branch total", async () => {
    arrange([["A", P1, true]]);
    await settle(repo.createBarber({ branchId: 1, fullName: "B", phone: P2 }));
    expect(db.branches.find((b) => b.id === 1)!.barbersCount).toBe(2);
  });

  it("search matches name or phone, case-insensitively and trimmed; sorted by name", async () => {
    arrange([
      ["zed", P1, true],
      ["Amr", P2, true],
    ]);
    const byName = await settle(
      repo.getBarbers({ pageNumber: 1, pageSize: 10, branchId: 1, search: "  AMR " }),
    );
    expect(byName.data!.map((b) => b.fullName)).toEqual(["Amr"]);
    const byPhone = await settle(
      repo.getBarbers({ pageNumber: 1, pageSize: 10, branchId: 1, search: "0001" }),
    );
    expect(byPhone.data!.map((b) => b.fullName)).toEqual(["zed"]);
    const all = await settle(repo.getBarbers({ pageNumber: 1, pageSize: 10, branchId: 1 }));
    expect(all.data!.map((b) => b.fullName)).toEqual(["Amr", "zed"]);
  });

  it("an unknown branch is a 400 on create and edit; an unknown barber a 404", async () => {
    const [a] = arrange([["A", P1, true]]);
    expect(
      (await failure(repo.createBarber({ branchId: 9999, fullName: "N", phone: P2 }))).status,
    ).toBe(400);
    expect((await failure(update(a, { branchId: 9999 }))).status).toBe(400);
    expect((await failure(repo.toggleBarberStatus(99999))).status).toBe(404);
  });
});

describe("Barbers QA — service & list page guards", () => {
  let toggles: Subject<ApiResponse<null>>[];
  const toggled: number[] = [];
  const deleted: number[][] = [];
  const reloads = { count: 0 };

  const row = (id: number): BarberListItem => ({
    id,
    branchId: 3,
    branchNameAr: "م",
    branchNameEn: "N",
    fullName: `B${id}`,
    phone: `+2010000000${id}`,
    imageUrl: null,
    isActive: true,
  });

  function configure(perms: string[]) {
    toggles = [];
    toggled.length = 0;
    deleted.length = 0;
    reloads.count = 0;
    TestBed.configureTestingModule({
      imports: [BarbersList, TranslateModule.forRoot()],
      providers: [
        {
          provide: NotificationService,
          useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
        },
        {
          provide: BARBER_REPOSITORY,
          useValue: {
            getBarbers: () => {
              reloads.count++;
              return new Subject();
            },
            toggleBarberStatus: (id: number) => {
              toggled.push(id);
              const s = new Subject<ApiResponse<null>>();
              toggles.push(s);
              return s;
            },
            deleteBarbers: (p: { ids: number[] }) => {
              deleted.push(p.ids);
              return of(ok(null));
            },
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
  type Page = {
    toggle(b: BarberListItem): void;
    askDelete(b: BarberListItem, e: Event): void;
    askBulkDelete(): void;
    confirmDelete(): void;
    onSearch(t: string): void;
    selection: { (): Array<string | number>; set(v: Array<string | number>): void };
    openEdit(b: BarberListItem): void;
    drawerOpen(): boolean;
  };
  const page = () => TestBed.createComponent(BarbersList).componentInstance as unknown as Page;

  it("`saving` is true during a single mutation and false after", () => {
    configure(["Barber.View"]);
    const service = TestBed.inject(BarbersService);
    service.toggleStatus(1).subscribe();
    expect(service.saving()).toBe(true);
    toggles[0].next(ok(null));
    toggles[0].complete();
    expect(service.saving()).toBe(false);
  });

  // BA-04 — fixed in Step 04 (in-flight counter instead of one boolean flag).
  it("BA-04: `saving` stays true until the LAST overlapping mutation finishes", () => {
    configure(["Barber.View"]);
    const service = TestBed.inject(BarbersService);
    service.toggleStatus(1).subscribe(); // stays pending
    service.remove([2]).subscribe(); // completes immediately
    expect(service.saving()).toBe(true);
    toggles[0].next(ok(null));
    toggles[0].complete();
    expect(service.saving()).toBe(false);
  });

  it("openEdit already refuses without Barber.Edit", () => {
    configure(["Barber.View"]);
    const p = page();
    p.openEdit(row(1));
    expect(p.drawerOpen()).toBe(false);
  });

  // BA-05 — defence in depth (same as CH-04): only openEdit checks its permission.
  it("BA-05: toggle() sends nothing without Barber.Edit", () => {
    configure(["Barber.View"]);
    page().toggle(row(1));
    expect(toggled).toEqual([]);
  });

  it("BA-05: a delete confirmed without Barber.Delete sends nothing", () => {
    configure(["Barber.View"]);
    const p = page();
    p.askDelete(row(1), new Event("click"));
    p.confirmDelete();
    expect(deleted).toEqual([]);
  });

  // BA-06 — ChairsList / BranchesList ignore a search emission that changes nothing; BarbersList
  // reloads (and wipes the row selection) every time, e.g. on Enter in an empty box.
  it("BA-06: a search emission that changes nothing does not reload or clear the selection", () => {
    configure(["Barber.View", "Barber.Delete"]);
    const p = page();
    p.selection.set([1, 2]);
    const before = reloads.count;
    p.onSearch("");
    expect(reloads.count).toBe(before);
    expect(p.selection()).toEqual([1, 2]);
  });

  // BA-07 — deleting ONE row through its own button clears the whole selection, including rows
  // the user ticked for something else.
  it("BA-07: deleting one row keeps the other ticked rows selected", () => {
    configure(["Barber.View", "Barber.Delete"]);
    const p = page();
    p.selection.set([1, 2]);
    p.askDelete(row(1), new Event("click"));
    p.confirmDelete();
    expect(p.selection()).toEqual([2]);
  });
});
