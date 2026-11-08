import { describe, expect, it } from "vitest";
import { buildUsersParams } from "./user-query";

describe("buildUsersParams", () => {
  it("always sends paging", () => {
    const p = buildUsersParams({ pageNumber: 2, pageSize: 10 });
    expect(p.get("PageNumber")).toBe("2");
    expect(p.get("PageSize")).toBe("10");
    expect(p.has("RoleId")).toBe(false);
    expect(p.has("Status")).toBe(false);
    expect(p.has("Search")).toBe(false);
  });

  it('sends Status=false for the "inactive" filter', () => {
    expect(buildUsersParams({ pageNumber: 1, pageSize: 10, status: false }).get("Status")).toBe(
      "false",
    );
    expect(buildUsersParams({ pageNumber: 1, pageSize: 10, status: true }).get("Status")).toBe(
      "true",
    );
  });

  it("sends role and search when set", () => {
    const p = buildUsersParams({ pageNumber: 1, pageSize: 10, roleId: 3, search: "subhe" });
    expect(p.get("RoleId")).toBe("3");
    expect(p.get("Search")).toBe("subhe");
  });
});
