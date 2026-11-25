import { Injectable, inject } from "@angular/core";
import { Observable, catchError, map, of } from "rxjs";

import { CustomerDetails } from "../model/customer.model";
import { CUSTOMER_REPOSITORY } from "../repository/customer.repository";

/** What reading one customer can come to — "gone" is not the same as "couldn't load". */
export type CustomerLoadResult =
  { kind: "ok"; customer: CustomerDetails } | { kind: "notFound" } | { kind: "failed" };

/**
 * One customer (`/main/customers/:id`): read-only.
 *
 * Reading tells a missing customer (404) from a load failure, because they need different screens
 * (a "doesn't exist" message vs a retry). A missing customer arrives either as an HTTP 404 or as a
 * `status: false` body with `statusCode` 404 (that is how the mock answers).
 */
@Injectable({ providedIn: "root" })
export class CustomerDetailsService {
  private readonly repository = inject(CUSTOMER_REPOSITORY);

  getCustomer(id: number): Observable<CustomerLoadResult> {
    return this.repository.getCustomerById(id).pipe(
      map((res): CustomerLoadResult => {
        if (res.status && res.data) return { kind: "ok", customer: res.data };
        return res.statusCode === 404 ? { kind: "notFound" } : { kind: "failed" };
      }),
      catchError((err: { status?: number }) =>
        of<CustomerLoadResult>(err?.status === 404 ? { kind: "notFound" } : { kind: "failed" }),
      ),
    );
  }
}
