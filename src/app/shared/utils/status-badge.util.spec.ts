import { describe, expect, it } from "vitest";
import { activeBadgeVariant, bookingBadgeVariant } from "./status-badge.util";

describe("status badge mapping", () => {
  it("maps active flags", () => {
    expect(activeBadgeVariant(true)).toBe("success");
    expect(activeBadgeVariant(false)).toBe("neutral");
  });
  it("maps booking lifecycle states", () => {
    expect(bookingBadgeVariant("pending")).toBe("warning");
    expect(bookingBadgeVariant("no-show")).toBe("danger");
  });
});
