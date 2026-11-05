import { describe, expect, it } from "vitest";
import { applyPercentage, exceedsMaxPrice, isValidDuration, isValidPercentage, isValidPrice } from "./service-price.util";

describe("service price utils", () => {
  it("rounds to the nearest pound and never goes below 1", () => {
    expect(applyPercentage(120, 10)).toBe(132);
    expect(applyPercentage(10, 15)).toBe(12);
    expect(applyPercentage(2, -90)).toBe(1);
  });

  it("flags results above 100,000", () => {
    expect(exceedsMaxPrice(50_000, 100)).toBe(false);
    expect(exceedsMaxPrice(50_001, 100)).toBe(true);
  });

  it("validates duration, price and percentage by the contract rules", () => {
    expect(isValidDuration(30)).toBe(true);
    expect(isValidDuration(32)).toBe(false);
    expect(isValidDuration(485)).toBe(false);
    expect(isValidPrice(99.5)).toBe(true);
    expect(isValidPrice(99.555)).toBe(false);
    expect(isValidPrice(0)).toBe(false);
    expect(isValidPercentage(0)).toBe(false);
    expect(isValidPercentage(-91)).toBe(false);
    expect(isValidPercentage(500)).toBe(true);
  });
});
