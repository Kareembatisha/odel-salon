import { describe, expect, it } from "vitest";

import { BookingStatus, BookingTab, BookingType, RefundStatus } from "../model/booking.model";
import { buildBookingsParams } from "./booking-query";

describe("buildBookingsParams", () => {
  it("always sends the paging", () => {
    const p = buildBookingsParams({ pageNumber: 2, pageSize: 50 });

    expect(p.get("pageNumber")).toBe("2");
    expect(p.get("pageSize")).toBe("50");
    expect(p.keys().sort()).toEqual(["pageNumber", "pageSize"]);
  });

  it("sends every filter under the contract's names", () => {
    const p = buildBookingsParams({
      pageNumber: 1,
      pageSize: 20,
      tab: BookingTab.Today,
      branchId: 1,
      barberId: 4,
      type: BookingType.Vip,
      dateFrom: "2026-11-12",
      dateTo: "2026-11-13",
      refundStatus: RefundStatus.Sent,
      search: "OD-000482",
    });

    expect(p.get("tab")).toBe("1");
    expect(p.get("branchId")).toBe("1");
    expect(p.get("barberId")).toBe("4");
    expect(p.get("type")).toBe("1");
    expect(p.get("dateFrom")).toBe("2026-11-12");
    expect(p.get("dateTo")).toBe("2026-11-13");
    expect(p.get("refundStatus")).toBe("1");
    expect(p.get("search")).toBe("OD-000482");
  });

  it("repeats statuses: ?statuses=1&statuses=4", () => {
    const p = buildBookingsParams({
      pageNumber: 1,
      pageSize: 20,
      statuses: [BookingStatus.Confirmed, BookingStatus.Completed],
    });

    expect(p.getAll("statuses")).toEqual(["1", "4"]);
    expect(p.toString()).toContain("statuses=1&statuses=4");
  });

  it("sends a repeated status once", () => {
    const p = buildBookingsParams({
      pageNumber: 1,
      pageSize: 20,
      statuses: [BookingStatus.Confirmed, BookingStatus.Confirmed],
    });

    expect(p.getAll("statuses")).toEqual(["1"]);
  });

  it("sends zero-valued filters: tab=0 (All), type=0 (Regular), refundStatus=0 (Waiting), status 0", () => {
    const p = buildBookingsParams({
      pageNumber: 1,
      pageSize: 20,
      tab: BookingTab.All,
      type: BookingType.Regular,
      refundStatus: RefundStatus.Waiting,
      statuses: [BookingStatus.PendingReview],
    });

    expect(p.get("tab")).toBe("0");
    expect(p.get("type")).toBe("0");
    expect(p.get("refundStatus")).toBe("0");
    expect(p.getAll("statuses")).toEqual(["0"]);
  });

  it("omits unset filters, an empty status list, empty dates and a blank search", () => {
    const p = buildBookingsParams({
      pageNumber: 1,
      pageSize: 20,
      statuses: [],
      dateFrom: "",
      dateTo: "",
      search: "   ",
    });

    expect(p.keys().sort()).toEqual(["pageNumber", "pageSize"]);
  });

  it("trims the search", () => {
    expect(
      buildBookingsParams({ pageNumber: 1, pageSize: 20, search: "  #482 " }).get("search"),
    ).toBe("#482");
  });

  it("sends customerId when it is set, and omits it otherwise", () => {
    expect(
      buildBookingsParams({ pageNumber: 1, pageSize: 20, customerId: 1203 }).get("customerId"),
    ).toBe("1203");
    expect(buildBookingsParams({ pageNumber: 1, pageSize: 20 }).has("customerId")).toBe(false);
  });
});
