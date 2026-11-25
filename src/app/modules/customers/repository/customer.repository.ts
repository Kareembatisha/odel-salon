import { InjectionToken } from "@angular/core";
import { Observable } from "rxjs";

import { ApiResponse } from "@shared/model/api_response.model";
import { CustomerDetails, CustomerListItem, CustomersQuery } from "../model/customer.model";

export const CUSTOMER_REPOSITORY = new InjectionToken<ICustomerRepository>("CUSTOMER_REPOSITORY");

/** Contract shared by the HTTP and mock repositories (pure data access). */
export interface ICustomerRepository {
  /**
   * GET /customers — a page of customers, newest booking first (customers without bookings last).
   * `meta.additionalData` carries the count of every tab (see `readCustomerCounters`).
   */
  getCustomers(query: CustomersQuery): Observable<ApiResponse<CustomerListItem[]>>;

  /** GET /customers/{id} — 404 when the id doesn't exist or isn't a customer. */
  getCustomerById(id: number): Observable<ApiResponse<CustomerDetails>>;
}
