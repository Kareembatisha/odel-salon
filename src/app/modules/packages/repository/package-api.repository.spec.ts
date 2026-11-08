import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { environment } from "@env/environment";
import { CreatePackagePayload, UpdatePackagePayload } from "../model/package.model";
import { PackageApiRepository } from "./package-api.repository";

const URL = `${environment.apiUrl}/packages`;

describe("PackageApiRepository", () => {
  let repo: PackageApiRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    repo = TestBed.inject(PackageApiRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("GET /packages with the query as camelCase params", () => {
    repo
      .getPackages({ branchId: 3, pageNumber: 2, pageSize: 12, search: "gold", isActive: true })
      .subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.method).toBe("GET");
    expect(req.request.params.get("branchId")).toBe("3");
    expect(req.request.params.get("pageNumber")).toBe("2");
    expect(req.request.params.get("pageSize")).toBe("12");
    expect(req.request.params.get("search")).toBe("gold");
    expect(req.request.params.get("isActive")).toBe("true");
    req.flush({});
  });

  it("GET /packages still sends isActive=false (a real filter, not unset)", () => {
    repo.getPackages({ branchId: 3, pageNumber: 1, pageSize: 12, isActive: false }).subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.get("isActive")).toBe("false");
    expect(req.request.params.has("search")).toBe(false);
    req.flush({});
  });

  it("GET /packages/{id}", () => {
    repo.getPackageById(8).subscribe();

    const req = http.expectOne(`${URL}/8`);
    expect(req.request.method).toBe("GET");
    req.flush({});
  });

  it("POST /packages with the payload", () => {
    const payload = {
      branchId: 3,
      nameAr: "باقة",
      nameEn: "Gold",
      serviceIds: [1, 2],
      regularPrice: 100,
      vipPrice: 150,
    } as CreatePackagePayload;
    repo.createPackage(payload).subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual(payload);
    req.flush({});
  });

  it("PUT /packages/{id} with the payload", () => {
    const payload = { nameEn: "Gold+" } as UpdatePackagePayload;
    repo.updatePackage(8, payload).subscribe();

    const req = http.expectOne(`${URL}/8`);
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toEqual(payload);
    req.flush({});
  });

  it("PATCH /packages/{id}/toggle-status without a body", () => {
    repo.togglePackageStatus(8).subscribe();

    const req = http.expectOne(`${URL}/8/toggle-status`);
    expect(req.request.method).toBe("PATCH");
    expect(req.request.body).toBeNull();
    req.flush({});
  });

  it("DELETE /packages with the ids in the request body", () => {
    repo.deletePackages({ ids: [1, 2] }).subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe("DELETE");
    expect(req.request.body).toEqual({ ids: [1, 2] });
    req.flush({});
  });
});
