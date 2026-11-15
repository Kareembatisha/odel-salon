import { describe, expect, it } from "vitest";

import { PaymentReviewTab } from "../model/payment-review.model";
import { buildPaymentReviewsParams } from "./payment-review-query";

describe("buildPaymentReviewsParams", () => {
  it("sends paging, tab and branch", () => {
    const p = buildPaymentReviewsParams({
      pageNumber: 1,
      pageSize: 20,
      tab: PaymentReviewTab.RejectedToday,
      branchId: 3,
    });

    expect(p.get("pageNumber")).toBe("1");
    expect(p.get("pageSize")).toBe("20");
    expect(p.get("tab")).toBe("2");
    expect(p.get("branchId")).toBe("3");
  });

  it("still sends tab=0 (ToReview) — zero is a value, not 'unset'", () => {
    const p = buildPaymentReviewsParams({
      pageNumber: 1,
      pageSize: 20,
      tab: PaymentReviewTab.ToReview,
    });

    expect(p.get("tab")).toBe("0");
  });

  it("omits an unset tab and branch", () => {
    const p = buildPaymentReviewsParams({ pageNumber: 1, pageSize: 20 });

    expect(p.keys().sort()).toEqual(["pageNumber", "pageSize"]);
  });
});
