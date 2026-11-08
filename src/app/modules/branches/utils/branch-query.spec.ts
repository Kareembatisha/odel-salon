import { describe, expect, it } from "vitest";
import { buildBranchesParams } from "./branch-query";

describe("buildBranchesParams", () => {
  it("always sends paging with the contract camelCase names", () => {
    const p = buildBranchesParams({ pageNumber: 2, pageSize: 12 });
    expect(p.get("pageNumber")).toBe("2");
    expect(p.get("pageSize")).toBe("12");
    expect(p.has("PageNumber")).toBe(false);
    expect(p.has("search")).toBe(false);
    expect(p.has("isVisible")).toBe(false);
  });

  it('sends isVisible=false for the "hidden" filter', () => {
    expect(
      buildBranchesParams({ pageNumber: 1, pageSize: 12, isVisible: false }).get("isVisible"),
    ).toBe("false");
    expect(
      buildBranchesParams({ pageNumber: 1, pageSize: 12, isVisible: true }).get("isVisible"),
    ).toBe("true");
  });

  it("sends search when set and omits it when empty", () => {
    expect(buildBranchesParams({ pageNumber: 1, pageSize: 12, search: "nasr" }).get("search")).toBe(
      "nasr",
    );
    expect(buildBranchesParams({ pageNumber: 1, pageSize: 12, search: "" }).has("search")).toBe(
      false,
    );
  });
});
