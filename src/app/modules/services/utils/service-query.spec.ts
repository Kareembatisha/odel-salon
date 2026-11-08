import { describe, expect, it } from "vitest";
import { buildServicesParams } from "./service-query";

describe("buildServicesParams", () => {
  it("always sends branchId and paging with the contract camelCase names", () => {
    const p = buildServicesParams({ branchId: 3, pageNumber: 2, pageSize: 20 });
    expect(p.get("branchId")).toBe("3");
    expect(p.get("pageNumber")).toBe("2");
    expect(p.get("pageSize")).toBe("20");
  });

  it("omits unset filters", () => {
    const p = buildServicesParams({ branchId: 1, pageNumber: 1, pageSize: 20 });
    ["search", "isActive", "isHomeAvailable"].forEach((k) => expect(p.has(k)).toBe(false));
  });

  it("sends false filters (false is a real filter) and ignores null", () => {
    const p = buildServicesParams({
      branchId: 1,
      pageNumber: 1,
      pageSize: 20,
      isActive: false,
      isHomeAvailable: false,
    });
    expect(p.get("isActive")).toBe("false");
    expect(p.get("isHomeAvailable")).toBe("false");
    const q = buildServicesParams({
      branchId: 1,
      pageNumber: 1,
      pageSize: 20,
      isHomeAvailable: null as unknown as undefined,
    });
    expect(q.has("isHomeAvailable")).toBe(false);
  });
});
