import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { environment } from "@env/environment";
import { RoleApiRepository } from "./role-api.repository";

const URL = `${environment.apiUrl}/roles`;

describe("RoleApiRepository", () => {
  let repo: RoleApiRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    repo = TestBed.inject(RoleApiRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // PascalCase is the casing the Roles API binds today; whether it should change is open
  // (Step 02, decision D3), so this test pins the current contract.
  it("GET /roles with the query as PascalCase params", () => {
    repo
      .getRoles({ pageNumber: 1, pageSize: 10, search: "man", includePermissions: true })
      .subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.method).toBe("GET");
    expect(req.request.params.get("PageNumber")).toBe("1");
    expect(req.request.params.get("PageSize")).toBe("10");
    expect(req.request.params.get("Search")).toBe("man");
    expect(req.request.params.get("IncludePermissions")).toBe("true");
    req.flush({});
  });

  it("GET /roles omits Search and IncludePermissions when unset", () => {
    repo.getRoles({ pageNumber: 1, pageSize: 10 }).subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.has("Search")).toBe(false);
    expect(req.request.params.has("IncludePermissions")).toBe(false);
    req.flush({});
  });

  it("GET /roles/{id}", () => {
    repo.getRole(3).subscribe();

    const req = http.expectOne(`${URL}/3`);
    expect(req.request.method).toBe("GET");
    req.flush({});
  });

  it("GET /roles/{id} returns the matrix under `modules`", () => {
    let modules: unknown;
    repo.getRole(2).subscribe((res) => (modules = res.data?.modules));

    http.expectOne(`${URL}/2`).flush({
      status: true,
      statusCode: 200,
      message: "ok",
      meta: null,
      errors: null,
      data: {
        id: 2,
        name: "test-role",
        countUsers: 0,
        modules: [
          {
            module: "User",
            permissions: [{ name: "View", value: "User.View", isEnabled: false }],
          },
        ],
      },
    });

    expect(modules).toEqual([
      { module: "User", permissions: [{ name: "View", value: "User.View", isEnabled: false }] },
    ]);
  });

  it("POST /roles with the name", () => {
    repo.createRole({ name: "Cashier" }).subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual({ name: "Cashier" });
    req.flush({});
  });

  it("PUT /roles/{id} with the name", () => {
    repo.updateRole(3, { name: "Senior cashier" }).subscribe();

    const req = http.expectOne(`${URL}/3`);
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toEqual({ name: "Senior cashier" });
    req.flush({});
  });

  it("PUT /roles/{id}/permissions with the full permission list", () => {
    repo.updatePermissions(3, { permissions: ["User.View", "Role.View"] }).subscribe();

    const req = http.expectOne(`${URL}/3/permissions`);
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toEqual({ permissions: ["User.View", "Role.View"] });
    req.flush({});
  });

  it("DELETE /roles with the ids in the request body", () => {
    repo.deleteRoles({ ids: [3, 4] }).subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe("DELETE");
    expect(req.request.body).toEqual({ ids: [3, 4] });
    req.flush({});
  });
});
