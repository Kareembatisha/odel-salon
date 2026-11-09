import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Subject, of } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../auth/service/auth.service";
import { RolesService } from "../../../roles/service/roles.service";
import { UserDetails, UserListItem } from "../../model/user.model";
import { UsersService } from "../../service/users.service";
import { UsersList } from "./users-list";

const row = (id: number): UserListItem => ({
  id,
  imageUrl: null,
  fullName: `User ${id}`,
  email: `u${id}@example.com`,
  role: "Receptionist",
  status: true,
});
const details = (id: number): UserDetails => ({
  id,
  imageUrl: null,
  fullName: `User ${id}`,
  role: "Receptionist",
  email: `u${id}@example.com`,
  countryCode: "+20",
  phoneNumber: "1001234567",
});

type Page = {
  openCreate(): void;
  openEdit(u: UserListItem): void;
  closeDrawer(): void;
  onSubmitted(p: unknown): void;
  toggle(u: UserListItem): void;
  askDelete(u: UserListItem, e: Event): void;
  askBulkDelete(): void;
  confirmDelete(): void;
  onSearch(term: string): void;
  drawerOpen(): boolean;
  drawerMode(): string;
  drawerLoading(): boolean;
  editDetails(): UserDetails | null;
  pendingDelete(): UserListItem[];
  selection: { set(v: Array<string | number>): void; (): Array<string | number> };
};

