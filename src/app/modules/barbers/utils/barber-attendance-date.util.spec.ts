import { describe, expect, it } from "vitest";

import { formatAttendanceDate } from "./barber-attendance-date.util";

describe("formatAttendanceDate", () => {
  it("writes the weekday and the full date in English", () => {
    expect(formatAttendanceDate("2026-11-12", "en")).toBe("Thursday, November 12, 2026");
  });

  it("writes the date in Arabic (weekday and month names in Arabic)", () => {
    const text = formatAttendanceDate("2026-11-12", "ar");
    expect(text).toContain("الخميس");
    expect(text).toContain("نوفمبر");
  });

  it("never shifts the day with the browser time zone (month and year edges)", () => {
    expect(formatAttendanceDate("2026-01-01", "en")).toBe("Thursday, January 1, 2026");
    expect(formatAttendanceDate("2026-12-31", "en")).toBe("Thursday, December 31, 2026");
  });

  it("returns an unreadable value unchanged", () => {
    expect(formatAttendanceDate("2026-02-30", "en")).toBe("2026-02-30");
    expect(formatAttendanceDate("soon", "en")).toBe("soon");
  });
});
