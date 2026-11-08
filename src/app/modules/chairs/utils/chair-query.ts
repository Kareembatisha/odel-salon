import { HttpParams } from "@angular/common/http";

import { ChairsQuery } from "../model/chair.model";

/**
 * Builds GET /chairs query params with the camelCase names from the API contract
 * (pageNumber, pageSize, branchId, type, isActive, search).
 *
 * Unset filters are omitted. `type=0` (Regular) and `isActive=false` ARE sent —
 * 0 and false are real filters, so checks must be `!== undefined`, never truthiness.
 */
export function buildChairsParams(q: ChairsQuery): HttpParams {
  let params = new HttpParams().set("pageNumber", q.pageNumber).set("pageSize", q.pageSize);
  if (q.branchId !== undefined) params = params.set("branchId", q.branchId);
  if (q.type !== undefined) params = params.set("type", q.type);
  if (q.isActive !== undefined) params = params.set("isActive", q.isActive);
  if (q.search) params = params.set("search", q.search);
  return params;
}
