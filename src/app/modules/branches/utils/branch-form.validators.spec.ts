import { FormControl, FormGroup } from "@angular/forms";
import { describe, expect, it } from "vitest";

import {
  atLeastOneBookingTypeValidator,
  optionalUrlValidator,
  workingHourValidator,
} from "./branch-form.validators";

describe("optionalUrlValidator", () => {
  const check = (v: string | null) => optionalUrlValidator()(new FormControl(v));

  it("accepts empty, null and whitespace — the link is optional", () => {
    expect(check("")).toBeNull();
    expect(check(null)).toBeNull();
    expect(check("   ")).toBeNull();
  });

  it("accepts http and https URLs", () => {
    expect(check("https://maps.google.com/?q=cairo")).toBeNull();
    expect(check("http://example.com")).toBeNull();
    expect(check("  https://maps.app.goo.gl/abc  ")).toBeNull();
  });

  it("rejects text, other protocols and incomplete URLs", () => {
    expect(check("not a url")).toEqual({ invalidUrl: true });
    expect(check("ftp://example.com")).toEqual({ invalidUrl: true });
    expect(check("javascript:alert(1)")).toEqual({ invalidUrl: true });
    expect(check("maps.google.com")).toEqual({ invalidUrl: true });
  });
});

describe("atLeastOneBookingTypeValidator", () => {
  const check = (allowsRegular: boolean, allowsVip: boolean, allowsHome: boolean) =>
    atLeastOneBookingTypeValidator()(
      new FormGroup({
        allowsRegular: new FormControl(allowsRegular),
        allowsVip: new FormControl(allowsVip),
        allowsHome: new FormControl(allowsHome),
      }),
    );

  it("fails when nothing is selected", () => {
    expect(check(false, false, false)).toEqual({ atLeastOneRequired: true });
  });

  it("passes with any single type or with several", () => {
    expect(check(true, false, false)).toBeNull();
    expect(check(false, true, false)).toBeNull();
    expect(check(false, false, true)).toBeNull();
    expect(check(true, true, true)).toBeNull();
  });
});

describe("workingHourValidator", () => {
  const check = (isOpen: boolean, openTime: string | null, closeTime: string | null) =>
    workingHourValidator()(
      new FormGroup({
        isOpen: new FormControl(isOpen),
        openTime: new FormControl(openTime),
        closeTime: new FormControl(closeTime),
      }),
    );

  describe("closed day", () => {
    it("is valid without times", () => {
      expect(check(false, null, null)).toBeNull();
    });

    it("rejects leftover times", () => {
      expect(check(false, "10:00", null)).toEqual({ closedDayHasTimes: true });
      expect(check(false, null, "22:00")).toEqual({ closedDayHasTimes: true });
    });
  });

  describe("open day", () => {
    it("needs both times", () => {
      expect(check(true, null, null)).toEqual({ requiredTimes: true });
      expect(check(true, "10:00", null)).toEqual({ requiredTimes: true });
      expect(check(true, null, "22:00")).toEqual({ requiredTimes: true });
      expect(check(true, "", "22:00")).toEqual({ requiredTimes: true });
    });

    it("rejects values that are not a time", () => {
      expect(check(true, "25:00", "22:00")).toEqual({ invalidTime: true });
      expect(check(true, "10:00", "22:75")).toEqual({ invalidTime: true });
      expect(check(true, "abc", "22:00")).toEqual({ invalidTime: true });
    });

    it("accepts HH:mm and HH:mm:ss", () => {
      expect(check(true, "10:00", "22:00")).toBeNull();
      expect(check(true, "10:00:00", "22:00:00")).toBeNull();
    });

    it("requires at least one hour", () => {
      expect(check(true, "10:00", "10:59")).toEqual({ minimumDuration: true });
      expect(check(true, "10:00", "11:00")).toBeNull();
      expect(check(true, "10:00", "10:00")).not.toBeNull();
    });

    describe("overnight (closing time at or before opening time)", () => {
      it("allows closing up to 06:00 the next day", () => {
        expect(check(true, "18:00", "02:00")).toBeNull();
        expect(check(true, "22:00", "06:00")).toBeNull();
        expect(check(true, "00:00", "00:00")).toBeNull(); // 24 hours
      });

      it("rejects closing after 06:00 the next day", () => {
        expect(check(true, "22:00", "06:01")).toEqual({ invalidOvernightClose: true });
        expect(check(true, "22:00", "09:00")).toEqual({ invalidOvernightClose: true });
      });

      it("still enforces one hour across midnight", () => {
        expect(check(true, "23:30", "00:10")).toEqual({ minimumDuration: true });
        expect(check(true, "23:00", "00:00")).toBeNull();
      });
    });
  });
});
