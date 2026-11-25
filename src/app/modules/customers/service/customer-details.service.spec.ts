import { TestBed } from "@angular/core/testing";
import { Observable, of, throwError } from "rxjs";
import { beforeEach, describe, expect, it } from "vitest";

import { ApiResponse } from "@shared/model/api_response.model";
import { CustomerDetails } from "../model/customer.model";
import { CUSTOMER_REPOSITORY } from "../repository/customer.repository";
import { CustomerDetailsService } from "./customer-details.service";

const customer = (): CustomerDetails => ({
  id: 1203,
  fullName: "Ahmed Hassan",
  countryCode: "+20",
  phoneNumber: "+201001234567",
  email: "ahmed.hassan@gmail.com",
  imageUrl: null,
  createdAt: "2026-03-04T10:15:22",
  visitsCount: 12,
  missedCount: 1,
  lastMissedDate: "2026-09-03",
  bookingsCount: 14,
  latestBookings: [],
});

const envelope = <T>(over: Partial<ApiResponse<T>>): ApiResponse<T> => ({
  status: true,
  statusCode: 200,
  message: "ok",
  errors: null,
  meta: null,
  data: null,
  ...over,
});

describe("CustomerDetailsService", () => {
  let service: CustomerDetailsService;
  let repo: { getCustomerById: (id: number) => Observable<ApiResponse<CustomerDetails>> };

  const read = () => new Promise((resolve) => service.getCustomer(1203).subscribe(resolve));

  beforeEach(() => {
    repo = { getCustomerById: () => of(envelope<CustomerDetails>({ data: customer() })) };
    TestBed.configureTestingModule({
      providers: [{ provide: CUSTOMER_REPOSITORY, useValue: repo }],
    });
    service = TestBed.inject(CustomerDetailsService);
  });

  it("returns the customer", async () => {
    expect(await read()).toEqual({ kind: "ok", customer: customer() });
  });

  it("tells a missing customer apart: a status:false 404 body, or an HTTP 404", async () => {
    repo.getCustomerById = () => of(envelope<CustomerDetails>({ status: false, statusCode: 404 }));
    expect(await read()).toEqual({ kind: "notFound" });

    repo.getCustomerById = () => throwError(() => ({ status: 404 }));
    expect(await read()).toEqual({ kind: "notFound" });
  });

  it("calls any other failure 'failed' (so the page offers a retry)", async () => {
    repo.getCustomerById = () => throwError(() => ({ status: 500 }));
    expect(await read()).toEqual({ kind: "failed" });

    repo.getCustomerById = () => of(envelope<CustomerDetails>({ status: false, statusCode: 500 }));
    expect(await read()).toEqual({ kind: "failed" });
  });

  it("calls a successful answer without data 'failed'", async () => {
    repo.getCustomerById = () => of(envelope<CustomerDetails>({ data: null }));

    expect(await read()).toEqual({ kind: "failed" });
  });
});
