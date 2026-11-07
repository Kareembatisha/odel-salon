import { HttpParams } from "@angular/common/http";

import { OffersQuery } from "../model/offer.model";

/**
 * Builds GET /offers query params with the camelCase names from the API contract
 * (branchId, pageNumber, pageSize, search, statuses).
 *
 * `branchId` is always sent (required). `statuses` is a REPEATED key
 * (`statuses=2&statuses=3&statuses=4`) — `0` (Active) is a real value, so nothing here may test
 * truthiness. An empty / missing list means "every status" and sends no key at all.
 */
export function buildOffersParams(q: OffersQuery): HttpParams {
  let params = new HttpParams()
    .set("branchId", q.branchId)
    .set("pageNumber", q.pageNumber)
    .set("pageSize", q.pageSize);
  if (q.search) params = params.set("search", q.search);
  for (const status of q.statuses ?? []) params = params.append("statuses", status);
  return params;
}
