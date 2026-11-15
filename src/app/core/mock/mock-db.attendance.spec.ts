import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";

import { cairoToday } from "../../modules/offers/utils/offer-dates.util";
import { MOCK_MANAGER_PERMISSIONS, MockDb } from "./mock-db";

describe("MockDb attendance seed", () => {
  const db = () => TestBed.inject(MockDb);
  const firstActiveBarber = () => db().barbers.find((b) => b.isActive)!;

  it("starts the first active barber present today, so the lock shows right away", () => {
    expect(db().barberAttendance[firstActiveBarber().id]).toEqual({
      date: cairoToday(),
      isPresent: true,
    });
  });

  it("gives that barber upcoming bookings (they are the ones that lock the switch)", () => {
    expect(db().upcomingBookingsCount(firstActiveBarber().id)).toBeGreaterThan(0);
  });

  it("marks only that one barber present; everybody else starts absent", () => {
    expect(Object.values(db().barberAttendance)).toHaveLength(1);
  });

  it("leaves a barber of the first branch free of upcoming bookings (to toggle freely)", () => {
    const firstBranchId = Math.min(...db().branches.map((b) => b.id));
    const free = db().barbers.filter(
      (b) => b.branchId === firstBranchId && b.isActive && db().upcomingBookingsCount(b.id) === 0,
    );

    expect(free.length).toBeGreaterThan(0);
  });

  it("gives the branch manager role the attendance permission", () => {
    expect(MOCK_MANAGER_PERMISSIONS).toContain("Barber.Attendance");
  });
});