describe("UsersList handlers", () => {
  let permissions: string[];
  let saving: ReturnType<typeof signal<boolean>>;
  let query: ReturnType<typeof signal<{ pageNumber: number; pageSize: number; search?: string }>>;
  let users: Record<string, ReturnType<typeof vi.fn>>;
  let selfId: number | undefined;

  function page(): Page {
    const fixture = TestBed.createComponent(UsersList);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Page;
  }

  beforeEach(() => {
    permissions = [];
    selfId = undefined;
    saving = signal(false);
    query = signal({ pageNumber: 1, pageSize: 10 });
    users = {
      load: vi.fn(),
      setFilters: vi.fn(),
      setPage: vi.fn(),
      getUser: vi.fn(() => of(details(5))),
      createUser: vi.fn(() => of(true)),
      updateUser: vi.fn(() => of(true)),
      toggleStatus: vi.fn(() => of(true)),
      remove: vi.fn(() => of(true)),
    };
    TestBed.configureTestingModule({
      imports: [UsersList, TranslateModule.forRoot()],
      providers: [
        {
          provide: UsersService,
          useValue: {
            ...users,
            users: signal([row(1), row(2), row(3)]),
            meta: signal(null),
            loading: signal(false),
            saving,
            hasError: signal(false),
            query,
          },
        },
        { provide: RolesService, useValue: { loadOptions: () => of([]) } },
        {
          provide: AuthService,
          useValue: {
            hasPermission: (p: string) => permissions.includes(p),
            currentUser: () => (selfId === undefined ? null : { id: selfId }),
          },
        },
      ],
    });
    TestBed.inject(TranslateService).use("en");
  });

  describe("permission checks inside the handlers", () => {
    it("openCreate does nothing without User.Create", () => {
      const p = page();
      p.openCreate();
      expect(p.drawerOpen()).toBe(false);

      permissions = ["User.Create"];
      const allowed = page();
      allowed.openCreate();
      expect(allowed.drawerOpen()).toBe(true);
      expect(allowed.drawerMode()).toBe("create");
    });

    it("openEdit does nothing without User.Edit", () => {
      const p = page();
      p.openEdit(row(5));
      expect(p.drawerOpen()).toBe(false);
      expect(users["getUser"]).not.toHaveBeenCalled();
    });

    it("toggle sends nothing without User.Edit", () => {
      page().toggle(row(5));
      expect(users["toggleStatus"]).not.toHaveBeenCalled();
    });

    it("askDelete / askBulkDelete / confirmDelete send nothing without User.Delete", () => {
      const p = page();
      p.askDelete(row(1), new Event("click"));
      expect(p.pendingDelete()).toEqual([]);

      p.selection.set([1, 2]);
      p.askBulkDelete();
      expect(p.pendingDelete()).toEqual([]);

      p.confirmDelete();
      expect(users["remove"]).not.toHaveBeenCalled();
    });

    it("onSubmitted sends nothing without the matching permission", () => {
      const p = page();
      p.onSubmitted({ fullName: "A" });
      expect(users["createUser"]).not.toHaveBeenCalled();
    });
  });

  describe("with permissions", () => {
    beforeEach(() => (permissions = ["User.Create", "User.Edit", "User.Delete"]));

    it("toggle calls the service, but not while saving or on your own account", () => {
      selfId = 1;
      const p = page();

      p.toggle(row(5));
      expect(users["toggleStatus"]).toHaveBeenCalledWith(5);

      users["toggleStatus"].mockClear();
      p.toggle(row(1)); // self
      saving.set(true);
      p.toggle(row(5));
      expect(users["toggleStatus"]).not.toHaveBeenCalled();
    });

    it("onSubmitted creates in create mode and closes the drawer on success", () => {
      const p = page();
      p.openCreate();
      p.onSubmitted({ fullName: "A" });

      expect(users["createUser"]).toHaveBeenCalledWith({ fullName: "A" });
      expect(p.drawerOpen()).toBe(false);
    });

    it("onSubmitted keeps the drawer open when the save fails", () => {
      users["createUser"].mockReturnValue(of(false));
      const p = page();
      p.openCreate();
      p.onSubmitted({ fullName: "A" });
      expect(p.drawerOpen()).toBe(true);
    });

    it("onSubmitted updates the loaded user in edit mode", () => {
      const p = page();
      p.openEdit(row(5));
      p.onSubmitted({ fullName: "B" });
      expect(users["updateUser"]).toHaveBeenCalledWith(5, { fullName: "B" });
    });

    it("onSubmitted is ignored while a save is already running", () => {
      const p = page();
      p.openCreate();
      saving.set(true);
      p.onSubmitted({ fullName: "A" });
      expect(users["createUser"]).not.toHaveBeenCalled();
    });

    it("confirmDelete is ignored while a save is running", () => {
      const p = page();
      p.askDelete(row(1), new Event("click"));
      saving.set(true);
      p.confirmDelete();
      expect(users["remove"]).not.toHaveBeenCalled();
    });

    it("deleting one row keeps the other ticked rows selected", () => {
      const p = page();
      p.selection.set([1, 2, 3]);
      p.askDelete(row(2), new Event("click"));
      p.confirmDelete();

      expect(users["remove"]).toHaveBeenCalledWith([2]);
      expect(p.selection()).toEqual([1, 3]);
      expect(p.pendingDelete()).toEqual([]);
    });

    it("a failed delete keeps the dialog and the selection", () => {
      users["remove"].mockReturnValue(of(false));
      const p = page();
      p.selection.set([1, 2]);
      p.askBulkDelete();
      p.confirmDelete();

      expect(p.pendingDelete()).toHaveLength(2);
      expect(p.selection()).toEqual([1, 2]);
    });
  });

  describe("stale details responses", () => {
    beforeEach(() => (permissions = ["User.Edit", "User.Create"]));

    it("a slow response for a row that was replaced by another is ignored", () => {
      const first = new Subject<UserDetails | null>();
      const second = new Subject<UserDetails | null>();
      users["getUser"].mockReturnValueOnce(first).mockReturnValueOnce(second);
      const p = page();

      p.openEdit(row(1));
      p.openEdit(row(2));
      second.next(details(2));
      first.next(details(1)); // arrives late: must not hijack the drawer

      expect(p.editDetails()?.id).toBe(2);
    });

    it("a response that arrives after the drawer was closed is ignored", () => {
      const pending = new Subject<UserDetails | null>();
      users["getUser"].mockReturnValueOnce(pending);
      const p = page();

      p.openEdit(row(1));
      p.closeDrawer();
      pending.next(details(1));

      expect(p.drawerOpen()).toBe(false);
      expect(p.editDetails()).toBeNull();
    });

    it("a response that arrives after opening 'create' is ignored", () => {
      const pending = new Subject<UserDetails | null>();
      users["getUser"].mockReturnValueOnce(pending);
      const p = page();

      p.openEdit(row(1));
      p.openCreate();
      pending.next(details(1));

      expect(p.drawerMode()).toBe("create");
      expect(p.editDetails()).toBeNull();
    });

    it("closes the drawer when the details can't be loaded", () => {
      users["getUser"].mockReturnValueOnce(of(null));
      const p = page();
      p.openEdit(row(1));
      expect(p.drawerOpen()).toBe(false);
    });
  });

  describe("search", () => {
    it("ignores an emission that changes nothing (no reload, selection kept)", () => {
      query.set({ pageNumber: 1, pageSize: 10, search: "ali" });
      const p = page();
      p.selection.set([1]);

      p.onSearch("ali");

      expect(users["setFilters"]).not.toHaveBeenCalled();
      expect(p.selection()).toEqual([1]);
    });

    it("a real change reloads and clears the selection", () => {
      const p = page();
      p.selection.set([1]);
      p.onSearch("ali");

      expect(users["setFilters"]).toHaveBeenCalledWith({ search: "ali" });
      expect(p.selection()).toEqual([]);
    });
  });
});
