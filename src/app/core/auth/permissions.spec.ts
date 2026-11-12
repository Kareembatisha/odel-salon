import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, PERMISSIONS, PERMISSION_MODULES } from "./permissions";

describe("permission catalog", () => {
  it("builds Resource.Action strings", () => {
    expect(PERMISSIONS.Branch.Create).toBe("Branch.Create");
    expect(PERMISSIONS.User.View).toBe("User.View");
  });

  it("lists every permission exactly once", () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    expect(ALL_PERMISSIONS).toContain("Report.Export");
  });

  it("has the Barber.Attendance permission used by the attendance sheet", () => {
    expect(PERMISSIONS.Barber.Attendance).toBe("Barber.Attendance");
    expect(ALL_PERMISSIONS).toContain("Barber.Attendance");
  });

  it("shows Attendance as an action of the Barber module in the role permission matrix", () => {
    const barber = PERMISSION_MODULES.find((m) => m.module === "Barber");
    expect(barber?.actions).toContain("Attendance");
  });
});
