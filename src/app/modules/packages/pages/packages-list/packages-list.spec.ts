import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Observable, Subject, of } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import { ApiResponse } from "@shared/model/api_response.model";
import { AuthService } from "../../../auth/service/auth.service";
import { BranchListItem } from "../../../branches/model/branch.model";
import { BRANCH_REPOSITORY } from "../../../branches/repository/branch.repository";
import { ServiceListItem } from "../../../services/model/service.model";
import { ServicesService } from "../../../services/service/services.service";
import { toServiceOptions } from "../../../services/utils/service-option.util";
import {
  CreatePackagePayload,
  PackageDetails,
  PackageListItem,
  PackagesQuery,
  UpdatePackagePayload,
} from "../../model/package.model";
import { PACKAGE_REPOSITORY } from "../../repository/package.repository";
import { PackagesList } from "./packages-list";

const ALL_PERMS = ["Package.View", "Package.Create", "Package.Edit", "Package.Delete"];

function pkg(id: number, over: Partial<PackageListItem> = {}): PackageListItem {
  return {
    id,
    branchId: 3,
    nameAr: `باقة ${id}`,
    nameEn: `Package ${id}`,
    regularPrice: 200,
    vipPrice: 300,
    homePrice: null,
    isActive: true,
    services: [
      { serviceId: 1, nameAr: "قص", nameEn: "Haircut" },
      { serviceId: 2, nameAr: "لحية", nameEn: "Beard trim" },
    ],
    originalRegularPrice: 230,
    originalVipPrice: 390,
    originalHomePrice: null,
    durationMinutes: 60,
    ...over,
  };
}

/** Active services of the branch: 1 + 2 cost 230 regular / 390 VIP — exactly pkg(1)'s "before discount". */
function serviceRow(id: number, regularPrice: number, vipPrice: number): ServiceListItem {
  return {
    id,
    nameAr: `خدمة ${id}`,
    nameEn: `Service ${id}`,
    pricing: {
      isPriced: true,
      isActive: true,
      durationMinutes: 30,
      regularPrice,
      vipPrice,
      isHomeAvailable: false,
      homePrice: null,
    },
  };
}
const SERVICE_ROWS = [serviceRow(1, 120, 200), serviceRow(2, 110, 190), serviceRow(3, 50, 80)];

function detailsOf(item: PackageListItem): PackageDetails {
  return {
    ...item,
    branchNameAr: "فرع 3",
    branchNameEn: "Branch 3",
    createdAt: "2026-11-05T11:00:00Z",
    updatedAt: null,
  };
}

function branch(id: number): BranchListItem {
  return {
    id,
    nameAr: `فرع ${id}`,
    nameEn: `Branch ${id}`,
    address: "x",
    phone: "+201001102194",
    allowsRegular: true,
    allowsVip: true,
    allowsHome: false,
    isVisible: true,
    barbersCount: 1,
    regularChairsCount: 1,
    vipChairsCount: 1,
  };
}

function ok<T>(data: T): ApiResponse<T> {
  return { status: true, statusCode: 200, message: "ok", errors: null, meta: null, data };
}

function response(
  items: PackageListItem[],
  totalCount = items.length,
): ApiResponse<PackageListItem[]> {
  return {
    status: true,
    statusCode: 200,
    message: "ok",
    errors: null,
    data: items,
    meta: {
      currentPage: 1,
      pageSize: 12,
      totalPages: Math.max(1, Math.ceil(totalCount / 12)),
      totalCount,
      hasPreviousPage: false,
      hasNextPage: totalCount > 12,
      additionalData: { total: 5, active: 4 },
    },
  };
}

