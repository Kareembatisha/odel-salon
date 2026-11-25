import { addDays } from "../../offers/utils/offer-dates.util";
import { CustomerTab } from "../model/customer.model";

/** `CUSTOMERS.TAB.*` key of each tab, in display order. */
export const CUSTOMER_TABS: ReadonlyArray<[CustomerTab, string]> = [
  [CustomerTab.All, "CUSTOMERS.TAB.ALL"],
  [CustomerTab.VisitedThisMonth, "CUSTOMERS.TAB.VISITED_THIS_MONTH"],
  [CustomerTab.HasMissedBookings, "CUSTOMERS.TAB.HAS_MISSED"],
  [CustomerTab.NotBackIn60Days, "CUSTOMERS.TAB.NOT_BACK"],
];

/** A last visit is shown as "Never", "Today", "Yesterday" or a date. */
export type LastVisit =
  { kind: "never" } | { kind: "today" } | { kind: "yesterday" } | { kind: "date"; day: string };

/**
 * Classifies a salon date (`yyyy-MM-dd`, no time) against today's salon date. Null means the
 * customer never visited.
 */
export function lastVisitOf(day: string | null, today: string): LastVisit {
  if (day === null) return { kind: "never" };
  if (day === today) return { kind: "today" };
  if (day === addDays(today, -1)) return { kind: "yesterday" };
  return { kind: "date", day };
}

/** The `CUSTOMERS.LAST_VISIT.*` key of a visit that isn't a plain date. */
export function lastVisitKey(visit: Exclude<LastVisit, { kind: "date" }>): string {
  switch (visit.kind) {
    case "never":
      return "CUSTOMERS.LAST_VISIT.NEVER";
    case "today":
      return "CUSTOMERS.LAST_VISIT.TODAY";
    case "yesterday":
      return "CUSTOMERS.LAST_VISIT.YESTERDAY";
  }
}
