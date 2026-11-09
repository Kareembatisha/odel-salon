import { HttpClient, provideHttpClient, withInterceptors } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { tokenInterceptor } from "./token.interceptor";

const KEY = "odl_access_token";

describe("tokenInterceptor", () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([tokenInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    ctrl.verify();
    localStorage.clear();
  });

  it("adds the Bearer token to a normal request", () => {
    localStorage.setItem(KEY, "abc123");
    http.get("/api/v1/users").subscribe();

    const req = ctrl.expectOne("/api/v1/users");
    expect(req.request.headers.get("Authorization")).toBe("Bearer abc123");
    req.flush({});
  });

  it("sends no Authorization header when there is no token", () => {
    http.get("/api/v1/users").subscribe();

    const req = ctrl.expectOne("/api/v1/users");
    expect(req.request.headers.has("Authorization")).toBe(false);
    req.flush({});
  });

  it.each([
    "/api/v1/auth/login",
    "/api/v1/auth/password/forgot",
    "/api/v1/auth/password/verify",
    "/api/v1/auth/password/reset",
    "/api/v1/auth/refresh-token",
    "/api/v1/products/public/ABC",
  ])("never attaches the token to the public endpoint %s", (url) => {
    localStorage.setItem(KEY, "abc123");
    http.post(url, {}).subscribe();

    const req = ctrl.expectOne(url);
    expect(req.request.headers.has("Authorization")).toBe(false);
    req.flush({});
  });

  it("does not touch the original request headers or body", () => {
    localStorage.setItem(KEY, "abc123");
    http.post("/api/v1/chairs", { name: "R1" }, { headers: { "X-Test": "1" } }).subscribe();

    const req = ctrl.expectOne("/api/v1/chairs");
    expect(req.request.headers.get("X-Test")).toBe("1");
    expect(req.request.body).toEqual({ name: "R1" });
    req.flush({});
  });
});
