import { describe, expect, it } from "vitest";
import { PaginationMeta } from "@shared/model/api_response.model";
import { readPackagesSummary } from "./package-summary.util";

const meta = (additionalData: Record<string, unknown> | null | undefined): PaginationMeta => ({
  currentPage: 1,
  pageSize: 12,
  totalPages: 1,
  totalCount: 2,
  hasPreviousPage: false,
  hasNextPage: false,
  additionalData,
});

describe("readPackagesSummary", () => {
  it("reads total and active from additionalData", () => {
    expect(readPackagesSummary(meta({ total: 5, active: 4 }))).toEqual({ total: 5, active: 4 });
  });

  it("is zeroed without a response or without additionalData", () => {
    expect(readPackagesSummary(null)).toEqual({ total: 0, active: 0 });
    expect(readPackagesSummary(meta(null))).toEqual({ total: 0, active: 0 });
  });

  it("turns missing or non-numeric fields into 0", () => {
    expect(readPackagesSummary(meta({ total: "5", active: NaN }))).toEqual({ total: 0, active: 0 });
    expect(readPackagesSummary(meta({ total: 3 }))).toEqual({ total: 3, active: 0 });
  });
});
