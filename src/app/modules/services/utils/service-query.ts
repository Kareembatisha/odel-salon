import { HttpParams } from "@angular/common/http";

import { ServicesQuery } from "../model/service.model";

/**
 * Builds GET /services query params with the camelCase names from the API contract
 * (branchId, pageNumber, pageSize, search, isActive, isHomeAvailable).
 *
 * `branchId` is always sent (required). Unset filters are omitted; `isActive=false` and
 * `isHomeAvailable=false` ARE sent — false is a real filter, so checks must be
 * `!== undefined`, never truthiness. `null` (the contract's "no filter") is treated as unset.
 */
export function buildServicesParams(q: ServicesQuery): HttpParams {
  let params = new HttpParams()
    .set("branchId", q.branchId)
    .set("pageNumber", q.pageNumber)
    .set("pageSize", q.pageSize);
  if (q.search) params = params.set("search", q.search);
  if (q.isActive !== undefined && q.isActive !== null) {
    params = params.set("isActive", q.isActive);
  }
  if (q.isHomeAvailable !== undefined && q.isHomeAvailable !== null) {
    params = params.set("isHomeAvailable", q.isHomeAvailable);
  }
  return params;
}
