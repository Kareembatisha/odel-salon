import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { environment } from "@env/environment";
import { BookingStatus, BookingTab } from "../model/booking.model";
import { BookingApiRepository } from "./booking-api.repository";

const URL = `${environment.apiUrl}/bookings`;

describe("BookingApiRepository", () => {
  let repo: BookingApiRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    repo = TestBed.inject(BookingApiRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("GET /bookings with the query as params, statuses repeated", () => {
    repo
      .getBookings({
        pageNumber: 1,
        pageSize: 20,
        tab: BookingTab.Today,
        branchId: 1,
        statuses: [BookingStatus.Confirmed, BookingStatus.Completed],
        search: "OD-000482",
      })
      .subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.method).toBe("GET");
    expect(req.request.params.get("tab")).toBe("1");
    expect(req.request.params.get("branchId")).toBe("1");
    expect(req.request.params.getAll("statuses")).toEqual(["1", "4"]);
    expect(req.request.params.get("search")).toBe("OD-000482");
    req.flush({});
  });

  it("GET /bookings/{id}", () => {
    repo.getBookingById(482).subscribe();

    const req = http.expectOne(`${URL}/482`);
    expect(req.request.method).toBe("GET");
    req.flush({});
  });

  it("PATCH /bookings/{id}/complete with no body", () => {
    repo.completeBooking(482).subscribe();

    const req = http.expectOne(`${URL}/482/complete`);
    expect(req.request.method).toBe("PATCH");
    expect(req.request.body).toBeNull();
    req.flush({});
  });

  it("returns the server's envelope untouched (meta.additionalData included)", () => {
    const body = {
      status: true,
      statusCode: 200,
      message: "ok",
      errors: null,
      meta: { additionalData: { todayCount: 42, refundWaitingCount: 3 } },
      data: [],
    };
    let received: unknown;
    repo.getBookings({ pageNumber: 1, pageSize: 20 }).subscribe((r) => (received = r));

    http.expectOne((r) => r.url === URL).flush(body);
    expect(received).toEqual(body);
  });
});
