import { TestBed } from "@angular/core/testing";
import { Observable, Subject, of, throwError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationService } from "@core/services/notification.service";
import { BranchesService } from "@modules/branches/service/branches.service";
import { ApiResponse } from "@shared/model/api_response.model";
import { PackageListItem, PackagesQuery } from "../model/package.model";
import { PACKAGE_REPOSITORY } from "../repository/package.repository";
import { PackagesService } from "./packages.service";

function pkg(id: number): PackageListItem {
  return {
    id,
    branchId: 3,
    nameAr: `باقة ${id}`,
    nameEn: `Package ${id}`,
    regularPrice: 200,
    vipPrice: 300,
    homePrice: null,
    isActive: true,
    services: [],
    originalRegularPrice: 230,
    originalVipPrice: 390,
    originalHomePrice: null,
    durationMinutes: 60,
  };
}

function page(items: PackageListItem[], currentPage = 1): ApiResponse<PackageListItem[]> {
  return {
    status: true,
    statusCode: 200,
    message: "ok",
    errors: null,
    data: items,
    meta: {
      currentPage,
      pageSize: 12,
      totalPages: 3,
      totalCount: 30,
      hasPreviousPage: currentPage > 1,
      hasNextPage: true,
      additionalData: { total: 30, active: 25 },
    },
  };
}

function ok<T>(data: T, status = true): ApiResponse<T> {
  return { status, statusCode: status ? 200 : 404, message: "msg", errors: null, meta: null, data };
}

class FakeRepository {
  calls: PackagesQuery[] = [];
  pending: Array<Subject<ApiResponse<PackageListItem[]>>> = [];
  create = vi.fn((): Observable<ApiResponse<number>> => of(ok(9)));
  update = vi.fn((): Observable<ApiResponse<null>> => of(ok(null)));
  toggle = vi.fn((): Observable<ApiResponse<null>> => of(ok(null)));
  remove = vi.fn((): Observable<ApiResponse<null>> => of(ok(null)));
  byId = vi.fn((): Observable<ApiResponse<unknown>> => of(ok({ id: 1 })));

  getPackages(q: PackagesQuery) {
    this.calls.push(q);
    const s = new Subject<ApiResponse<PackageListItem[]>>();
    this.pending.push(s);
    return s;
  }
  getPackageById() {
    return this.byId();
  }
  createPackage() {
    return this.create();
  }
  updatePackage() {
    return this.update();
  }
  togglePackageStatus() {
    return this.toggle();
  }
  deletePackages() {
    return this.remove();
  }
  get last() {
    return this.pending[this.pending.length - 1];
  }
  /** Answers the newest request the way HttpClient does: one value, then complete. */
  respond(res: ApiResponse<PackageListItem[]>) {
    this.last.next(res);
    this.last.complete();
  }
}

const BRANCHES = [
  { id: 5, nameAr: "القاهرة الجديدة", nameEn: "New Cairo" },
  { id: 3, nameAr: "مدينة نصر", nameEn: "Nasr City" },
];

