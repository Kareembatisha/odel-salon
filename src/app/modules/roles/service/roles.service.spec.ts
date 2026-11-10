import { TestBed } from "@angular/core/testing";
import { Observable, Subject, firstValueFrom, of, throwError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import { AuthService } from "../../auth/service/auth.service";
import {
  RoleDetails,
  RoleListItem,
  RoleNameRequest,
  RolesQuery,
  UpdateRolePermissionsRequest,
} from "../model/role.model";
import { ROLE_REPOSITORY } from "../repository/role.repository";
import { RolesService } from "./roles.service";

const role = (id: number, name = `Role ${id}`): RoleListItem => ({
  id,
  name,
  countUsers: 0,
  permissions: [],
});

function page(items: RoleListItem[], totalCount = items.length): ApiResponse<RoleListItem[]> {
  return {
    status: true,
    statusCode: 200,
    message: "ok",
    errors: null,
    data: items,
    meta: {
      currentPage: 1,
      pageSize: 10,
      totalPages: Math.max(1, Math.ceil(totalCount / 10)),
      totalCount,
      hasPreviousPage: false,
      hasNextPage: false,
      additionalData: null,
    },
  };
}

function ok<T>(data: T, status = true): ApiResponse<T> {
  return { status, statusCode: status ? 200 : 400, message: "msg", errors: null, meta: null, data };
}

class FakeRepository {
  calls: RolesQuery[] = [];
  pending: Array<Subject<ApiResponse<RoleListItem[]>>> = [];
  next: () => Observable<ApiResponse<unknown>> = () => of(ok(null));
  byId = vi.fn((_id: number) => this.next() as Observable<ApiResponse<RoleDetails>>);
  create = vi.fn((_p: RoleNameRequest) => this.next() as Observable<ApiResponse<number>>);
  update = vi.fn(
    (_id: number, _p: RoleNameRequest) => this.next() as Observable<ApiResponse<null>>,
  );
  permissions = vi.fn(
    (_id: number, _p: UpdateRolePermissionsRequest) => this.next() as Observable<ApiResponse<null>>,
  );
  remove = vi.fn((_p: { ids: number[] }) => this.next() as Observable<ApiResponse<null>>);

  /** When set, `getRoles` answers immediately (for `loadOptions`); otherwise it returns a Subject. */
  immediate: ApiResponse<RoleListItem[]> | Error | null = null;

  getRoles(q: RolesQuery): Observable<ApiResponse<RoleListItem[]>> {
    this.calls.push(q);
    if (this.immediate instanceof Error) return throwError(() => this.immediate);
    if (this.immediate) return of(this.immediate);
    const s = new Subject<ApiResponse<RoleListItem[]>>();
    this.pending.push(s);
    return s;
  }
  getRoleById(id: number) {
    return this.byId(id);
  }
  createRole(p: RoleNameRequest) {
    return this.create(p);
  }
  updateRole(id: number, p: RoleNameRequest) {
    return this.update(id, p);
  }
  updatePermissions(id: number, p: UpdateRolePermissionsRequest) {
    return this.permissions(id, p);
  }
  deleteRoles(p: { ids: number[] }) {
    return this.remove(p);
  }
  get last() {
    return this.pending[this.pending.length - 1];
  }
}

describe("RolesService", () => {
  let repo: FakeRepository;
  let service: RolesService;
  let success: ReturnType<typeof vi.spyOn>;
  let auth: { hasRole: ReturnType<typeof vi.fn>; refreshToken: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    repo = new FakeRepository();
    auth = { hasRole: vi.fn(() => false), refreshToken: vi.fn(() => of(true)) };
    TestBed.configureTestingModule({
      providers: [
        { provide: ROLE_REPOSITORY, useValue: repo },
        { provide: AuthService, useValue: auth },
      ],
    });
    service = TestBed.inject(RolesService);
    success = vi.spyOn(TestBed.inject(NotificationService), "success");
  });

  it("loads page 1 with the table page size and permissions included", () => {
    service.load();
    expect(repo.calls[0]).toEqual({ pageNumber: 1, pageSize: 10, includePermissions: true });

    repo.last.next(page([role(2), role(1)], 12));
    repo.last.complete();

    expect(service.loading()).toBe(false);
    expect(service.roles().map((r) => r.id)).toEqual([2, 1]);
    expect(service.meta()?.totalCount).toBe(12);
  });

  it("ignores a stale response and only the latest request clears `loading`", () => {
    service.load();
    const first = repo.last;
    service.load();
    const second = repo.last;

    first.next(page([role(1)]));
    expect(service.roles()).toEqual([]);
    expect(service.loading()).toBe(true);

    second.next(page([role(9)]));
    second.complete();
    expect(service.roles().map((r) => r.id)).toEqual([9]);
    expect(service.loading()).toBe(false);
  });

  it("keeps the previous rows and flags `hasError` when a reload fails", () => {
    service.load();
    repo.last.next(page([role(1)]));
    repo.last.complete();

    service.load();
    repo.last.error(new Error("boom"));

    expect(service.hasError()).toBe(true);
    expect(service.roles().map((r) => r.id)).toEqual([1]);
  });

  it("setSearch resets to page 1 and clears an empty term", () => {
    service.setPage(3);
    service.setSearch("man");
    expect(repo.calls.at(-1)).toMatchObject({ pageNumber: 1, search: "man" });

    service.setSearch("");
    expect(repo.calls.at(-1)?.search).toBeUndefined();
  });

  describe("loadOptions", () => {
    it("returns id/name pairs independent of the list state", async () => {
      repo.immediate = page([role(1, "Admin"), role(2, "Cashier")]);
      expect(await firstValueFrom(service.loadOptions())).toEqual([
        { id: 1, name: "Admin" },
        { id: 2, name: "Cashier" },
      ]);
      expect(repo.calls[0]).toEqual({ pageNumber: 1, pageSize: 100 });
    });

    it("falls back to an empty list on failure", async () => {
      repo.immediate = new Error("500");
      expect(await firstValueFrom(service.loadOptions())).toEqual([]);
    });
  });

  describe("getRole", () => {
    it("returns the details, or null on status:false / failure", async () => {
      const details = { id: 3, name: "Admin" } as RoleDetails;
      repo.next = () => of(ok(details));
      expect(await firstValueFrom(service.getRole(3))).toEqual(details);

      repo.next = () => of(ok(details, false));
      expect(await firstValueFrom(service.getRole(3))).toBeNull();

      repo.next = () => throwError(() => new Error("404"));
      expect(await firstValueFrom(service.getRole(3))).toBeNull();
    });
  });

  describe("mutations", () => {
    it("createRole sends the trimmed name, toasts, reloads and resolves true", async () => {
      expect(await firstValueFrom(service.createRole("  Cashier  "))).toBe(true);
      expect(repo.create).toHaveBeenCalledWith({ name: "Cashier" });
      expect(success).toHaveBeenCalledWith("ROLES.CREATED");
      expect(repo.calls).toHaveLength(1);
    });

    it("rename sends the trimmed name", async () => {
      expect(await firstValueFrom(service.rename(3, " Senior "))).toBe(true);
      expect(repo.update).toHaveBeenCalledWith(3, { name: "Senior" });
      expect(success).toHaveBeenCalledWith("ROLES.RENAMED");
    });

    it("remove sends the ids in the body", async () => {
      expect(await firstValueFrom(service.remove([3, 4]))).toBe(true);
      expect(repo.remove).toHaveBeenCalledWith({ ids: [3, 4] });
      expect(success).toHaveBeenCalledWith("ROLES.DELETED");
    });

    it("treats a status:false body as a failure: no toast, no reload", async () => {
      repo.next = () => of(ok(null, false));

      expect(await firstValueFrom(service.createRole("X"))).toBe(false);
      expect(success).not.toHaveBeenCalled();
      expect(repo.calls).toHaveLength(0);
    });

    it("treats a failed request as a failure: no toast, no reload", async () => {
      repo.next = () => throwError(() => new Error("409"));

      expect(await firstValueFrom(service.remove([1]))).toBe(false);
      expect(success).not.toHaveBeenCalled();
      expect(repo.calls).toHaveLength(0);
    });
  });

  describe("savePermissions", () => {
    it("refreshes the session when the edited role is the signed-in user's own", async () => {
      auth.hasRole.mockReturnValue(true);

      expect(
        await firstValueFrom(service.savePermissions(3, "Admin", { permissions: ["A"] })),
      ).toBe(true);
      expect(repo.permissions).toHaveBeenCalledWith(3, { permissions: ["A"] });
      expect(success).toHaveBeenCalledWith("ROLES.PERMISSIONS_SAVED");
      expect(auth.refreshToken).toHaveBeenCalledTimes(1);
    });

    it("leaves the session alone for someone else's role", async () => {
      await firstValueFrom(service.savePermissions(3, "Cashier", { permissions: [] }));
      expect(auth.refreshToken).not.toHaveBeenCalled();
    });

    it("does not refresh when the save failed", async () => {
      auth.hasRole.mockReturnValue(true);
      repo.next = () => throwError(() => new Error("403"));

      expect(await firstValueFrom(service.savePermissions(3, "Admin", { permissions: [] }))).toBe(
        false,
      );
      expect(auth.refreshToken).not.toHaveBeenCalled();
    });
  });

  describe("remove steps back a page when it empties the current one", () => {
    function loadPage(pageNumber: number, rows: number): void {
      service.setPage(pageNumber);
      const ids = Array.from({ length: rows }, (_, i) => i + 1);
      repo.last.next(page(ids.map((id) => role(id))));
      repo.last.complete();
      repo.calls.length = 0;
    }

    it("deleting every row on page 3 reloads page 2", async () => {
      loadPage(3, 2);

      await firstValueFrom(service.remove([1, 2]));

      expect(repo.calls.map((c) => c.pageNumber)).toEqual([2]);
    });

    it("deleting some rows keeps the page", async () => {
      loadPage(3, 3);

      await firstValueFrom(service.remove([1]));

      expect(repo.calls.map((c) => c.pageNumber)).toEqual([3]);
    });

    it("emptying page 1 stays on page 1", async () => {
      loadPage(1, 2);

      await firstValueFrom(service.remove([1, 2]));

      expect(repo.calls.map((c) => c.pageNumber)).toEqual([1]);
    });

    it("a failed delete does not move the page or reload", async () => {
      loadPage(3, 2);
      repo.next = () => throwError(() => new Error("409"));

      expect(await firstValueFrom(service.remove([1, 2]))).toBe(false);
      expect(repo.calls).toHaveLength(0);
    });
  });

  describe("saving", () => {
    it("stays true until the LAST overlapping mutation finishes", () => {
      const a = new Subject<ApiResponse<unknown>>();
      const b = new Subject<ApiResponse<unknown>>();
      const queue = [a, b];
      repo.next = () => queue.shift()!;

      service.createRole("A").subscribe();
      service.remove([2]).subscribe();
      expect(service.saving()).toBe(true);

      a.next(ok(null));
      a.complete();
      expect(service.saving()).toBe(true);

      b.next(ok(null));
      b.complete();
      expect(service.saving()).toBe(false);
    });
  });
});
