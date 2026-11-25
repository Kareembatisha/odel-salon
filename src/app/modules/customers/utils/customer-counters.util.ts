import { PaginationMeta } from "@shared/model/api_response.model";
import { CustomerCounters } from "../model/customer.model";

/** A counter the backend didn't send is 0, never `undefined` or `NaN`. */
function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Reads the tab counts out of `meta.additionalData` of GET /customers. */
export function readCustomerCounters(meta: PaginationMeta | null): CustomerCounters {
  const data = meta?.additionalData ?? {};
  return {
    allCount: count(data["allCount"]),
    visitedThisMonthCount: count(data["visitedThisMonthCount"]),
    hasMissedBookingsCount: count(data["hasMissedBookingsCount"]),
    notBackIn60DaysCount: count(data["notBackIn60DaysCount"]),
  };
}
