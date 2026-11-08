import { HttpParams } from "@angular/common/http";

import { BarbersQuery } from "../model/barber.model";

/**
 * Builds GET /barbers query params with the camelCase names from the API contract
 * (pageNumber, pageSize, branchId, isActive, search).
 *
 * Unset filters are omitted. `isActive=false` (suspended only) IS sent — false is a
 * real filter, so checks must be `!== undefined`, never truthiness.
 */
export function buildBarbersParams(q: BarbersQuery): HttpParams {
  let params = new HttpParams().set("pageNumber", q.pageNumber).set("pageSize", q.pageSize);
  if (q.branchId !== undefined) params = params.set("branchId", q.branchId);
  if (q.isActive !== undefined) params = params.set("isActive", q.isActive);
  if (q.search) params = params.set("search", q.search);
  return params;
}
