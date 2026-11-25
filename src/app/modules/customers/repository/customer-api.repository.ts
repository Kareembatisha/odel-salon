import { HttpClient, HttpParams } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { environment } from "@env/environment";
import { ApiResponse } from "@shared/model/api_response.model";
import { CustomerDetails, CustomerListItem, CustomersQuery } from "../model/customer.model";
import { ICustomerRepository } from "./customer.repository";

/**
 * HTTP implementation of {@link ICustomerRepository}.
 *
 * Thin pass-through over the `/customers` endpoints — no mapping or side effects. Unset filters are
 * omitted; `tab=0` (All) IS sent, because zero is a real value. Errors (403 / 404) are surfaced by
 * the error interceptor; this class does not catch them.
 */
@Injectable({ providedIn: "root" })
export class CustomerApiRepository implements ICustomerRepository {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/customers`;

  getCustomers(query: CustomersQuery): Observable<ApiResponse<CustomerListItem[]>> {
    let params = new HttpParams()
      .set("pageNumber", query.pageNumber)
      .set("pageSize", query.pageSize);
    if (query.tab !== undefined) params = params.set("tab", query.tab);
    if (query.branchId !== undefined) params = params.set("branchId", query.branchId);
    const search = query.search?.trim();
    if (search) params = params.set("search", search);

    return this.http.get<ApiResponse<CustomerListItem[]>>(this.url, { params });
  }

  getCustomerById(id: number): Observable<ApiResponse<CustomerDetails>> {
    return this.http.get<ApiResponse<CustomerDetails>>(`${this.url}/${id}`);
  }
}
