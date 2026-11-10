import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { environment } from "@env/environment";
import {
  AdjustPricesRequest,
  CopyPricesRequest,
  ServicePayload,
  SetServiceStatusRequest,
} from "../model/service.model";
import { ServiceApiRepository } from "./service-api.repository";

const URL = `${environment.apiUrl}/services`;

describe("ServiceApiRepository", () => {
  let repo: ServiceApiRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    repo = TestBed.inject(ServiceApiRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("GET /services with the branch (always) and the filters as camelCase params", () => {
    repo
      .getServices({
        branchId: 3,
        pageNumber: 2,
        pageSize: 20,
        search: "cut",
        isActive: true,
        isHomeAvailable: true,
      })
      .subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.method).toBe("GET");
    expect(req.request.params.get("branchId")).toBe("3");
    expect(req.request.params.get("pageNumber")).toBe("2");
    expect(req.request.params.get("pageSize")).toBe("20");
    expect(req.request.params.get("search")).toBe("cut");
    expect(req.request.params.get("isActive")).toBe("true");
    expect(req.request.params.get("isHomeAvailable")).toBe("true");
    req.flush({});
  });

  it("GET /services sends false filters but omits unset ones", () => {
    repo
      .getServices({
        branchId: 3,
        pageNumber: 1,
        pageSize: 20,
        isActive: false,
        isHomeAvailable: false,
      })
      .subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.get("isActive")).toBe("false");
    expect(req.request.params.get("isHomeAvailable")).toBe("false");
    expect(req.request.params.has("search")).toBe(false);
    req.flush({});
  });

  it("GET /services/{id}", () => {
    repo.getServiceById(9).subscribe();

    const req = http.expectOne(`${URL}/9`);
    expect(req.request.method).toBe("GET");
    req.flush({});
  });

  it("POST /services with the payload", () => {
    const payload = { nameAr: "قص", nameEn: "Cut", branches: [] } as unknown as ServicePayload;
    repo.createService(payload).subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual(payload);
    req.flush({});
  });

  it("PUT /services/{id} with the payload", () => {
    const payload = { nameAr: "قص", nameEn: "Cut+", branches: [] } as unknown as ServicePayload;
    repo.updateService(9, payload).subscribe();

    const req = http.expectOne(`${URL}/9`);
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toEqual(payload);
    req.flush({});
  });

  it("DELETE /services with the ids in the request body", () => {
    repo.deleteServices({ ids: [1, 2] }).subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe("DELETE");
    expect(req.request.body).toEqual({ ids: [1, 2] });
    req.flush({});
  });

  it("PATCH /services/{id}/branches/status sets (not toggles) the status in the listed branches", () => {
    const payload = { branchIds: [1, 2], isActive: false } as SetServiceStatusRequest;
    repo.setStatusInBranches(9, payload).subscribe();

    const req = http.expectOne(`${URL}/9/branches/status`);
    expect(req.request.method).toBe("PATCH");
    expect(req.request.body).toEqual(payload);
    req.flush({});
  });

  it("POST /services/copy-prices", () => {
    const payload = { sourceBranchId: 1, targetBranchId: 2 } as CopyPricesRequest;
    repo.copyPrices(payload).subscribe();

    const req = http.expectOne(`${URL}/copy-prices`);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual(payload);
    req.flush({});
  });

  it("POST /services/adjust-prices", () => {
    const payload = { branchId: 1, percentage: 10, serviceIds: [4, 5] } as AdjustPricesRequest;
    repo.adjustPrices(payload).subscribe();

    const req = http.expectOne(`${URL}/adjust-prices`);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual(payload);
    req.flush({});
  });
});
