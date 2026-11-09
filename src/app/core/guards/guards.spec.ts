import { TestBed } from "@angular/core/testing";
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from "@angular/router";
import { beforeEach, describe, expect, it } from "vitest";

import { AuthService } from "../../modules/auth/service/auth.service";
import { authGuard, guestGuard } from "./auth.guard";
import { permissionGuard } from "./permission.guard";

class FakeAuth {
  authenticated = false;
  permissions: string[] = [];
  isAuthenticated = () => this.authenticated;
  hasPermission = (p: string) => this.permissions.includes(p);
  hasAnyPermission = (ps: string[]) => ps.some((p) => this.permissions.includes(p));
}

describe("route guards", () => {
  let auth: FakeAuth;
  let router: Router;

  const route = (data: Record<string, unknown> = {}) =>
    ({ data }) as unknown as ActivatedRouteSnapshot;
  const state = (url: string) => ({ url }) as RouterStateSnapshot;
  const run = (fn: () => unknown) => TestBed.runInInjectionContext(fn as () => never);
  const url = (result: unknown) => router.serializeUrl(result as UrlTree);

  beforeEach(() => {
    auth = new FakeAuth();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    router = TestBed.inject(Router);
  });

  describe("authGuard", () => {
    it("lets a signed-in user through", () => {
      auth.authenticated = true;
      expect(run(() => authGuard(route(), state("/main/users")))).toBe(true);
    });

    it("sends a guest to /login and remembers where they were going", () => {
      const result = run(() => authGuard(route(), state("/main/users?page=2")));
      expect(url(result)).toBe("/login?returnUrl=%2Fmain%2Fusers%3Fpage%3D2");
    });
  });

  describe("guestGuard", () => {
    it("lets a guest see the login pages", () => {
      expect(run(() => guestGuard(route(), state("/login")))).toBe(true);
    });

    it("sends a signed-in user to /main by default", () => {
      auth.authenticated = true;
      expect(url(run(() => guestGuard(route(), state("/login"))))).toBe("/main");
    });

    it("sends a signed-in user back to a safe returnUrl", () => {
      auth.authenticated = true;
      const result = run(() => guestGuard(route(), state("/login?returnUrl=%2Fmain%2Fusers")));
      expect(url(result)).toBe("/main/users");
    });

    it.each(["https://evil.com", "//evil.com", "/login", "javascript:alert(1)"])(
      "ignores an unsafe returnUrl (%s)",
      (returnUrl) => {
        auth.authenticated = true;
        const result = run(() =>
          guestGuard(route(), state(`/login?returnUrl=${encodeURIComponent(returnUrl)}`)),
        );
        expect(url(result)).toBe("/main");
      },
    );
  });

  describe("permissionGuard", () => {
    it("sends a guest to /login", () => {
      const result = run(() =>
        permissionGuard(route({ permission: "User.View" }), state("/main/users")),
      );
      expect(url(result)).toBe("/login");
    });

    it("lets a signed-in user through a route that declares no permission", () => {
      auth.authenticated = true;
      expect(run(() => permissionGuard(route(), state("/main")))).toBe(true);
    });

    it("lets a user through when they hold the required permission", () => {
      auth.authenticated = true;
      auth.permissions = ["User.View"];
      expect(
        run(() => permissionGuard(route({ permission: "User.View" }), state("/main/users"))),
      ).toBe(true);
    });

    it("sends a user without it to the in-section no-access page", () => {
      auth.authenticated = true;
      auth.permissions = ["Role.View"];
      const result = run(() =>
        permissionGuard(route({ permission: "User.View" }), state("/main/users")),
      );
      expect(url(result)).toBe("/main/no-access");
    });

    it("accepts ANY of several permissions", () => {
      auth.authenticated = true;
      auth.permissions = ["B"];
      expect(run(() => permissionGuard(route({ permissions: ["A", "B"] }), state("/main/x")))).toBe(
        true,
      );

      auth.permissions = ["C"];
      expect(
        url(run(() => permissionGuard(route({ permissions: ["A", "B"] }), state("/main/x")))),
      ).toBe("/main/no-access");
    });

    it("uses the top-level no-access page outside a known section", () => {
      auth.authenticated = true;
      const result = run(() => permissionGuard(route({ permission: "X" }), state("/elsewhere/y")));
      expect(url(result)).toBe("/no-access");
    });
  });
});
