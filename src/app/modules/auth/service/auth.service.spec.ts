import { TestBed } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";
import { Observable, firstValueFrom, of, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import { AuthUser } from "../model/auth.model";
import { AUTH_REPOSITORY } from "../repository/auth.repository";
import { AuthService } from "./auth.service";

const ACCESS = "odl_access_token";
const REFRESH = "odl_refresh_token";
const USER = "odl_user";
const ROLE = "odl_role";
const PERMS = "odl_permissions";

const user: AuthUser = { id: 7, fullName: "Sara", email: "sara@example.com", imageUrl: null };

function ok<T>(data: T, message = "from-api"): ApiResponse<T> {
  return { status: true, statusCode: 200, message, errors: null, meta: null, data };
}

const LOGIN = {
  tokens: { accessToken: "acc-1", refreshToken: "ref-1" },
  user,
  role: "Admin",
  permissions: ["User.View", "Role.View"],
};

/** Repository double: each method is a spy returning whatever the test sets on `reply`. */
function fakeRepository() {
  const reply = (v: unknown) => () => of(v);
  return {
    login: vi.fn(reply(ok(LOGIN))),
    logout: vi.fn(reply(ok(null, "bye"))),
    refreshToken: vi.fn(
      reply(
        ok({ accessToken: "acc-2", refreshToken: "ref-2", role: "Cashier", permissions: ["X"] }),
      ),
    ),
    changePassword: vi.fn(reply(ok(null, "changed"))),
    forgotPassword: vi.fn(reply(ok(null, "sent"))),
    verifyPasswordCode: vi.fn(reply(ok({ token: "reset-token" }, "verified"))),
    resetPassword: vi.fn(reply(ok(null, "reset"))),
  };
}

describe("AuthService", () => {
  let repo: ReturnType<typeof fakeRepository>;
  let listeners: Array<[string, EventListenerOrEventListenerObject]>;
  let success: ReturnType<typeof vi.spyOn>;

  function service(): AuthService {
    const s = TestBed.inject(AuthService);
    success = vi.spyOn(TestBed.inject(NotificationService), "success");
    return s;
  }

  beforeEach(() => {
    localStorage.clear();
    repo = fakeRepository();
    // The service registers a window "storage" listener it never removes; track and remove them
    // so instances from earlier tests can't react to this test's storage events.
    listeners = [];
    const original = window.addEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation(((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type === "storage") listeners.push([type, listener]);
      original(type, listener, options);
    }) as typeof window.addEventListener);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AUTH_REPOSITORY, useValue: repo }],
    });
  });

  afterEach(() => {
    listeners.forEach(([type, l]) => window.removeEventListener(type, l));
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe("session restore", () => {
    it("starts signed out without a stored token", () => {
      localStorage.setItem(USER, JSON.stringify(user));
      const s = service();
      expect(s.isAuthenticated()).toBe(false);
      expect(s.currentUser()).toBeNull();
    });

    it("restores user, role and permissions from storage", () => {
      localStorage.setItem(ACCESS, "t");
      localStorage.setItem(USER, JSON.stringify(user));
      localStorage.setItem(ROLE, "Admin");
      localStorage.setItem(PERMS, JSON.stringify(["User.View"]));

      const s = service();
      expect(s.isAuthenticated()).toBe(true);
      expect(s.currentUser()).toEqual(user);
      expect(s.role()).toBe("Admin");
      expect(s.hasPermission("User.View")).toBe(true);
    });

    it("clears everything when the stored user is corrupted", () => {
      localStorage.setItem(ACCESS, "t");
      localStorage.setItem(USER, "{not json");
      localStorage.setItem(ROLE, "Admin");

      const s = service();
      expect(s.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(ACCESS)).toBeNull();
      expect(localStorage.getItem(ROLE)).toBeNull();
    });

    it("tolerates corrupted permissions (keeps none)", () => {
      localStorage.setItem(ACCESS, "t");
      localStorage.setItem(USER, JSON.stringify(user));
      localStorage.setItem(PERMS, "oops");

      const s = service();
      expect(s.isAuthenticated()).toBe(true);
      expect(s.permissions()).toEqual([]);
    });
  });

  describe("login", () => {
    it("stores tokens and session, exposes them, and toasts the API message", async () => {
      const s = service();
      const payload = { email: "sara@example.com", password: "pw" };

      expect(await firstValueFrom(s.login(payload))).toBe(true);

      expect(repo.login).toHaveBeenCalledWith(payload);
      expect(localStorage.getItem(ACCESS)).toBe("acc-1");
      expect(localStorage.getItem(REFRESH)).toBe("ref-1");
      expect(JSON.parse(localStorage.getItem(USER)!)).toEqual(user);
      expect(localStorage.getItem(ROLE)).toBe("Admin");
      expect(JSON.parse(localStorage.getItem(PERMS)!)).toEqual(["User.View", "Role.View"]);
      expect(s.isAuthenticated()).toBe(true);
      expect(s.hasRole("Admin")).toBe(true);
      expect(s.loading()).toBe(false);
      expect(s.hasError()).toBe(false);
      expect(success).toHaveBeenCalledWith("from-api");
    });

    it("fails (and flags an error) when the response has no data", async () => {
      repo.login.mockReturnValue(of({ ...ok(null) }));
      const s = service();

      expect(await firstValueFrom(s.login({ email: "a", password: "b" }))).toBe(false);
      expect(s.hasError()).toBe(true);
      expect(s.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(ACCESS)).toBeNull();
    });

    it("fails when the request errors", async () => {
      repo.login.mockReturnValue(throwError(() => new Error("401")));
      const s = service();

      expect(await firstValueFrom(s.login({ email: "a", password: "b" }))).toBe(false);
      expect(s.hasError()).toBe(true);
      expect(s.loading()).toBe(false);
    });
  });

  describe("logout", () => {
    function signedIn(): AuthService {
      localStorage.setItem(ACCESS, "t");
      localStorage.setItem(REFRESH, "ref-1");
      localStorage.setItem(USER, JSON.stringify(user));
      localStorage.setItem(ROLE, "Admin");
      localStorage.setItem(PERMS, JSON.stringify(["User.View"]));
      return service();
    }

    it("calls the API with the stored refresh token, then clears the session", async () => {
      const s = signedIn();

      expect(await firstValueFrom(s.logout())).toBe(true);

      expect(repo.logout).toHaveBeenCalledWith({ refreshToken: "ref-1" });
      expect(s.isAuthenticated()).toBe(false);
      expect(s.permissions()).toEqual([]);
      [ACCESS, REFRESH, USER, ROLE, PERMS].forEach((k) =>
        expect(localStorage.getItem(k)).toBeNull(),
      );
      expect(success).toHaveBeenCalledWith("bye");
    });

    it("clears locally without calling the API when there is no refresh token", async () => {
      const s = signedIn();
      localStorage.removeItem(REFRESH);

      expect(await firstValueFrom(s.logout())).toBe(true);
      expect(repo.logout).not.toHaveBeenCalled();
      expect(s.isAuthenticated()).toBe(false);
    });

    it("reports failure when the API call fails", async () => {
      repo.logout.mockReturnValue(throwError(() => new Error("500")));
      const s = signedIn();

      expect(await firstValueFrom(s.logout())).toBe(false);
      expect(s.hasError()).toBe(true);
      expect(s.loading()).toBe(false);
    });
  });

  describe("refreshToken", () => {
    it("fails without a stored refresh token", async () => {
      const s = service();
      expect(await firstValueFrom(s.refreshToken())).toBe(false);
      expect(repo.refreshToken).not.toHaveBeenCalled();
      expect(s.hasError()).toBe(true);
    });

    it("stores the new tokens and replaces role and permissions", async () => {
      localStorage.setItem(REFRESH, "ref-1");
      const s = service();

      expect(await firstValueFrom(s.refreshToken())).toBe(true);

      expect(repo.refreshToken).toHaveBeenCalledWith({ refreshToken: "ref-1" });
      expect(localStorage.getItem(ACCESS)).toBe("acc-2");
      expect(localStorage.getItem(REFRESH)).toBe("ref-2");
      expect(s.role()).toBe("Cashier");
      expect(s.permissions()).toEqual(["X"]);
      expect(JSON.parse(localStorage.getItem(PERMS)!)).toEqual(["X"]);
    });

    it("fails when the response carries no access token", async () => {
      localStorage.setItem(REFRESH, "ref-1");
      repo.refreshToken.mockReturnValue(of(ok(null)));
      const s = service();

      expect(await firstValueFrom(s.refreshToken())).toBe(false);
      expect(s.hasError()).toBe(true);
    });

    it("fails when the request errors", async () => {
      localStorage.setItem(REFRESH, "ref-1");
      repo.refreshToken.mockReturnValue(throwError(() => new Error("401")));
      const s = service();

      expect(await firstValueFrom(s.refreshToken())).toBe(false);
      expect(s.loading()).toBe(false);
    });
  });

  describe("password flows", () => {
    it.each([
      ["changePassword", "changePassword", { currentPassword: "a" }, "changed"],
      ["forgotPassword", "forgotPassword", { email: "a@b.c" }, "sent"],
      ["resetPassword", "resetPassword", { token: "t" }, "reset"],
    ] as const)(
      "%s resolves true and toasts the API message",
      async (method, repoMethod, payload, msg) => {
        const s = service();
        const run = (s[method] as (p: unknown) => Observable<boolean>).bind(s);

        expect(await firstValueFrom(run(payload))).toBe(true);
        expect(repo[repoMethod]).toHaveBeenCalledWith(payload);
        expect(success).toHaveBeenCalledWith(msg);
      },
    );

    it("verifyPasswordCode resolves the reset token", async () => {
      const s = service();
      expect(await firstValueFrom(s.verifyPasswordCode({ email: "a@b.c", code: "1" }))).toBe(
        "reset-token",
      );
    });

    it("verifyPasswordCode resolves null on failure", async () => {
      repo.verifyPasswordCode.mockReturnValue(throwError(() => new Error("400")));
      const s = service();
      expect(await firstValueFrom(s.verifyPasswordCode({ email: "a@b.c", code: "1" }))).toBeNull();
      expect(s.hasError()).toBe(true);
    });

    it("failures resolve false and set the error flag", async () => {
      repo.forgotPassword.mockReturnValue(throwError(() => new Error("404")));
      const s = service();
      expect(await firstValueFrom(s.forgotPassword({ email: "x" }))).toBe(false);
      expect(s.hasError()).toBe(true);
      expect(s.loading()).toBe(false);
    });
  });

  describe("permission helpers", () => {
    beforeEach(() => {
      localStorage.setItem(ACCESS, "t");
      localStorage.setItem(USER, JSON.stringify(user));
      localStorage.setItem(ROLE, "Cashier");
      localStorage.setItem(PERMS, JSON.stringify(["A", "B"]));
    });

    it("hasPermission checks exact membership", () => {
      const s = service();
      expect(s.hasPermission("A")).toBe(true);
      expect(s.hasPermission("C")).toBe(false);
    });

    it("hasAnyPermission: any match, and an empty requirement is satisfied", () => {
      const s = service();
      expect(s.hasAnyPermission(["C", "B"])).toBe(true);
      expect(s.hasAnyPermission(["C", "D"])).toBe(false);
      expect(s.hasAnyPermission([])).toBe(true);
    });

    it("hasRole compares the current role", () => {
      const s = service();
      expect(s.hasRole("Cashier")).toBe(true);
      expect(s.hasRole("Admin")).toBe(false);
    });
  });

  describe("session updates", () => {
    it("applyRefreshedSession stores tokens, role and permissions", () => {
      const s = service();
      s.applyRefreshedSession("acc-9", "ref-9", "Admin", ["Z"]);

      expect(localStorage.getItem(ACCESS)).toBe("acc-9");
      expect(localStorage.getItem(REFRESH)).toBe("ref-9");
      expect(s.role()).toBe("Admin");
      expect(s.permissions()).toEqual(["Z"]);
    });

    it("applyRefreshedSession keeps the old refresh token when none is returned", () => {
      localStorage.setItem(REFRESH, "ref-old");
      const s = service();
      s.applyRefreshedSession("acc-9", null, "Admin", []);
      expect(localStorage.getItem(REFRESH)).toBe("ref-old");
    });

    it("patchCurrentUser merges into the current user and persists it", () => {
      localStorage.setItem(ACCESS, "t");
      localStorage.setItem(USER, JSON.stringify(user));
      const s = service();

      s.patchCurrentUser({ fullName: "Sara K" });

      expect(s.currentUser()).toEqual({ ...user, fullName: "Sara K" });
      expect(JSON.parse(localStorage.getItem(USER)!).fullName).toBe("Sara K");
    });

    it("patchCurrentUser does nothing when signed out", () => {
      const s = service();
      s.patchCurrentUser({ fullName: "Ghost" });
      expect(s.currentUser()).toBeNull();
      expect(localStorage.getItem(USER)).toBeNull();
    });
  });

  describe("cross-tab sync", () => {
    const storageEvent = (init: StorageEventInit) =>
      window.dispatchEvent(new StorageEvent("storage", init));

    it("signs out and goes to /login when another tab removes the access token", () => {
      localStorage.setItem(ACCESS, "t");
      localStorage.setItem(USER, JSON.stringify(user));
      const s = service();
      const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);

      storageEvent({ key: ACCESS, oldValue: "t", newValue: null });

      expect(s.isAuthenticated()).toBe(false);
      expect(navigate).toHaveBeenCalledWith(["/login"]);
    });

    it("restores the session when another tab signs in", () => {
      const s = service();
      expect(s.isAuthenticated()).toBe(false);

      localStorage.setItem(ACCESS, "t");
      localStorage.setItem(USER, JSON.stringify(user));
      localStorage.setItem(ROLE, "Admin");
      storageEvent({ key: ACCESS, oldValue: null, newValue: "t" });

      expect(s.isAuthenticated()).toBe(true);
      expect(s.role()).toBe("Admin");
    });

    it("ignores changes to other keys", () => {
      localStorage.setItem(ACCESS, "t");
      localStorage.setItem(USER, JSON.stringify(user));
      const s = service();

      storageEvent({ key: "something-else", oldValue: "a", newValue: null });
      expect(s.isAuthenticated()).toBe(true);
    });
  });
});
