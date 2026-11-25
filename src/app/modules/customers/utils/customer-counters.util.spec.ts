import { describe, expect, it } from "vitest";

import { PaginationMeta } from "@shared/model/api_response.model";
import { readCustomerCounters } from "./customer-counters.util";

const meta = (additionalData: PaginationMeta["additionalData"]): PaginationMeta => ({
  currentPage: 1,
  pageSize: 20,
  totalPages: 1,
  totalCount: 0,
  hasPreviousPage: false,
  hasNextPage: false,
  additionalData,
});

describe("readCustomerCounters", () => {
  it("reads the count of every tab", () => {
    expect(
      readCustomerCounters(
        meta({
          allCount: 1240,
          visitedThisMonthCount: 312,
          hasMissedBookingsCount: 47,
          notBackIn60DaysCount: 158,
        }),
      ),
    ).toEqual({
      allCount: 1240,
      visitedThisMonthCount: 312,
      hasMissedBookingsCount: 47,
      notBackIn60DaysCount: 158,
    });
  });

  it("counts a missing, non-numeric or non-finite value as 0", () => {
    expect(
      readCustomerCounters(
        meta({ allCount: "12", visitedThisMonthCount: NaN, hasMissedBookingsCount: null }),
      ),
    ).toEqual({
      allCount: 0,
      visitedThisMonthCount: 0,
      hasMissedBookingsCount: 0,
      notBackIn60DaysCount: 0,
    });
  });

  it("copes with no meta or no additionalData", () => {
    const zeros = {
      allCount: 0,
      visitedThisMonthCount: 0,
      hasMissedBookingsCount: 0,
      notBackIn60DaysCount: 0,
    };

    expect(readCustomerCounters(null)).toEqual(zeros);
    expect(readCustomerCounters(meta(null))).toEqual(zeros);
  });
});
