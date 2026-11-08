import { describe, expect, it } from "vitest";
import { buildPackagesParams } from "./package-query";

describe("buildPackagesParams", () => {
  it("always sends branchId and paging with the contract camelCase names", () => {
    const p = buildPackagesParams({ branchId: 1, pageNumber: 2, pageSize: 20 });
    expect(p.get("branchId")).toBe("1");
    expect(p.get("pageNumber")).toBe("2");
    expect(p.get("pageSize")).toBe("20");
    expect(p.has("BranchId")).toBe(false);
  });

  it("omits every filter that is not set", () => {
    const p = buildPackagesParams({ branchId: 1, pageNumber: 1, pageSize: 20 });
    ["search", "isActive"].forEach((k) => expect(p.has(k)).toBe(false));
  });

  it('sends isActive=false — false is a real filter, not "unset"', () => {
    expect(
      buildPackagesParams({ branchId: 1, pageNumber: 1, pageSize: 20, isActive: false }).get(
        "isActive",
      ),
    ).toBe("false");
    expect(
      buildPackagesParams({ branchId: 1, pageNumber: 1, pageSize: 20, isActive: true }).get(
        "isActive",
      ),
    ).toBe("true");
  });

  it("sends the search term and drops an empty one", () => {
    expect(
      buildPackagesParams({ branchId: 1, pageNumber: 1, pageSize: 20, search: "groom" }).get(
        "search",
      ),
    ).toBe("groom");
    expect(
      buildPackagesParams({ branchId: 1, pageNumber: 1, pageSize: 20, search: "" }).has("search"),
    ).toBe(false);
  });
});