class FakePackageRepository {
  calls: PackagesQuery[] = [];
  pending: Array<Subject<ApiResponse<PackageListItem[]>>> = [];
  toggled: number[] = [];
  deleted: number[][] = [];
  created: CreatePackagePayload[] = [];
  updated: Array<{ id: number; payload: UpdatePackagePayload }> = [];
  /** What GET /packages/{id} answers (status:false = not found). */
  details: ApiResponse<PackageDetails | null> = ok(null as PackageDetails | null);
  /** Answer of every mutation (swap for a Subject to hold one in flight). */
  next: () => Observable<ApiResponse<unknown>> = () => of(ok(null));

  getPackages(q: PackagesQuery) {
    this.calls.push(q);
    const s = new Subject<ApiResponse<PackageListItem[]>>();
    this.pending.push(s);
    return s;
  }
  getPackageById() {
    return of(this.details as ApiResponse<PackageDetails>);
  }
  createPackage(p: CreatePackagePayload) {
    this.created.push(p);
    return of(ok(9));
  }
  updatePackage(id: number, payload: UpdatePackagePayload) {
    this.updated.push({ id, payload });
    return of(ok(null));
  }
  togglePackageStatus(id: number) {
    this.toggled.push(id);
    return this.next() as Observable<ApiResponse<null>>;
  }
  deletePackages(p: { ids: number[] }) {
    this.deleted.push(p.ids);
    return this.next() as Observable<ApiResponse<null>>;
  }

  get last() {
    return this.pending[this.pending.length - 1];
  }
  resolve(res: ApiResponse<PackageListItem[]>) {
    this.last.next(res);
    this.last.complete();
  }
}

