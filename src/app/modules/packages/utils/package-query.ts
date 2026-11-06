import { HttpParams } from "@angular/common/http";

import { PackagesQuery } from "../model/package.model";

/**
 * Builds GET /packages query params with the camelCase names from the API contract
 * (branchId, pageNumber, pageSize, search, isActive).
 *
 * `branchId` is always sent (required). Unset filters are omitted, but `isActive=false`
 * IS sent — false is a real filter, so the check must be `!== undefined`, never truthiness.
 */
export function buildPackagesParams(q: PackagesQuery): HttpParams {
  let params = new HttpParams()
    .set("branchId", q.branchId)
    .set("pageNumber", q.pageNumber)
    .set("pageSize", q.pageSize);
  if (q.isActive !== undefined) params = params.set("isActive", q.isActive);
  if (q.search) params = params.set("search", q.search);
  return params;
}
