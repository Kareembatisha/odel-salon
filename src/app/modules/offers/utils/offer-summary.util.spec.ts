import { describe, expect, it } from "vitest";
import { PaginationMeta } from "@shared/model/api_response.model";
import { readOffersSummary, tabCount } from "./offer-summary.util";

const meta = (additionalData: unknown): PaginationMeta =>
  ({
    currentPage: 1,
    pageSize: 12,
    totalPages: 1,
    totalCount: 0,
    hasPreviousPage: false,
    hasNextPage: false,
    additionalData,
  }) as PaginationMeta;

describe("readOffersSummary", () => {
  it("reads the four tab counts", () => {
    expect(readOffersSummary(meta({ all: 5, active: 3, scheduled: 1, endedOrFull: 1 }))).toEqual({
      all: 5,
      active: 3,
      scheduled: 1,
      endedOrFull: 1,
    });
  });

  it("is zero without meta or additionalData", () => {
    const zero = { all: 0, active: 0, scheduled: 0, endedOrFull: 0 };
    expect(readOffersSummary(null)).toEqual(zero);
    expect(readOffersSummary(undefined)).toEqual(zero);
    expect(readOffersSummary(meta(undefined))).toEqual(zero);
  });

  it("turns missing, non-numeric and non-finite values into 0", () => {
    expect(readOffersSummary(meta({ all: "5", active: NaN, scheduled: Infinity }))).toEqual({
      all: 0,
      active: 0,
      scheduled: 0,
      endedOrFull: 0,
    });
  });

  it("picks the count that belongs to a tab", () => {
    const s = { all: 5, active: 3, scheduled: 1, endedOrFull: 1 };
    expect(tabCount(s, "all")).toBe(5);
    expect(tabCount(s, "active")).toBe(3);
    expect(tabCount(s, "endedOrFull")).toBe(1);
  });
});
