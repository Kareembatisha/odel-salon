import { TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { firstValueFrom, of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockDb } from "@core/mock/mock-db";
import { NotificationService } from "@core/services/notification.service";
import { BranchesService } from "../branches/service/branches.service";
import { BarberMockRepository } from "./repository/barber-mock.repository";
import { BARBER_REPOSITORY } from "./repository/barber.repository";
import { BarberAttendanceService } from "./service/barber-attendance.service";

/**
 * The attendance service running against the real mock repository (the one `npm start` uses):
 * the whole mark-present / blocked-absent / stale-sheet story, end to end.
 */
describe("barber attendance (service + mock repository)", () => {
  let service: BarberAttendanceService;
  let db: MockDb;
  let warning: ReturnType<typeof vi.spyOn>;

  const settle = async () => vi.advanceTimersByTimeAsync(2000);
  const find = (id: number) => service.rows().find((r) => r.barberId === id)!;

  beforeEach(async () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: BARBER_REPOSITORY, useClass: BarberMockRepository },
        {
          provide: BranchesService,
          useValue: { loadOptions: () => of([{ id: 1, nameAr: "ز", nameEn: "Zamalek" }]) },
        },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation("en", {
      BARBERS: {
        ERRORS: { ATTENDANCE_HAS_BOOKINGS: "{{name}} has {{count}} upcoming booking(s)" },
      },
    });
    translate.use("en");
    db = TestBed.inject(MockDb);
    db.barberAttendance = {};
    warning = vi.spyOn(TestBed.inject(NotificationService), "warning");
    service = TestBed.inject(BarberAttendanceService);

    service.initialize();
    await settle();
  });

  afterEach(() => vi.useRealTimers());

  it("opens on the first branch with today's sheet: nobody present, seeded bookings visible", () => {
    expect(service.branchId()).toBe(1);
    expect(service.rows().length).toBeGreaterThan(0);
    expect(service.presentCount()).toBe(0);
    expect(service.rows().some((r) => r.upcomingBookingsCount > 0)).toBe(true);
  });

  it("marking a barber present sticks after the sheet reloads", async () => {
    const barber = service.rows()[0];

    const done = firstValueFrom(service.setPresent(barber, true));
    await settle();

    expect(await done).toBe(true);
    expect(find(barber.barberId).isPresent).toBe(true);
    expect(service.presentCount()).toBe(1);
  });

  it("a present barber with upcoming bookings can't be marked absent (localized, nothing sent)", async () => {
    const busy = service.rows().find((r) => r.upcomingBookingsCount > 0)!;
    const mark = firstValueFrom(service.setPresent(busy, true));
    await settle();
    await mark;

    const result = firstValueFrom(service.setPresent(find(busy.barberId), false));
    await settle();

    expect(await result).toBe(false);
    expect(find(busy.barberId).isPresent).toBe(true);
    expect(warning).toHaveBeenCalledWith(
      `${busy.fullName} has ${busy.upcomingBookingsCount} upcoming booking(s)`,
    );
  });

  it("a barber whose bookings appeared after the sheet loaded: the server says 409 and the sheet refreshes", async () => {
    const barber = service.rows().find((r) => r.upcomingBookingsCount === 0)!;
    const mark = firstValueFrom(service.setPresent(barber, true));
    await settle();
    await mark;
    expect(find(barber.barberId).upcomingBookingsCount).toBe(0); // the UI thinks it's safe

    db.barberUpcomingBookings[barber.barberId] = 2; // …but a booking was just made elsewhere

    const result = firstValueFrom(service.setPresent(find(barber.barberId), false));
    await settle();

    expect(await result).toBe(false);
    expect(find(barber.barberId)).toMatchObject({ isPresent: true, upcomingBookingsCount: 2 });
    expect(warning).toHaveBeenCalledWith(`${barber.fullName} has 2 upcoming booking(s)`);
  });

  it("an entry from yesterday does not count as present today", async () => {
    const barber = service.rows()[0];
    db.barberAttendance[barber.barberId] = { date: "2000-01-01", isPresent: true };

    service.load();
    await settle();

    expect(find(barber.barberId).isPresent).toBe(false);
  });
});
