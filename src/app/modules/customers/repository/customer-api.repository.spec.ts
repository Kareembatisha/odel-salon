import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { environment } from "@env/environment";
import { CustomerTab } from "../model/customer.model";
import { CustomerApiRepository } from "./customer-api.repository";

const URL = `${environment.apiUrl}/customers`;

describe("CustomerApiRepository", () => {
  let repo: CustomerApiRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    repo = TestBed.inject(CustomerApiRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("GET /customers with the query as params", () => {
    repo
      .getCustomers({
        pageNumber: 2,
        pageSize: 20,
        tab: CustomerTab.HasMissedBookings,
        branchId: 1,
        search: " ahmed ",
      })
      .subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.method).toBe("GET");
    expect(req.request.params.get("pageNumber")).toBe("2");
    expect(req.request.params.get("pageSize")).toBe("20");
    expect(req.request.params.get("tab")).toBe("2");
    expect(req.request.params.get("branchId")).toBe("1");
    expect(req.request.params.get("search")).toBe("ahmed");
    req.flush({});
  });

  it("sends tab=0 (All) — zero is a real value", () => {
    repo.getCustomers({ pageNumber: 1, pageSize: 20, tab: CustomerTab.All }).subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.get("tab")).toBe("0");
    req.flush({});
  });

  it("omits the filters that are not set (no branch = every branch, blank search)", () => {
    repo.getCustomers({ pageNumber: 1, pageSize: 20, search: "   " }).subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.has("branchId")).toBe(false);
    expect(req.request.params.has("search")).toBe(false);
    expect(req.request.params.has("tab")).toBe(false);
    req.flush({});
  });

  it("GET /customers/{id}", () => {
    repo.getCustomerById(1203).subscribe();

    const req = http.expectOne(`${URL}/1203`);
    expect(req.request.method).toBe("GET");
    req.flush({});
  });
});
