import { describe, expect, it } from "vitest";

import { CustomerTab } from "../model/customer.model";
import { CUSTOMER_TABS, lastVisitKey, lastVisitOf } from "./customer-labels.util";

describe("customer labels", () => {
  it("lists the four tabs in order, each with a translation key", () => {
    expect(CUSTOMER_TABS.map(([tab]) => tab)).toEqual([
      CustomerTab.All,
      CustomerTab.VisitedThisMonth,
      CustomerTab.HasMissedBookings,
      CustomerTab.NotBackIn60Days,
    ]);
    for (const [, key] of CUSTOMER_TABS) expect(key).toMatch(/^CUSTOMERS\.TAB\./);
  });

  describe("lastVisitOf", () => {
    const today = "2026-11-13";

    it("is 'never' without a visit", () => {
      expect(lastVisitOf(null, today)).toEqual({ kind: "never" });
    });

    it("is 'today' and 'yesterday' for those days", () => {
      expect(lastVisitOf("2026-11-13", today)).toEqual({ kind: "today" });
      expect(lastVisitOf("2026-11-12", today)).toEqual({ kind: "yesterday" });
    });

    it("is a plain date for any other day, even across a month start", () => {
      expect(lastVisitOf("2026-11-11", today)).toEqual({ kind: "date", day: "2026-11-11" });
      expect(lastVisitOf("2026-10-31", "2026-11-01")).toEqual({ kind: "yesterday" });
    });
  });

  it("maps a visit that isn't a date to its key", () => {
    expect(lastVisitKey({ kind: "never" })).toBe("CUSTOMERS.LAST_VISIT.NEVER");
    expect(lastVisitKey({ kind: "today" })).toBe("CUSTOMERS.LAST_VISIT.TODAY");
    expect(lastVisitKey({ kind: "yesterday" })).toBe("CUSTOMERS.LAST_VISIT.YESTERDAY");
  });
});