describe("PackagesList", () => {
  let repo: FakePackageRepository;
  let fixture: ComponentFixture<PackagesList>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? "";
  const cards = () => Array.from(el().querySelectorAll<HTMLElement>("app-package-card"));
  const stats = () => Array.from(el().querySelectorAll("app-stat-card"));
  const filters = () =>
    Array.from(el().querySelectorAll<HTMLSelectElement>("app-filter-select select"));
  const cardSwitch = (card: HTMLElement) =>
    card.querySelector<HTMLButtonElement>("app-switch button");
  const trash = (card: HTMLElement) =>
    card.querySelector<HTMLButtonElement>('button[aria-label="COMMON.DELETE"]');
  const dialog = () => el().querySelector('[role="alertdialog"]');
  const confirmButton = () =>
    el().querySelector<HTMLButtonElement>(".dialog__actions app-button:last-child button")!;

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setup(
    perms: string[] = ["Package.View"],
    branches: BranchListItem[] = [branch(5), branch(3)],
  ) {
    repo = new FakePackageRepository();
    const permissions = new Set(perms);
    TestBed.configureTestingModule({
      imports: [PackagesList, TranslateModule.forRoot()],
      providers: [
        { provide: PACKAGE_REPOSITORY, useValue: repo },
        {
          provide: BRANCH_REPOSITORY,
          useValue: { getBranches: () => of({ ...ok(branches), meta: null }) },
        },
        {
          provide: ServicesService,
          useValue: { loadServiceOptions: () => of(toServiceOptions(SERVICE_ROWS)) },
        },
        { provide: AuthService, useValue: { hasPermission: (p: string) => permissions.has(p) } },
      ],
    });
    TestBed.inject(TranslateService).use("en");
    fixture = TestBed.createComponent(PackagesList);
    await settle();
  }

  /** Setup + answer the first list request so cards are on screen. */
  async function setupWithRows(
    perms: string[],
    items: PackageListItem[] = [pkg(1), pkg(2, { isActive: false })],
  ) {
    await setup(perms);
    repo.resolve(response(items));
    await settle();
  }

  function pick(select: HTMLSelectElement, value: string) {
    select.value = value;
    select.dispatchEvent(new Event("change"));
  }

  afterEach(() => localStorage.clear());

  describe("loading and data", () => {
    it("loads the FIRST branch (lowest id) with page 1 and no filters, behind placeholders", async () => {
      await setup();
      expect(repo.calls).toHaveLength(1);
      expect(repo.calls[0]).toEqual({ branchId: 3, pageNumber: 1, pageSize: 12 });
      expect(el().querySelector('.stats[aria-busy="true"]')).not.toBeNull();
      expect(el().querySelectorAll(".sk-card").length).toBeGreaterThan(0);
      expect(cards()).toHaveLength(0);
    });

    it("renders one card per package", async () => {
      await setupWithRows(["Package.View"]);
      expect(cards()).toHaveLength(2);
      expect(el().querySelectorAll(".sk-card")).toHaveLength(0);
      expect(cards()[0].textContent).toContain("Package 1");
      expect(cards()[1].textContent).toContain("PACKAGES.STATUS.INACTIVE");
    });

    it("shows total, active and (derived) inactive counts of the whole branch", async () => {
      await setupWithRows(["Package.View"]);
      expect(stats().map((s) => s.querySelector(".stat__value")?.textContent?.trim())).toEqual([
        "5",
        "4",
        "1",
      ]);
      expect(stats()[0].textContent).toContain("Branch 3");
    });

    it("shows the empty state when the branch has no packages and no filter", async () => {
      await setupWithRows(["Package.View"], []);
      expect(text()).toContain("PACKAGES.EMPTY_TITLE");
      expect(text()).not.toContain("PACKAGES.NO_RESULTS_TITLE");
      expect(el().querySelector("app-pagination")).toBeNull();
    });

    it('shows a "no branches" state, and requests nothing, when the salon has no branches', async () => {
      await setup(["Package.View"], []);
      expect(text()).toContain("PACKAGES.NO_BRANCHES_TITLE");
      expect(repo.calls).toHaveLength(0);
      expect(el().querySelector(".toolbar")).toBeNull();
    });

    it("shows the failed state with a working retry when the first load fails", async () => {
      await setup();
      repo.last.error(new Error("boom"));
      await settle();

      expect(el().querySelector("app-failed-state")).not.toBeNull();
      const before = repo.calls.length;
      el().querySelector<HTMLButtonElement>("app-failed-state button")!.click();
      expect(repo.calls.length).toBe(before + 1);
    });

    it("keeps the cards on screen while a reload is in flight (no placeholder flash)", async () => {
      await setupWithRows(ALL_PERMS);
      cardSwitch(cards()[0])!.click(); // toggling reloads the list; its response is still pending
      await settle();

      expect(cards()).toHaveLength(2);
      expect(el().querySelectorAll(".sk-card")).toHaveLength(0);
    });

    it("pages through the results", async () => {
      await setup(["Package.View"]);
      repo.resolve(
        response(
          Array.from({ length: 12 }, (_, i) => pkg(i + 1)),
          30,
        ),
      );
      await settle();

      el()
        .querySelector<HTMLButtonElement>('app-pagination button[aria-label="COMMON.NEXT"]')!
        .click();
      expect(repo.calls[repo.calls.length - 1].pageNumber).toBe(2);
    });
  });

  describe("filters", () => {
    it('offers every branch (no "All"), oldest first, with the first one selected', async () => {
      await setupWithRows(["Package.View"]);
      const select = filters()[0];
      expect(Array.from(select.options).map((o) => o.value)).toEqual(["3", "5"]);
      expect(select.value).toBe("3");
    });

    it("switching branch sends the new branchId as a number from page 1 and clears the old cards", async () => {
      await setupWithRows(["Package.View"]);
      pick(filters()[0], "5");
      await settle();

      expect(repo.calls[repo.calls.length - 1]).toMatchObject({ branchId: 5, pageNumber: 1 });
      expect(cards()).toHaveLength(0);
    });

    it('sends isActive=false for "Inactive" and clears it again with "All"', async () => {
      await setupWithRows(["Package.View"]);
      pick(filters()[1], "false");
      expect(repo.calls[repo.calls.length - 1].isActive).toBe(false);

      pick(filters()[1], "");
      expect(repo.calls[repo.calls.length - 1].isActive).toBeUndefined();
    });

    it("sends the search term on Enter", async () => {
      await setupWithRows(["Package.View"]);
      const input = el().querySelector<HTMLInputElement>("app-search-input input")!;
      input.value = "groom";
      input.dispatchEvent(new Event("input"));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

      expect(repo.calls[repo.calls.length - 1].search).toBe("groom");
    });

    it('shows "no results" (not "no packages yet") when a filter returns nothing', async () => {
      await setupWithRows(["Package.View"]);
      pick(filters()[1], "false");
      repo.resolve(response([], 0));
      await settle();

      expect(text()).toContain("PACKAGES.NO_RESULTS_TITLE");
      expect(text()).not.toContain("PACKAGES.EMPTY_TITLE");
    });
  });

  describe("permissions", () => {
    it("View only: read-only cards", async () => {
      await setupWithRows(["Package.View"]);
      expect(cardSwitch(cards()[0])).toBeNull();
      expect(trash(cards()[0])).toBeNull();
    });

    it("Edit gives the status switch, Delete gives the trash button", async () => {
      await setupWithRows(["Package.View", "Package.Edit"]);
      expect(cardSwitch(cards()[0])).not.toBeNull();
      expect(trash(cards()[0])).toBeNull();

      fixture.destroy();
      TestBed.resetTestingModule();
      await setupWithRows(["Package.View", "Package.Delete"]);
      expect(cardSwitch(cards()[0])).toBeNull();
      expect(trash(cards()[0])).not.toBeNull();
    });
  });

  describe("status switch", () => {
    it("toggles the package and reloads the branch", async () => {
      await setupWithRows(ALL_PERMS);
      const before = repo.calls.length;

      cardSwitch(cards()[0])!.click();
      await settle();

      expect(repo.toggled).toEqual([1]);
      expect(repo.calls.length).toBe(before + 1);
    });

    it("ignores a second click while the first toggle is in flight", async () => {
      await setupWithRows(ALL_PERMS);
      const held = new Subject<ApiResponse<unknown>>();
      repo.next = () => held;

      cardSwitch(cards()[0])!.click();
      await settle();
      cardSwitch(cards()[1])!.click();
      await settle();

      expect(repo.toggled).toEqual([1]);
    });
  });

  describe("create / edit drawer", () => {
    const addButton = () =>
      Array.from(el().querySelectorAll<HTMLButtonElement>("app-page-header button")).find((b) =>
        b.textContent?.includes("PACKAGES.NEW"),
      );
    const form = () => el().querySelector("app-package-form");
    const pencil = (card: HTMLElement) =>
      card.querySelector<HTMLButtonElement>('button[aria-label="COMMON.EDIT"]')!;
    const formInput = (label: string) =>
      el().querySelector<HTMLInputElement>(`app-package-form input[aria-label="${label}"]`)!;
    const checkboxes = () =>
      Array.from(el().querySelectorAll<HTMLInputElement>("app-package-form .sp__check"));
    const formButtons = () =>
      Array.from(el().querySelectorAll<HTMLButtonElement>("app-package-form .pf__footer button"));

    async function type(label: string, value: string) {
      const input = formInput(label);
      input.value = value;
      input.dispatchEvent(new Event("input"));
      input.dispatchEvent(new Event("blur"));
      await settle();
    }

    it('shows "Add package" only with Package.Create', async () => {
      await setupWithRows(["Package.View"]);
      expect(addButton()).toBeUndefined();

      fixture.destroy();
      TestBed.resetTestingModule();
      await setupWithRows(["Package.View", "Package.Create"]);
      expect(addButton()).toBeDefined();
    });

    it("create: opens the form for the selected branch with its active services, and cancel closes it", async () => {
      await setupWithRows(ALL_PERMS);
      addButton()!.click();
      await settle();

      expect(form()).not.toBeNull();
      expect(form()!.textContent).toContain("Branch 3");
      expect(checkboxes()).toHaveLength(3);

      formButtons()[0].click(); // Cancel
      await settle();
      expect(form()).toBeNull();
      expect(repo.created).toHaveLength(0);
    });

    it("create: submits the new package for the selected branch, closes the drawer and reloads", async () => {
      await setupWithRows(ALL_PERMS);
      const before = repo.calls.length;

      addButton()!.click();
      await settle();
      await type("PACKAGES.FORM.NAME_AR", "باقة جديدة");
      await type("PACKAGES.FORM.NAME_EN", "Brand New");
      checkboxes()[0].click();
      checkboxes()[1].click();
      await settle();
      await type("PACKAGES.FORM.REGULAR_PRICE", "200");
      await type("PACKAGES.FORM.VIP_PRICE", "340");
      formButtons()[1].click(); // submit
      await settle();

      expect(repo.created).toEqual([
        {
          branchId: 3,
          nameAr: "باقة جديدة",
          nameEn: "Brand New",
          serviceIds: [1, 2],
          regularPrice: 200,
          vipPrice: 340,
          homePrice: null,
        },
      ]);
      expect(form()).toBeNull();
      expect(repo.calls.length).toBe(before + 1);
    });

    it("edit: opens the form pre-filled from the loaded package", async () => {
      await setupWithRows(ALL_PERMS);
      repo.details = ok(detailsOf(pkg(1)));

      pencil(cards()[0]).click();
      await settle();

      expect(formInput("PACKAGES.FORM.NAME_EN").value).toBe("Package 1");
      expect(formInput("PACKAGES.FORM.REGULAR_PRICE").value).toBe("200");
      expect(checkboxes().map((c) => c.checked)).toEqual([true, true, false]);
    });

    it("edit: saves the changes, closes the drawer and reloads", async () => {
      await setupWithRows(ALL_PERMS);
      repo.details = ok(detailsOf(pkg(1)));
      const before = repo.calls.length;

      pencil(cards()[0]).click();
      await settle();
      await type("PACKAGES.FORM.NAME_EN", "Renamed");
      formButtons()[1].click();
      await settle();

      expect(repo.updated).toHaveLength(1);
      expect(repo.updated[0]).toMatchObject({
        id: 1,
        payload: { nameEn: "Renamed", serviceIds: [1, 2], regularPrice: 200 },
      });
      expect(form()).toBeNull();
      expect(repo.calls.length).toBe(before + 1);
    });

    it("edit: opens nothing when the package can no longer be loaded", async () => {
      await setupWithRows(ALL_PERMS);
      repo.details = { ...ok(null as PackageDetails | null), status: false, statusCode: 404 };

      pencil(cards()[0]).click();
      await settle();

      expect(form()).toBeNull();
    });

    it("edit: the name opens the same drawer", async () => {
      await setupWithRows(ALL_PERMS);
      repo.details = ok(detailsOf(pkg(1)));

      cards()[0].querySelector<HTMLButtonElement>(".pkg__link")!.click();
      await settle();

      expect(form()).not.toBeNull();
    });
  });

  describe("delete", () => {
    it("asks first, naming the package, and deletes nothing on cancel", async () => {
      await setupWithRows(ALL_PERMS);
      trash(cards()[0])!.click();
      await settle();

      expect(dialog()).not.toBeNull();
      expect(repo.deleted).toHaveLength(0);

      el()
        .querySelector<HTMLButtonElement>(".dialog__actions app-button:first-child button")!
        .click();
      await settle();
      expect(dialog()).toBeNull();
      expect(repo.deleted).toHaveLength(0);
    });

    it("deletes the package on confirm, closes the dialog and reloads", async () => {
      await setupWithRows(ALL_PERMS);
      const before = repo.calls.length;

      trash(cards()[0])!.click();
      await settle();
      confirmButton().click();
      await settle();

      expect(repo.deleted).toEqual([[1]]);
      expect(dialog()).toBeNull();
      expect(repo.calls.length).toBe(before + 1);
    });
  });
});
