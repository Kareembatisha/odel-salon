import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { environment } from "@env/environment";
import { BranchPayload } from "../model/branch.model";
import { BranchApiRepository } from "./branch-api.repository";

const URL = `${environment.apiUrl}/branches`;

const PAYLOAD: BranchPayload = {
  nameAr: "فرع",
  nameEn: "Branch",
  address: "Somewhere",
  mapUrl: null,
  phone: "+201001102194",
  allowsRegular: true,
  allowsVip: false,
  allowsHome: false,
  workingHours: [{ dayOfWeek: 6, isOpen: true, openTime: "10:00:00", closeTime: "22:00:00" }],
};

describe("BranchApiRepository", () => {
  let repo: BranchApiRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    repo = TestBed.inject(BranchApiRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("GET /branches with the query as params", () => {
    repo.getBranches({ pageNumber: 2, pageSize: 12, search: "nasr", isVisible: false }).subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.method).toBe("GET");
    expect(req.request.params.get("pageNumber")).toBe("2");
    expect(req.request.params.get("pageSize")).toBe("12");
    expect(req.request.params.get("search")).toBe("nasr");
    expect(req.request.params.get("isVisible")).toBe("false");
    req.flush({});
  });

  it("GET /branches/{id}", () => {
    repo.getBranchById(7).subscribe();

    const req = http.expectOne(`${URL}/7`);
    expect(req.request.method).toBe("GET");
    req.flush({});
  });

  it("POST /branches with the payload", () => {
    repo.createBranch(PAYLOAD).subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual(PAYLOAD);
    req.flush({});
  });

  it("PUT /branches/{id} with the payload", () => {
    repo.updateBranch(7, PAYLOAD).subscribe();

    const req = http.expectOne(`${URL}/7`);
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toEqual(PAYLOAD);
    req.flush({});
  });

  it("PATCH /branches/{id}/toggle-status with no body", () => {
    repo.toggleBranchStatus(7).subscribe();

    const req = http.expectOne(`${URL}/7/toggle-status`);
    expect(req.request.method).toBe("PATCH");
    expect(req.request.body).toBeNull();
    req.flush({});
  });

  it("DELETE /branches with the ids in the JSON body", () => {
    repo.deleteBranches({ ids: [3, 4] }).subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe("DELETE");
    expect(req.request.body).toEqual({ ids: [3, 4] });
    req.flush({});
  });
});
