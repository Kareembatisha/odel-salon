import { TestBed } from "@angular/core/testing";
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from "@angular/router";
import { beforeEach, describe, expect, it } from "vitest";

import { PERMISSIONS } from "@core/auth/permissions";
import { NAV_SECTIONS } from "../layout/main-layout/nav.config";
import { AuthService } from "./auth/service/auth.service";
import { homeRedirectGuard } from "./home-redirect.guard";
import { MAIN_ROUTES } from "./main.routes";

describe("homeRedirectGuard (/main)", () => {
  let granted: string[];
  let router: Router;

  const go = () =>
    router.serializeUrl(
      TestBed.runInInjectionContext(() =>
        homeRedirectGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      ) as UrlTree,
    );

  beforeEach(() => {
    granted = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { hasPermission: (p: string) => granted.includes(p) } },
      ],
    });
    router = TestBed.inject(Router);
  });

  it("is what the empty /main route runs, and it has no page of its own", () => {
    const home = MAIN_ROUTES.find((r) => r.path === "")!;
    expect(home.canActivate).toEqual([homeRedirectGuard]);
    expect(home.loadComponent).toBeUndefined();
  });

  it("sends the user to the first sidebar item they can open", () => {
    granted = [PERMISSIONS.User.View, PERMISSIONS.Branch.View];
    expect(go()).toBe("/main/users");
  });

  it("skips items the user lacks the permission for", () => {
    granted = [PERMISSIONS.Branch.View];
    expect(go()).toBe("/main/branches");
  });

  it("follows the sidebar order", () => {
    const routes = NAV_SECTIONS.flatMap((s) => s.items)
      .filter((i) => i.permission)
      .map((i) => i.route);
    granted = NAV_SECTIONS.flatMap((s) => s.items)
      .map((i) => i.permission)
      .filter((p): p is NonNullable<typeof p> => !!p);
    expect(go()).toBe(routes[0]);
  });

  it("falls back to the profile when the user can open nothing else", () => {
    // The dev-only design-system item has no permission, so it is only absent in production builds.
    const anyOpenItem = NAV_SECTIONS.flatMap((s) => s.items).some((i) => !i.permission && i.route);
    expect(go()).toBe(anyOpenItem ? "/main/design-system" : "/main/profile");
  });
});
