import { FormBuilder } from "@angular/forms";
import { describe, expect, it } from "vitest";

import { BranchDayOfWeek, BranchDetails } from "../model/branch.model";
import { createBranchForm } from "./branch-form.factory";
import {
  BranchFormValue,
  applyBranchToForm,
  buildBranchPayload,
  toApiTime,
  toFormTime,
} from "./branch-form.mapper";

const fb = new FormBuilder();

function value(over: Partial<BranchFormValue> = {}): BranchFormValue {
  return {
    basicInfo: {
      nameAr: "  فرع  ",
      nameEn: "  Branch  ",
      address: "  1 Main St ",
      phone: " +201001102194 ",
      mapUrl: "  https://maps.example/x  ",
    },
    bookingTypes: { allowsRegular: true, allowsVip: false, allowsHome: true },
    workingHours: [
      { dayOfWeek: BranchDayOfWeek.Saturday, isOpen: true, openTime: "09:00", closeTime: "23:00" },
      { dayOfWeek: BranchDayOfWeek.Friday, isOpen: false, openTime: null, closeTime: null },
    ],
    ...over,
  };
}

const DETAILS: BranchDetails = {
  id: 5,
  nameAr: "الزمالك",
  nameEn: "Zamalek",
  address: "8 Hassan Sabry St",
  mapUrl: "https://maps.example/z",
  phone: "+201020304050",
  allowsRegular: true,
  allowsVip: true,
  allowsHome: false,
  isVisible: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: null,
  workingHours: [
    // deliberately not in form order
    { dayOfWeek: BranchDayOfWeek.Friday, isOpen: false, openTime: null, closeTime: null },
    {
      dayOfWeek: BranchDayOfWeek.Saturday,
      isOpen: true,
      openTime: "10:00:00",
      closeTime: "22:30:00",
    },
  ],
};

describe("time conversion", () => {
  it("toApiTime appends seconds", () => {
    expect(toApiTime("09:00")).toBe("09:00:00");
    expect(toApiTime("09:00:30")).toBe("09:00:00");
    expect(toApiTime(null)).toBeNull();
    expect(toApiTime("")).toBeNull();
  });

  it("toFormTime drops seconds", () => {
    expect(toFormTime("10:00:00")).toBe("10:00");
    expect(toFormTime("10:00")).toBe("10:00");
    expect(toFormTime(null)).toBeNull();
  });
});

describe("buildBranchPayload", () => {
  it("trims text fields and keeps the booking flags", () => {
    const p = buildBranchPayload(value());

    expect(p).toMatchObject({
      nameAr: "فرع",
      nameEn: "Branch",
      address: "1 Main St",
      phone: "+201001102194",
      mapUrl: "https://maps.example/x",
      allowsRegular: true,
      allowsVip: false,
      allowsHome: true,
    });
  });

  it("sends a blank map link as null", () => {
    const v = value();
    v.basicInfo.mapUrl = "   ";

    expect(buildBranchPayload(v).mapUrl).toBeNull();
  });

  it("formats open days as HH:mm:ss and sends null times for closed days", () => {
    expect(buildBranchPayload(value()).workingHours).toEqual([
      {
        dayOfWeek: BranchDayOfWeek.Saturday,
        isOpen: true,
        openTime: "09:00:00",
        closeTime: "23:00:00",
      },
      { dayOfWeek: BranchDayOfWeek.Friday, isOpen: false, openTime: null, closeTime: null },
    ]);
  });

  it("drops stale times on a closed day", () => {
    const v = value({
      workingHours: [
        { dayOfWeek: BranchDayOfWeek.Monday, isOpen: false, openTime: "09:00", closeTime: "17:00" },
      ],
    });

    expect(buildBranchPayload(v).workingHours[0]).toMatchObject({
      openTime: null,
      closeTime: null,
    });
  });

  it("never includes visibility — it has its own endpoint", () => {
    expect(buildBranchPayload(value())).not.toHaveProperty("isVisible");
  });
});

describe("applyBranchToForm", () => {
  it("fills basic info and booking types, turning a null map link into an empty field", () => {
    const form = createBranchForm(fb);

    applyBranchToForm(form, { ...DETAILS, mapUrl: null });

    expect(form.getRawValue().basicInfo).toEqual({
      nameAr: "الزمالك",
      nameEn: "Zamalek",
      address: "8 Hassan Sabry St",
      phone: "+201020304050",
      mapUrl: "",
    });
    expect(form.getRawValue().bookingTypes).toEqual({
      allowsRegular: true,
      allowsVip: true,
      allowsHome: false,
    });
  });

  it("matches working days by dayOfWeek, not by position, and trims seconds", () => {
    const form = createBranchForm(fb);

    applyBranchToForm(form, DETAILS);

    const days = form.getRawValue().workingHours as BranchFormValue["workingHours"];
    expect(days.find((d) => d.dayOfWeek === BranchDayOfWeek.Saturday)).toEqual({
      dayOfWeek: BranchDayOfWeek.Saturday,
      isOpen: true,
      openTime: "10:00",
      closeTime: "22:30",
    });
    expect(days.find((d) => d.dayOfWeek === BranchDayOfWeek.Friday)?.isOpen).toBe(false);
    // days the API did not send stay closed
    expect(days.find((d) => d.dayOfWeek === BranchDayOfWeek.Monday)?.isOpen).toBe(false);
  });

  it("leaves the form valid and pristine", () => {
    const form = createBranchForm(fb);

    applyBranchToForm(form, DETAILS);

    expect(form.valid).toBe(true);
    expect(form.pristine).toBe(true);
  });

  it("round-trips: loading a branch and rebuilding the payload gives the same data back", () => {
    const form = createBranchForm(fb);
    applyBranchToForm(form, DETAILS);

    const payload = buildBranchPayload(form.getRawValue() as BranchFormValue);

    expect(payload).toMatchObject({
      nameEn: "Zamalek",
      mapUrl: "https://maps.example/z",
      allowsVip: true,
    });
    expect(payload.workingHours.find((d) => d.dayOfWeek === BranchDayOfWeek.Saturday)).toEqual({
      dayOfWeek: BranchDayOfWeek.Saturday,
      isOpen: true,
      openTime: "10:00:00",
      closeTime: "22:30:00",
    });
  });
});