describe("PackagesService", () => {
  let repo: FakeRepository;
  let service: PackagesService;
  let success: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    repo = new FakeRepository();
    success = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: PACKAGE_REPOSITORY, useValue: repo },
        { provide: BranchesService, useValue: { loadOptions: () => of(BRANCHES) } },
        { provide: NotificationService, useValue: { success, warning: vi.fn() } },
      ],
    });
    service = TestBed.inject(PackagesService);
  });

  describe("list", () => {
    it("selects the FIRST branch (lowest id) by default and loads its packages", () => {
      service.initialize();
      expect(service.branchId()).toBe(3);
      expect(repo.calls[0]).toMatchObject({ branchId: 3, pageNumber: 1, pageSize: 12 });

      repo.respond(page([pkg(1)]));
      expect(service.packages()).toHaveLength(1);
      expect(service.summary()).toEqual({ total: 30, active: 25 });
      expect(service.loading()).toBe(false);
    });

    it("keeps the selected branch between visits but resets search and paging", () => {
      service.initialize();
      service.selectBranch(5);
      service.setFilters({ search: "groom" });
      service.setPage(2);

      service.initialize();

      expect(service.branchId()).toBe(5);
      expect(repo.calls.at(-1)).toMatchObject({ branchId: 5, pageNumber: 1 });
      expect(repo.calls.at(-1)!.search).toBeUndefined();
    });

    it("selectBranch clears the old rows right away and restarts at page 1", () => {
      service.initialize();
      repo.respond(page([pkg(1)]));
      service.setPage(2);

      service.selectBranch(5);

      expect(service.packages()).toEqual([]);
      expect(service.meta()).toBeNull();
      expect(repo.calls.at(-1)).toMatchObject({ branchId: 5, pageNumber: 1 });
    });

    it("selecting the branch already on screen does nothing", () => {
      service.initialize();
      const before = repo.calls.length;
      service.selectBranch(3);
      expect(repo.calls).toHaveLength(before);
    });

    it("filters reload from page 1 and send isActive=false", () => {
      service.initialize();
      service.setPage(3);
      service.setFilters({ isActive: false });
      expect(repo.calls.at(-1)).toMatchObject({ isActive: false, pageNumber: 1 });
    });

    it("ignores a stale response when a newer request was issued", () => {
      service.initialize();
      const stale = repo.last;
      service.setFilters({ search: "new" });

      stale.next(page([pkg(1)]));
      expect(service.packages()).toEqual([]);

      repo.respond(page([pkg(2)]));
      expect(service.packages().map((p) => p.id)).toEqual([2]);
      expect(service.loading()).toBe(false);
    });

    it("flags an error but keeps the previous rows", () => {
      service.initialize();
      repo.respond(page([pkg(1)]));
      service.load();
      repo.last.error(new Error("boom"));

      expect(service.hasError()).toBe(true);
      expect(service.packages()).toHaveLength(1);
      expect(service.loading()).toBe(false);
    });

    it("does not request anything when the salon has no branches", () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: PACKAGE_REPOSITORY, useValue: repo },
          { provide: BranchesService, useValue: { loadOptions: () => of([]) } },
          { provide: NotificationService, useValue: { success, warning: vi.fn() } },
        ],
      });
      const empty = TestBed.inject(PackagesService);

      empty.initialize();

      expect(empty.noBranches()).toBe(true);
      expect(empty.branchId()).toBeNull();
      expect(repo.calls).toHaveLength(0);
    });
  });

  describe("mutations", () => {
    beforeEach(() => {
      service.initialize();
      repo.respond(page([pkg(1), pkg(2)]));
      repo.calls.length = 0;
    });

    it("create → new id, success toast, list reloaded", () => {
      let id: number | null = null;
      service
        .createPackage({
          branchId: 3,
          nameAr: "أ",
          nameEn: "A",
          serviceIds: [1, 2],
          regularPrice: 1,
          vipPrice: 1,
          homePrice: null,
        })
        .subscribe((v) => (id = v));

      expect(id).toBe(9);
      expect(success).toHaveBeenCalledWith("PACKAGES.CREATED");
      expect(repo.calls).toHaveLength(1);
      expect(service.saving()).toBe(false);
    });

    it("a failed create → null, no toast, no reload", () => {
      repo.create.mockReturnValue(throwError(() => new Error("400")));
      let id: number | null = 0;
      service
        .createPackage({
          branchId: 3,
          nameAr: "أ",
          nameEn: "A",
          serviceIds: [1, 2],
          regularPrice: 1,
          vipPrice: 1,
          homePrice: null,
        })
        .subscribe((v) => (id = v));

      expect(id).toBeNull();
      expect(success).not.toHaveBeenCalled();
      expect(repo.calls).toHaveLength(0);
      expect(service.saving()).toBe(false);
    });

    it("a status:false body counts as a failure", () => {
      repo.update.mockReturnValue(of(ok(null, false)));
      let result: boolean | null = null;
      service
        .updatePackage(1, {
          nameAr: "أ",
          nameEn: "A",
          serviceIds: [1, 2],
          regularPrice: 1,
          vipPrice: 1,
          homePrice: null,
        })
        .subscribe((v) => (result = v));

      expect(result).toBe(false);
      expect(success).not.toHaveBeenCalled();
    });

    it("update and toggle succeed, toast and reload", () => {
      service
        .updatePackage(1, {
          nameAr: "أ",
          nameEn: "A",
          serviceIds: [1, 2],
          regularPrice: 1,
          vipPrice: 1,
          homePrice: null,
        })
        .subscribe();
      service.toggleStatus(1).subscribe();

      expect(success).toHaveBeenCalledWith("PACKAGES.UPDATED");
      expect(success).toHaveBeenCalledWith("PACKAGES.STATUS_UPDATED");
      expect(repo.calls).toHaveLength(2);
    });

    it("delete steps back one page when it empties the current one", () => {
      service.setPage(2);
      repo.respond(page([pkg(7)], 2));
      repo.calls.length = 0;

      service.remove([7]).subscribe();

      expect(success).toHaveBeenCalledWith("PACKAGES.DELETED");
      expect(repo.calls.at(-1)).toMatchObject({ pageNumber: 1 });
    });
  });

  describe("getPackage", () => {
    it("is null for a status:false body or an error", () => {
      let result: unknown = "unset";
      repo.byId.mockReturnValue(of(ok(null, false)));
      service.getPackage(1).subscribe((v) => (result = v));
      expect(result).toBeNull();

      repo.byId.mockReturnValue(throwError(() => new Error("404")));
      service.getPackage(1).subscribe((v) => (result = v));
      expect(result).toBeNull();
    });
  });
});
