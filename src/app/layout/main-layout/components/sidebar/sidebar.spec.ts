import { TestBed } from "@angular/core/testing";
import { NavigationEnd, Router } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Subject } from "rxjs";
import { beforeEach, describe, expect, it } from "vitest";

import { PERMISSIONS } from "@core/auth/permissions";
import { AuthService } from "../../../../modules/auth/service/auth.service";
import { NAV_SECTIONS } from "../../nav.config";
import { Sidebar } from "./sidebar";

type Internals = {
  sections(): Array<{ id: string; items: Array<{ id: string }> }>;
  activeItemId(): string;
};

describe("Sidebar", () => {
  let granted: string[];
  let router: { url: string; events: Subject<unknown> };

  function create(): Internals {
    TestBed.configureTestingModule({
      imports: [Sidebar, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: { hasPermission: (p: string) => granted.includes(p) } },
        { provide: Router, useValue: router },
      ],
    });
    TestBed.inject(TranslateService).use("en");
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Internals;
  }

  const navigateTo = (url: string) => {
    router.url = url;
    router.events.next(new NavigationEnd(1, url, url));
  };

  const visibleIds = (sidebar: Internals) =>
    sidebar.sections().flatMap((s) => s.items.map((i) => i.id));

  beforeEach(() => {
    granted = [];
    router = { url: "/main/users", events: new Subject() };
  });

  describe("visible items", () => {
    it("hides every section whose items the user can't open", () => {
      const ids = visibleIds(create());
      // Only items without a permission remain (the dev-only design-system link, if present).
      const open = NAV_SECTIONS.flatMap((s) => s.items)
        .filter((i) => !i.permission && !i.children)
        .map((i) => i.id);
      expect(ids).toEqual(open);
    });

    it("shows an item once its permission is granted, and nothing else from that section", () => {
      granted = [PERMISSIONS.User.View];
      const ids = visibleIds(create());

      expect(ids).toContain("users");
      expect(ids).not.toContain("roles");
      expect(ids).not.toContain("branches");
    });

    it("shows Attendance to a user who only has Barber.Attendance, without Barbers", () => {
      granted = [PERMISSIONS.Barber.Attendance];
      const ids = visibleIds(create());

      expect(ids).toContain("barber-attendance");
      expect(ids).not.toContain("barbers");
    });

    it("shows every permission-gated item to a user holding all permissions", () => {
      granted = NAV_SECTIONS.flatMap((s) => s.items)
        .map((i) => i.permission)
        .filter((p): p is NonNullable<typeof p> => !!p);

      const ids = visibleIds(create());
      NAV_SECTIONS.flatMap((s) => s.items).forEach((i) => expect(ids).toContain(i.id));
    });
  });

  describe("active item", () => {
    it.each([
      ["/main/users", "users"],
      ["/main/users/5", "users"],
      ["/main/users?page=2", "users"],
      ["/main/users#top", "users"],
      ["/main/roles/3", "roles"],
      ["/main/branches/new", "branches"],
      ["/main/barbers", "barbers"],
      ["/main/barbers/attendance", "barber-attendance"],
    ])("%s highlights %s", (url, id) => {
      router.url = url;
      expect(create().activeItemId()).toBe(id);
    });

    it("follows navigation", () => {
      const sidebar = create();
      expect(sidebar.activeItemId()).toBe("users");

      navigateTo("/main/roles");
      expect(sidebar.activeItemId()).toBe("roles");
    });

    it("does not confuse a route with another that merely starts with the same letters", () => {
      // "/main/users-archive" must not light up "/main/users".
      router.url = "/main/users-archive";
      expect(create().activeItemId()).toBe("");
    });

    it("highlights nothing for pages outside the sidebar (profile, /main itself)", () => {
      router.url = "/main/profile";
      const sidebar = create();
      expect(sidebar.activeItemId()).toBe("");

      navigateTo("/main");
      expect(sidebar.activeItemId()).toBe("");
    });
  });
});
