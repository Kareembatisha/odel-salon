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

  it("PATCH /bookings/{id}/cancel with the reason", () => {
    repo.cancelBooking(482, "The barber is sick").subscribe();

    const req = http.expectOne(`${URL}/482/cancel`);
    expect(req.request.method).toBe("PATCH");
    expect(req.request.body).toEqual({ reason: "The barber is sick" });
    req.flush({});
  });

  it("PATCH /bookings/{id}/no-show with no body", () => {
    repo.markNoShow(482).subscribe();

    const req = http.expectOne(`${URL}/482/no-show`);
    expect(req.request.method).toBe("PATCH");
    expect(req.request.body).toBeNull();
    req.flush({});
  });

  it("PUT /bookings/{id}/barber with the new barber", () => {
    repo.reassignBarber(482, 7).subscribe();

    const req = http.expectOne(`${URL}/482/barber`);
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toEqual({ barberId: 7 });
    req.flush({});
  });

  it("GET /bookings sends customerId when it is set", () => {
    repo.getBookings({ pageNumber: 1, pageSize: 20, customerId: 1203 }).subscribe();

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.get("customerId")).toBe("1203");
    expect(req.request.params.has("branchId")).toBe(false);
    req.flush({});
  });

  it("PATCH /bookings/{id}/refund with no body", () => {
    repo.markRefunded(476).subscribe();

    const req = http.expectOne(`${URL}/476/refund`);
    expect(req.request.method).toBe("PATCH");
    expect(req.request.body).toBeNull();
    req.flush({});
  });
});
