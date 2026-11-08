import { describe, expect, it } from "vitest";
import { buildCreateBarberFormData, buildUpdateBarberFormData } from "./barber-form-data";

const base = { branchId: 3, fullName: " Karim Mostafa ", phone: " +201001234567 " };
const photo = () => new File(["x"], "karim.jpg", { type: "image/jpeg" });

describe("buildCreateBarberFormData", () => {
  it("uses the PascalCase field names the API binds and trims text", () => {
    const body = buildCreateBarberFormData(base);
    expect(body.get("BranchId")).toBe("3");
    expect(body.get("FullName")).toBe("Karim Mostafa");
    expect(body.get("Phone")).toBe("+201001234567");
  });

  it("does not send Image or RemoveImage when there is no photo", () => {
    const body = buildCreateBarberFormData(base);
    expect(body.has("Image")).toBe(false);
    expect(body.has("RemoveImage")).toBe(false);
    expect(buildCreateBarberFormData({ ...base, image: null }).has("Image")).toBe(false);
  });

  it("appends the image when a file is chosen", () => {
    const body = buildCreateBarberFormData({ ...base, image: photo() });
    expect((body.get("Image") as File).name).toBe("karim.jpg");
  });
});

describe("buildUpdateBarberFormData", () => {
  it("keeps the current photo: no Image and RemoveImage=false", () => {
    const body = buildUpdateBarberFormData({ ...base, removeImage: false });
    expect(body.has("Image")).toBe(false);
    expect(body.get("RemoveImage")).toBe("false");
  });

  it("replaces the photo: Image present and RemoveImage=false", () => {
    const body = buildUpdateBarberFormData({ ...base, image: photo(), removeImage: false });
    expect((body.get("Image") as File).name).toBe("karim.jpg");
    expect(body.get("RemoveImage")).toBe("false");
  });

  it("removes the photo: RemoveImage=true and no Image", () => {
    const body = buildUpdateBarberFormData({ ...base, removeImage: true });
    expect(body.has("Image")).toBe(false);
    expect(body.get("RemoveImage")).toBe("true");
  });

  it("never sends RemoveImage=true together with a new image (the image wins)", () => {
    const body = buildUpdateBarberFormData({ ...base, image: photo(), removeImage: true });
    expect(body.has("Image")).toBe(true);
    expect(body.get("RemoveImage")).toBe("false");
  });

  it("carries the (possibly new) branch for a transfer", () => {
    expect(
      buildUpdateBarberFormData({ ...base, branchId: 5, removeImage: false }).get("BranchId"),
    ).toBe("5");
  });
});
