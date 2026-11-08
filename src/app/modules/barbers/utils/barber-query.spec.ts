import { describe, expect, it } from "vitest";
import { buildBarbersParams } from "./barber-query";

describe("buildBarbersParams", () => {
  it("always sends paging with the contract camelCase names", () => {
    const p = buildBarbersParams({ pageNumber: 2, pageSize: 10 });
    expect(p.get("pageNumber")).toBe("2");
    expect(p.get("pageSize")).toBe("10");
    expect(p.has("PageNumber")).toBe(false);
    expect(p.has("branchId")).toBe(false);
    expect(p.has("isActive")).toBe(false);
    expect(p.has("search")).toBe(false);
  });

  it('sends isActive=false for the "suspended" filter', () => {
    expect(
      buildBarbersParams({ pageNumber: 1, pageSize: 10, isActive: false }).get("isActive"),
    ).toBe("false");
    expect(
      buildBarbersParams({ pageNumber: 1, pageSize: 10, isActive: true }).get("isActive"),
    ).toBe("true");
  });

  it("sends branch and search when set, and omits an empty search", () => {
    const p = buildBarbersParams({ pageNumber: 1, pageSize: 10, branchId: 3, search: "karim" });
    expect(p.get("branchId")).toBe("3");
    expect(p.get("search")).toBe("karim");
    expect(buildBarbersParams({ pageNumber: 1, pageSize: 10, search: "" }).has("search")).toBe(
      false,
    );
  });
});
