import { describe, expect, it } from "vitest";

import {
  addMinutesToStartAt,
  bookingDay,
  cairoNow,
  cairoStartAt,
  formatBookingDate,
  formatBookingDateLong,
  formatBookingTime,
  isBookingStarted,
  parseStartAt,
} from "./booking-dates.util";

// Narrow no-break spaces in newer ICU output are normalised so the assertions read naturally.
const plain = (s: string) => s.replace(/\s/g, " ");

describe("cairoNow", () => {
  it("writes the Cairo wall clock, winter time (UTC+2)", () => {
    expect(cairoNow(new Date("2026-11-12T22:30:15Z"))).toBe("2026-11-13T00:30:15");
  });

  it("writes the Cairo wall clock, summer time (UTC+3)", () => {
    expect(cairoNow(new Date("2026-07-01T10:00:00Z"))).toBe("2026-07-01T13:00:00");
  });

  it("never writes hour 24 at midnight", () => {
    expect(cairoNow(new Date("2026-11-12T22:00:00Z"))).toBe("2026-11-13T00:00:00");
  });
});

describe("parseStartAt", () => {
  it("splits a Cairo wall-clock string", () => {
    expect(parseStartAt("2026-11-13T19:00:00")).toEqual({
      date: "2026-11-13",
      hour: 19,
      minute: 0,
    });
  });

  it("accepts a missing or fractional seconds part", () => {
    expect(parseStartAt("2026-11-13T09:05")).toEqual({ date: "2026-11-13", hour: 9, minute: 5 });
    expect(parseStartAt("2026-11-13T09:05:30.250")).toEqual({
      date: "2026-11-13",
      hour: 9,
      minute: 5,
    });
  });

  it.each([
    "",
    "soon",
    "2026-11-13",
    "2026-02-30T10:00:00",
    "2026-11-13T24:00:00",
    "2026-11-13T10:60:00",
  ])("rejects %j", (value) => {
    expect(parseStartAt(value)).toBeNull();
  });
});

describe("formatBookingDate / formatBookingTime", () => {
  it("formats in English", () => {
    expect(formatBookingDate("2026-11-13T19:00:00", "en")).toBe("Nov 13, 2026");
    expect(plain(formatBookingTime("2026-11-13T19:00:00", "en"))).toBe("7:00 PM");
    expect(plain(formatBookingTime("2026-11-13T00:05:00", "en"))).toBe("12:05 AM");
    expect(plain(formatBookingTime("2026-11-13T12:00:00", "en"))).toBe("12:00 PM");
  });

  it("formats in Arabic (Arabic month, Arabic-Indic digits)", () => {
    expect(formatBookingDate("2026-11-13T19:00:00", "ar")).toContain("نوفمبر");
    expect(formatBookingDate("2026-11-13T19:00:00", "ar")).toContain("١٣");
    expect(formatBookingTime("2026-11-13T19:00:00", "ar")).toContain("٧:٠٠");
  });

  it("is not moved by the browser time zone: the day and hour are exactly what the server sent", () => {
    expect(formatBookingDate("2026-01-01T00:30:00", "en")).toBe("Jan 1, 2026");
    expect(formatBookingDate("2026-12-31T23:30:00", "en")).toBe("Dec 31, 2026");
    expect(plain(formatBookingTime("2026-12-31T23:30:00", "en"))).toBe("11:30 PM");
  });

  it("returns an unreadable value unchanged", () => {
    expect(formatBookingDate("soon", "en")).toBe("soon");
    expect(formatBookingTime("soon", "ar")).toBe("soon");
  });
});

describe("bookingDay", () => {
  it("is the calendar day of the start", () => {
    expect(bookingDay("2026-11-13T23:59:00")).toBe("2026-11-13");
    expect(bookingDay("nope")).toBeNull();
  });
});

describe("isBookingStarted", () => {
  const now = new Date("2026-11-13T17:00:00Z"); // Cairo: 19:00 (UTC+2)

  it("is false before the start time and true from the start on", () => {
    expect(isBookingStarted("2026-11-13T19:01:00", now)).toBe(false);
    expect(isBookingStarted("2026-11-13T19:00:00", now)).toBe(true);
    expect(isBookingStarted("2026-11-13T18:59:00", now)).toBe(true);
  });

  it("works across days", () => {
    expect(isBookingStarted("2026-11-14T00:00:00", now)).toBe(false);
    expect(isBookingStarted("2026-11-12T23:59:00", now)).toBe(true);
  });

  it("is false for an unreadable start (never offers 'End session' on garbage)", () => {
    expect(isBookingStarted("soon", now)).toBe(false);
  });
});

describe("cairoStartAt", () => {
  const now = new Date("2026-11-13T17:00:00Z"); // Cairo 19:00:00

  it("moves the Cairo clock by minutes and drops the seconds", () => {
    expect(cairoStartAt(0, now)).toBe("2026-11-13T19:00:00");
    expect(cairoStartAt(90, now)).toBe("2026-11-13T20:30:00");
    expect(cairoStartAt(-45, now)).toBe("2026-11-13T18:15:00");
  });

  it("crosses midnight", () => {
    expect(cairoStartAt(300, now)).toBe("2026-11-14T00:00:00");
  });
});

describe("addMinutesToStartAt", () => {
  it("adds the services' duration to get the end of the booking", () => {
    expect(addMinutesToStartAt("2026-11-13T19:00:00", 50)).toBe("2026-11-13T19:50:00");
    expect(addMinutesToStartAt("2026-11-13T19:45:00", 30)).toBe("2026-11-13T20:15:00");
  });

  it("crosses midnight, month and year ends", () => {
    expect(addMinutesToStartAt("2026-11-13T23:30:00", 60)).toBe("2026-11-14T00:30:00");
    expect(addMinutesToStartAt("2026-11-30T23:30:00", 60)).toBe("2026-12-01T00:30:00");
    expect(addMinutesToStartAt("2026-12-31T23:30:00", 60)).toBe("2027-01-01T00:30:00");
  });

  it("moves backwards with a negative amount and drops the seconds", () => {
    expect(addMinutesToStartAt("2026-11-13T00:10:30", -20)).toBe("2026-11-12T23:50:00");
  });

  it("is null for an unreadable start", () => {
    expect(addMinutesToStartAt("soon", 10)).toBeNull();
  });
});

describe("formatBookingDateLong", () => {
  it("writes the weekday and the full date in English", () => {
    expect(formatBookingDateLong("2026-11-13T19:00:00", "en")).toBe("Friday, November 13, 2026");
  });

  it("writes it in Arabic", () => {
    const text = formatBookingDateLong("2026-11-13T19:00:00", "ar");
    expect(text).toContain("الجمعة");
    expect(text).toContain("نوفمبر");
    expect(text).toContain("١٣");
  });

  it("is not moved by the browser time zone", () => {
    expect(formatBookingDateLong("2026-01-01T00:30:00", "en")).toBe("Thursday, January 1, 2026");
    expect(formatBookingDateLong("2026-12-31T23:30:00", "en")).toBe("Thursday, December 31, 2026");
  });

  it("returns an unreadable value unchanged", () => {
    expect(formatBookingDateLong("soon", "en")).toBe("soon");
  });
});
