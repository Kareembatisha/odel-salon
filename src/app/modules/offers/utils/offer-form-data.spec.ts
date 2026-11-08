import { describe, expect, it } from "vitest";
import { buildCreateOfferFormData, buildUpdateOfferFormData } from "./offer-form-data";

const fields = {
  nameAr: " [AR] Weekend ",
  nameEn: " Weekend Offer ",
  serviceIds: [1, 2, 5],
  regularPrice: 250,
  vipPrice: 380.5,
  homePrice: null,
  startDate: "2026-11-07",
  endDate: "2026-11-30",
  maxBookings: 50,
};
const create = { branchId: 3, ...fields };
const banner = () => new File(["x"], "banner.jpg", { type: "image/jpeg" });

describe("buildCreateOfferFormData", () => {
  it("uses the PascalCase field names the API binds and trims names", () => {
    const body = buildCreateOfferFormData(create);
    expect(body.get("BranchId")).toBe("3");
    expect(body.get("NameAr")).toBe("[AR] Weekend");
    expect(body.get("NameEn")).toBe("Weekend Offer");
    expect(body.get("RegularPrice")).toBe("250");
    expect(body.get("VipPrice")).toBe("380.5");
    expect(body.get("StartDate")).toBe("2026-11-07");
    expect(body.get("EndDate")).toBe("2026-11-30");
    expect(body.get("MaxBookings")).toBe("50");
  });

  it("sends serviceIds as a repeated field", () => {
    expect(buildCreateOfferFormData(create).getAll("ServiceIds")).toEqual(["1", "2", "5"]);
  });

  it("leaves homePrice, endDate and maxBookings EMPTY for null (the contract's way of saying null)", () => {
    const body = buildCreateOfferFormData({
      ...create,
      homePrice: null,
      endDate: null,
      maxBookings: null,
    });
    expect(body.get("HomePrice")).toBe("");
    expect(body.get("EndDate")).toBe("");
    expect(body.get("MaxBookings")).toBe("");
  });

  it("sends a home price when there is one", () => {
    expect(buildCreateOfferFormData({ ...create, homePrice: 620 }).get("HomePrice")).toBe("620");
  });

  it("sends no Image or RemoveImage without a banner, and the file with one", () => {
    const none = buildCreateOfferFormData({ ...create, image: null });
    expect(none.has("Image")).toBe(false);
    expect(none.has("RemoveImage")).toBe(false);
    expect(
      (buildCreateOfferFormData({ ...create, image: banner() }).get("Image") as File).name,
    ).toBe("banner.jpg");
  });
});

describe("buildUpdateOfferFormData", () => {
  const update = { ...fields, removeImage: false };

  it("has no BranchId (the branch can't change)", () => {
    expect(buildUpdateOfferFormData(update).has("BranchId")).toBe(false);
  });

  it("keeps the banner: no Image and RemoveImage=false", () => {
    const body = buildUpdateOfferFormData(update);
    expect(body.has("Image")).toBe(false);
    expect(body.get("RemoveImage")).toBe("false");
  });

  it("replaces the banner: Image present and RemoveImage=false", () => {
    const body = buildUpdateOfferFormData({ ...update, image: banner() });
    expect((body.get("Image") as File).name).toBe("banner.jpg");
    expect(body.get("RemoveImage")).toBe("false");
  });

  it("removes the banner: RemoveImage=true and no Image", () => {
    const body = buildUpdateOfferFormData({ ...update, removeImage: true });
    expect(body.has("Image")).toBe(false);
    expect(body.get("RemoveImage")).toBe("true");
  });

  it("a chosen image wins over removeImage", () => {
    const body = buildUpdateOfferFormData({ ...update, removeImage: true, image: banner() });
    expect(body.has("Image")).toBe(true);
    expect(body.get("RemoveImage")).toBe("false");
  });
});
