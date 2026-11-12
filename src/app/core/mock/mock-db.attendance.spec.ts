import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";

import { cairoToday } from "../../modules/offers/utils/offer-dates.util";
import { MOCK_MANAGER_PERMISSIONS, MockDb } from "./mock-db";

describe("MockDb attendance seed", () => {
  const db = () => TestBed.inject(MockDb);

  it("starts the barber with the most bookings present today, so the lock shows right away", () => {
    const [id] = Object.entries(db().barberUpcomingBookings)
      .sort(([, a], [, b]) => b - a)
      .map(([barberId]) => Number(barberId));

    expect(db().barberUpcomingBookings[id]).toBe(3);
    expect(db().barberAttendance[id]).toEqual({ date: cairoToday(), isPresent: true });
  });

  it("marks only that one barber present; everybody else starts absent", () => {
    expect(Object.values(db().barberAttendance)).toHaveLength(1);
  });

  it("seeds bookings for an active barber of the first branch (the one the page opens on)", () => {
    const firstBranchId = Math.min(...db().branches.map((b) => b.id));
    const seeded = Object.keys(db().barberUpcomingBookings).map(Number);
    const inFirst = db().barbers.filter(
      (b) => b.branchId === firstBranchId && b.isActive && seeded.includes(b.id),
    );

    expect(inFirst.length).toBeGreaterThan(0);
  });

  it("gives the branch manager role the attendance permission", () => {
    expect(MOCK_MANAGER_PERMISSIONS).toContain("Barber.Attendance");
  });
});
