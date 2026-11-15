import { HttpParams } from "@angular/common/http";

import { BookingsQuery } from "../model/booking.model";

/**
 * Builds GET /bookings query params with the camelCase names from the API contract.
 *
 * Unset filters are omitted. `tab=0` (All) and `refundStatus=0` (Waiting) ARE sent — zero is a real
 * value, so every check is `!== undefined`, never truthiness. `statuses` is repeated
 * (`?statuses=1&statuses=4`), once per distinct value. A blank search is not sent.
 */
export function buildBookingsParams(q: BookingsQuery): HttpParams {
  let params = new HttpParams().set("pageNumber", q.pageNumber).set("pageSize", q.pageSize);
  if (q.tab !== undefined) params = params.set("tab", q.tab);
  if (q.branchId !== undefined) params = params.set("branchId", q.branchId);
  if (q.barberId !== undefined) params = params.set("barberId", q.barberId);
  if (q.type !== undefined) params = params.set("type", q.type);
  for (const status of new Set(q.statuses ?? [])) params = params.append("statuses", status);
  if (q.dateFrom) params = params.set("dateFrom", q.dateFrom);
  if (q.dateTo) params = params.set("dateTo", q.dateTo);
  if (q.refundStatus !== undefined) params = params.set("refundStatus", q.refundStatus);
  const search = q.search?.trim();
  if (search) params = params.set("search", search);
  return params;
}
