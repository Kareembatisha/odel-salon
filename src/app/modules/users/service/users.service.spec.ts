import { TestBed } from "@angular/core/testing";
import { Observable, Subject, firstValueFrom, of, throwError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import {
  CreateUserPayload,
  UpdateUserPayload,
  UserDetails,
  UserListItem,
  UsersQuery,
} from "../model/user.model";
import { USER_REPOSITORY } from "../repository/user.repository";
import { UsersService } from "./users.service";

const user = (id: number): UserListItem => ({
  id,
  imageUrl: null,
  fullName: `User ${id}`,
  email: `u${id}@example.com`,
  role: "Receptionist",
  status: true,
});

function page(items: UserListItem[], totalCount = items.length): ApiResponse<UserListItem[]> {
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

const CREATE = { fullName: "Ali" } as CreateUserPayload;
const UPDATE = { fullName: "Ali B" } as UpdateUserPayload;
const DETAILS = { id: 5, fullName: "Ali" } as UserDetails;

/** Repository double: list calls return Subjects the test resolves by hand; mutations answer from `next`. */
class FakeRepository {
  calls: UsersQuery[] = [];
  pending: Array<Subject<ApiResponse<UserListItem[]>>> = [];
  next: () => Observable<ApiResponse<unknown>> = () => of(ok(null));
  byId = vi.fn((_id: number) => this.next() as Observable<ApiResponse<UserDetails>>);
  create = vi.fn((_p: CreateUserPayload) => this.next() as Observable<ApiResponse<number>>);
  update = vi.fn(
    (_id: number, _p: UpdateUserPayload) => this.next() as Observable<ApiResponse<null>>,
  );
  toggle = vi.fn((_id: number) => this.next() as Observable<ApiResponse<null>>);
  remove = vi.fn((_p: { ids: number[] }) => this.next() as Observable<ApiResponse<null>>);

  getUsers(q: UsersQuery): Observable<ApiResponse<UserListItem[]>> {
    this.calls.push(q);
    const s = new Subject<ApiResponse<UserListItem[]>>();
    this.pending.push(s);
    return s;
  }
  getUserById(id: number) {
    return this.byId(id);
  }
  createUser(p: CreateUserPayload) {
    return this.create(p);
  }
  updateUser(id: number, p: UpdateUserPayload) {
    return this.update(id, p);
  }
  toggleUserStatus(id: number) {
    return this.toggle(id);
  }
  deleteUsers(p: { ids: number[] }) {
    return this.remove(p);
  }
  get last() {
    return this.pending[this.pending.length - 1];
  }
}

describe("UsersService", () => {
  let repo: FakeRepository;
  let service: UsersService;
  let success: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    repo = new FakeRepository();
    TestBed.configureTestingModule({ providers: [{ provide: USER_REPOSITORY, useValue: repo }] });
    service = TestBed.inject(UsersService);
    success = vi.spyOn(TestBed.inject(NotificationService), "success");
  });

  it("loads page 1 with the table page size and maps data + meta", () => {
    service.load();
    expect(service.loading()).toBe(true);
    expect(repo.calls[0]).toEqual({ pageNumber: 1, pageSize: 10 });

    repo.last.next(page([user(2), user(1)], 14));
    repo.last.complete();

    expect(service.loading()).toBe(false);
    expect(service.users().map((u) => u.id)).toEqual([2, 1]);
    expect(service.meta()?.totalCount).toBe(14);
  });

  it("ignores a stale response and only the latest request clears `loading`", () => {
    service.load();
    const first = repo.last;
    service.load();
    const second = repo.last;

    first.next(page([user(1)])); // cancelled by the second load: must not be applied
    expect(service.users()).toEqual([]);
    expect(service.loading()).toBe(true);

    second.next(page([user(9)]));
    second.complete();
    expect(service.users().map((u) => u.id)).toEqual([9]);
    expect(service.loading()).toBe(false);
  });

  it("keeps the previous rows and flags `hasError` when a reload fails", () => {
    service.load();
    repo.last.next(page([user(1)]));
    repo.last.complete();

    service.load();
    repo.last.error(new Error("boom"));

    expect(service.hasError()).toBe(true);
    expect(service.loading()).toBe(false);
    expect(service.users().map((u) => u.id)).toEqual([1]);
  });

  it("setFilters merges the filters, goes back to page 1 and reloads", () => {
    service.setPage(3);
    service.setFilters({ roleId: 4, status: false });
    expect(repo.calls.at(-1)).toEqual({ pageNumber: 1, pageSize: 10, roleId: 4, status: false });
  });

  it("setPage keeps the filters and reloads", () => {
    service.setFilters({ search: "ali" });
    service.setPage(2);
    expect(repo.calls.at(-1)).toEqual({ pageNumber: 2, pageSize: 10, search: "ali" });
  });

  describe("getUser", () => {
    it("returns the details", async () => {
      repo.next = () => of(ok(DETAILS));
      expect(await firstValueFrom(service.getUser(5))).toEqual(DETAILS);
    });

    it("returns null when the body says status:false", async () => {
      repo.next = () => of(ok(DETAILS, false));
      expect(await firstValueFrom(service.getUser(5))).toBeNull();
    });

    it("returns null when the request fails", async () => {
      repo.next = () => throwError(() => new Error("404"));
      expect(await firstValueFrom(service.getUser(5))).toBeNull();
    });
  });

  describe("mutations", () => {
    it.each([
      ["createUser", () => service.createUser(CREATE), "USERS.CREATED"],
      ["updateUser", () => service.updateUser(5, UPDATE), "USERS.UPDATED"],
      ["toggleStatus", () => service.toggleStatus(5), "USERS.STATUS_UPDATED"],
      ["remove", () => service.remove([5, 6]), "USERS.DELETED"],
    ])("%s toasts its own i18n key, reloads and resolves true", async (_n, run, key) => {
      const result = await firstValueFrom(run());

      expect(result).toBe(true);
      expect(success).toHaveBeenCalledWith(key);
      expect(repo.calls).toHaveLength(1); // the reload
    });

    it("passes the right arguments to the repository", async () => {
      await firstValueFrom(service.createUser(CREATE));
      await firstValueFrom(service.updateUser(5, UPDATE));
      await firstValueFrom(service.toggleStatus(5));
      await firstValueFrom(service.remove([5, 6]));

      expect(repo.create).toHaveBeenCalledWith(CREATE);
      expect(repo.update).toHaveBeenCalledWith(5, UPDATE);
      expect(repo.toggle).toHaveBeenCalledWith(5);
      expect(repo.remove).toHaveBeenCalledWith({ ids: [5, 6] });
    });

    it("treats a status:false body as a failure: no toast, no reload", async () => {
      repo.next = () => of(ok(null, false));

      expect(await firstValueFrom(service.createUser(CREATE))).toBe(false);
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

  describe("saving", () => {
    it("is true while a mutation runs and false after", () => {
      const pending = new Subject<ApiResponse<unknown>>();
      repo.next = () => pending;

      service.toggleStatus(1).subscribe();
      expect(service.saving()).toBe(true);

      pending.next(ok(null));
      pending.complete();
      expect(service.saving()).toBe(false);
    });

    it("stays true until the LAST overlapping mutation finishes", () => {
      const a = new Subject<ApiResponse<unknown>>();
      const b = new Subject<ApiResponse<unknown>>();
      const queue = [a, b];
      repo.next = () => queue.shift()!;

      service.toggleStatus(1).subscribe();
      service.remove([2]).subscribe();

      a.next(ok(null));
      a.complete();
      expect(service.saving()).toBe(true);

      b.next(ok(null));
      b.complete();
      expect(service.saving()).toBe(false);
    });
  });
});
