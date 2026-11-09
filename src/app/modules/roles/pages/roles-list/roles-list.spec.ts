import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { of } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../auth/service/auth.service";
import { RoleListItem } from "../../model/role.model";
import { RolesService } from "../../service/roles.service";
import { RolesList } from "./roles-list";

const row = (id: number, name = `Role ${id}`): RoleListItem => ({
  id,
  name,
  countUsers: 0,
  permissions: [],
});

type Page = {
  openCreate(): void;
  openRename(r: RoleListItem, e: Event): void;
  onNameSubmitted(name: string): void;
  askDelete(r: RoleListItem, e: Event): void;
  askBulkDelete(): void;
  confirmDelete(): void;
  onSearch(term: string): void;
  drawerOpen(): boolean;
  editing(): RoleListItem | null;
  pendingDelete(): RoleListItem[];
  lockedIds(): number[];
  selection: { set(v: Array<string | number>): void; (): Array<string | number> };
};

describe("RolesList handlers", () => {
  let permissions: string[];
  let ownRole: string;
  let saving: ReturnType<typeof signal<boolean>>;
  let query: ReturnType<typeof signal<{ pageNumber: number; pageSize: number; search?: string }>>;
  let roles: Record<string, ReturnType<typeof vi.fn>>;

  function page(): Page {
    const fixture = TestBed.createComponent(RolesList);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Page;
  }

  beforeEach(() => {
    permissions = [];
    ownRole = "";
    saving = signal(false);
    query = signal({ pageNumber: 1, pageSize: 10 });
    roles = {
      load: vi.fn(),
      setSearch: vi.fn(),
      setPage: vi.fn(),
      createRole: vi.fn(() => of(true)),
      rename: vi.fn(() => of(true)),
      remove: vi.fn(() => of(true)),
    };
    TestBed.configureTestingModule({
      imports: [RolesList, TranslateModule.forRoot()],
      providers: [
        {
          provide: RolesService,
          useValue: {
            ...roles,
            roles: signal([row(1, "Admin"), row(2), row(3)]),
            meta: signal(null),
            loading: signal(false),
            saving,
            hasError: signal(false),
            query,
          },
        },
        {
          provide: AuthService,
          useValue: {
            hasPermission: (p: string) => permissions.includes(p),
            hasRole: (name: string) => name === ownRole,
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    TestBed.inject(TranslateService).use("en");
  });

  describe("permission checks inside the handlers", () => {
    it("openCreate does nothing without Role.Create", () => {
      const p = page();
      p.openCreate();
      expect(p.drawerOpen()).toBe(false);
    });

    it("openRename does nothing without Role.Edit", () => {
      const p = page();
      p.openRename(row(2), new Event("click"));
      expect(p.drawerOpen()).toBe(false);
    });

    it("onNameSubmitted sends nothing without the matching permission", () => {
      const p = page();
      p.onNameSubmitted("X");
      expect(roles["createRole"]).not.toHaveBeenCalled();
      expect(roles["rename"]).not.toHaveBeenCalled();
    });

    it("askDelete / askBulkDelete / confirmDelete send nothing without Role.Delete", () => {
      const p = page();
      p.askDelete(row(2), new Event("click"));
      p.selection.set([2, 3]);
      p.askBulkDelete();
      p.confirmDelete();

      expect(p.pendingDelete()).toEqual([]);
      expect(roles["remove"]).not.toHaveBeenCalled();
    });
  });

  describe("with permissions", () => {
    beforeEach(() => (permissions = ["Role.Create", "Role.Edit", "Role.Delete"]));

    it("creates a role from the drawer and closes it on success", () => {
      const p = page();
      p.openCreate();
      p.onNameSubmitted("Cashier");

      expect(roles["createRole"]).toHaveBeenCalledWith("Cashier");
      expect(p.drawerOpen()).toBe(false);
    });

    it("renames the role being edited", () => {
      const p = page();
      p.openRename(row(2), new Event("click"));
      p.onNameSubmitted("Senior");

      expect(roles["rename"]).toHaveBeenCalledWith(2, "Senior");
    });

    it("keeps the drawer open when the save fails", () => {
      roles["createRole"].mockReturnValue(of(false));
      const p = page();
      p.openCreate();
      p.onNameSubmitted("Cashier");
      expect(p.drawerOpen()).toBe(true);
    });

    it("ignores a submit while a save is running", () => {
      const p = page();
      p.openCreate();
      saving.set(true);
      p.onNameSubmitted("Cashier");
      expect(roles["createRole"]).not.toHaveBeenCalled();
    });

    it("confirmDelete is ignored while a save is running", () => {
      const p = page();
      p.askDelete(row(2), new Event("click"));
      saving.set(true);
      p.confirmDelete();
      expect(roles["remove"]).not.toHaveBeenCalled();
    });

    it("deleting one row keeps the other ticked rows selected", () => {
      const p = page();
      p.selection.set([2, 3]);
      p.askDelete(row(2), new Event("click"));
      p.confirmDelete();

      expect(roles["remove"]).toHaveBeenCalledWith([2]);
      expect(p.selection()).toEqual([3]);
    });

    it("your own role is locked against deletion", () => {
      ownRole = "Admin";
      expect(page().lockedIds()).toEqual([1]);
    });
  });

  describe("search", () => {
    it("ignores an emission that changes nothing", () => {
      query.set({ pageNumber: 1, pageSize: 10, search: "man" });
      const p = page();
      p.selection.set([1]);

      p.onSearch("man");
      expect(roles["setSearch"]).not.toHaveBeenCalled();
      expect(p.selection()).toEqual([1]);
    });

    it("a real change reloads and clears the selection", () => {
      const p = page();
      p.selection.set([1]);
      p.onSearch("man");

      expect(roles["setSearch"]).toHaveBeenCalledWith("man");
      expect(p.selection()).toEqual([]);
    });
  });
});
