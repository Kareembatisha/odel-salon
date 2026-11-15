import { describe, expect, it } from "vitest";

import { PaginationMeta } from "@shared/model/api_response.model";
import { readBookingCounters, readPaymentReviewCounters } from "./booking-counters.util";

const meta = (additionalData: Record<string, unknown> | null | undefined): PaginationMeta => ({
  currentPage: 1,
  pageSize: 20,
  totalPages: 1,
  totalCount: 0,
  hasPreviousPage: false,
  hasNextPage: false,
  additionalData,
});

describe("readBookingCounters", () => {
  it("reads the Today and Waiting badges", () => {
    expect(readBookingCounters(meta({ todayCount: 42, refundWaitingCount: 3 }))).toEqual({
      todayCount: 42,
      refundWaitingCount: 3,
    });
  });

  it("counts a missing meta, missing data or a missing key as 0", () => {
    const zero = { todayCount: 0, refundWaitingCount: 0 };
    expect(readBookingCounters(null)).toEqual(zero);
    expect(readBookingCounters(undefined)).toEqual(zero);
    expect(readBookingCounters(meta(null))).toEqual(zero);
    expect(readBookingCounters(meta({ todayCount: 5 }))).toEqual({ ...zero, todayCount: 5 });
  });

  it("never lets a non-number reach a badge", () => {
    expect(readBookingCounters(meta({ todayCount: "42", refundWaitingCount: Number.NaN }))).toEqual(
      { todayCount: 0, refundWaitingCount: 0 },
    );
  });
});

describe("readPaymentReviewCounters", () => {
  it("reads the tab badges and the review target", () => {
    expect(
      readPaymentReviewCounters(
        meta({
          toReviewCount: 5,
          approvedTodayCount: 2,
          rejectedTodayCount: 1,
          reviewTargetMinutes: 30,
        }),
      ),
    ).toEqual({
      toReviewCount: 5,
      approvedTodayCount: 2,
      rejectedTodayCount: 1,
      reviewTargetMinutes: 30,
    });
  });

  it("falls back to 0 — reviewTargetMinutes 0 means 'hide the label'", () => {
    expect(readPaymentReviewCounters(null)).toEqual({
      toReviewCount: 0,
      approvedTodayCount: 0,
      rejectedTodayCount: 0,
      reviewTargetMinutes: 0,
    });
  });
});
