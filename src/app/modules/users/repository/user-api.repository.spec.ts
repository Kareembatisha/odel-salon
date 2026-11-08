import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { environment } from "@env/environment";
import { CreateUserRequest, UpdateUserRequest } from "../model/user.model";
import { UserApiRepository } from "./user-api.repository";

const URL = `${environment.apiUrl}/users`;

describe("UserApiRepository", () => {
  let repo: UserApiRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    repo = TestBed.inject(UserApiRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // PascalCase is the casing the Users API binds today; whether it should change is open
  // (Step 02, decision D3), so this test pins the current contract.
  it("GET /users with the query as PascalCase params", () => {
    repo
      .getUsers({ pageNumber: 2, pageSize: 10, roleId: 4, status: true, search: "ali" })
      .subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.method).toBe("GET");
    expect(req.request.params.get("PageNumber")).toBe("2");
    expect(req.request.params.get("PageSize")).toBe("10");
    expect(req.request.params.get("RoleId")).toBe("4");
    expect(req.request.params.get("Status")).toBe("true");
    expect(req.request.params.get("Search")).toBe("ali");
    req.flush({});
  });

  it("GET /users still sends Status=false and omits unset filters", () => {
    repo.getUsers({ pageNumber: 1, pageSize: 10, status: false }).subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.get("Status")).toBe("false");
    expect(req.request.params.has("RoleId")).toBe(false);
    expect(req.request.params.has("Search")).toBe(false);
    req.flush({});
  });

  it("GET /users/{id}", () => {
    repo.getUser(5).subscribe();

    const req = http.expectOne(`${URL}/5`);
    expect(req.request.method).toBe("GET");
    req.flush({});
  });

  it("POST /users with the payload", () => {
    const payload = { fullName: "Ali" } as CreateUserRequest;
    repo.createUser(payload).subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual(payload);
    req.flush({});
  });

  it("PUT /users/{id} with the payload", () => {
    const payload = { fullName: "Ali B" } as UpdateUserRequest;
    repo.updateUser(5, payload).subscribe();

    const req = http.expectOne(`${URL}/5`);
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toEqual(payload);
    req.flush({});
  });

  it("PATCH /users/{id}/toggle-status without a body", () => {
    repo.toggleStatus(5).subscribe();

    const req = http.expectOne(`${URL}/5/toggle-status`);
    expect(req.request.method).toBe("PATCH");
    expect(req.request.body).toBeNull();
    req.flush({});
  });

  it("DELETE /users with the ids in the request body", () => {
    repo.deleteUsers({ ids: [5, 6] }).subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe("DELETE");
    expect(req.request.body).toEqual({ ids: [5, 6] });
    req.flush({});
  });
});
