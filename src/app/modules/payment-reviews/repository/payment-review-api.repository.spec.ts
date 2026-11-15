import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { environment } from "@env/environment";
import { PaymentReviewTab } from "../model/payment-review.model";
import { PaymentReviewApiRepository } from "./payment-review-api.repository";

const URL = `${environment.apiUrl}/bookings`;

describe("PaymentReviewApiRepository", () => {
  let repo: PaymentReviewApiRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    repo = TestBed.inject(PaymentReviewApiRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("GET /bookings/payment-reviews with tab, branch and paging", () => {
    repo
      .getPaymentReviews({
        pageNumber: 1,
        pageSize: 20,
        tab: PaymentReviewTab.ApprovedToday,
        branchId: 1,
      })
      .subscribe();

    const req = http.expectOne((r) => r.url === `${URL}/payment-reviews`);
    expect(req.request.method).toBe("GET");
    expect(req.request.params.get("tab")).toBe("1");
    expect(req.request.params.get("branchId")).toBe("1");
    expect(req.request.params.get("pageNumber")).toBe("1");
    expect(req.request.params.get("pageSize")).toBe("20");
    req.flush({});
  });

  it("PATCH /bookings/{id}/approve with no body", () => {
    repo.approveBooking(489).subscribe();

    const req = http.expectOne(`${URL}/489/approve`);
    expect(req.request.method).toBe("PATCH");
    expect(req.request.body).toBeNull();
    req.flush({});
  });

  it("PATCH /bookings/{id}/reject with the reason as the JSON body", () => {
    repo.rejectBooking(489, { reason: "The transferred amount doesn't match." }).subscribe();

    const req = http.expectOne(`${URL}/489/reject`);
    expect(req.request.method).toBe("PATCH");
    expect(req.request.body).toEqual({ reason: "The transferred amount doesn't match." });
    req.flush({});
  });
});
