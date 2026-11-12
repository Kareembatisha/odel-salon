import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Observable, Subject, of, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../../assets/i18n/en.json";
import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import { AuthService } from "../../../auth/service/auth.service";
import { BranchesService } from "../../../branches/service/branches.service";
import { cairoToday } from "../../../offers/utils/offer-dates.util";
import { BarberAttendanceRow, SetBarberAttendanceRequest } from "../../model/barber.model";
import { BARBER_REPOSITORY } from "../../repository/barber.repository";
import { BarbersAttendance } from "./barbers-attendance";

function ok<T>(data: T): ApiResponse<T> {
  return { status: true, statusCode: 200, message: "ok", errors: null, meta: null, data };
}

function row(id: number, over: Partial<BarberAttendanceRow> = {}): BarberAttendanceRow {
  return {
    barberId: id,
    fullName: `Barber ${id}`,
    imageUrl: null,
    isPresent: false,
    upcomingBookingsCount: 0,
    ...over,
  };
}

class FakeRepo {
  sheets = new Map<number, BarberAttendanceRow[]>();
  sheetCalls: number[] = [];
  puts: SetBarberAttendanceRequest[] = [];
  putResult: () => Observable<ApiResponse<null>> = () => of(ok(null));

  getAttendance(branchId: number) {
    this.sheetCalls.push(branchId);
    return of(ok(structuredClone(this.sheets.get(branchId) ?? [])));
  }
  setAttendance(payload: SetBarberAttendanceRequest) {
    this.puts.push(payload);
    return this.putResult();
  }
}

describe("BarbersAttendance", () => {
  let repo: FakeRepo;
  let fixture: ComponentFixture<BarbersAttendance>;
  let granted: string[];
  let branches: Array<{ id: number; nameAr: string; nameEn: string }>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? "";
  const items = () => Array.from(el().querySelectorAll<HTMLElement>("ul.sheet li.row"));
  const toggleOf = (li: HTMLElement) => li.querySelector<HTMLButtonElement>("app-switch button")!;
  const select = () => el().querySelector<HTMLSelectElement>("app-filter-select select")!;

  async function open() {
    fixture = TestBed.createComponent(BarbersAttendance);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    repo = new FakeRepo();
    granted = ["Barber.Attendance"];
    branches = [
      { id: 2, nameAr: "فرع ب", nameEn: "Branch B" },
      { id: 1, nameAr: "فرع أ", nameEn: "Branch A" },
    ];
    repo.sheets.set(1, [
      row(10, { isPresent: true, upcomingBookingsCount: 2 }),
      row(11),
      row(12, { upcomingBookingsCount: 1 }),
    ]);
    repo.sheets.set(2, [row(20)]);

    TestBed.configureTestingModule({
      imports: [BarbersAttendance, TranslateModule.forRoot()],
      providers: [
        { provide: BARBER_REPOSITORY, useValue: repo },
        { provide: BranchesService, useValue: { loadOptions: () => of(branches) } },
        { provide: AuthService, useValue: { hasPermission: (p: string) => granted.includes(p) } },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation("en", en);
    translate.use("en");
  });

  afterEach(() => vi.useRealTimers());

  it("opens on the first branch (oldest) and lists today's sheet", async () => {
    await open();

    expect(repo.sheetCalls).toEqual([1]);
    expect(select().value).toBe("1");
    expect(Array.from(select().options).map((o) => o.textContent?.trim())).toEqual([
      "Branch A",
      "Branch B",
    ]);
    expect(items().map((li) => li.querySelector(".row__name")?.textContent?.trim())).toEqual([
      "Barber 10",
      "Barber 11",
      "Barber 12",
    ]);
  });

  it("shows today's date and how many barbers are present", async () => {
    await open();

    expect(text()).toContain("1 of 3 present");
    const year = cairoToday().slice(0, 4);
    expect(el().querySelector(".today")?.textContent).toContain(year);
  });

  it("shows the Present / Absent state with the switch on for present barbers", async () => {
    await open();
    const [present, absent] = items();

    expect(present.textContent).toContain("Present");
    expect(toggleOf(present).getAttribute("aria-checked")).toBe("true");
    expect(absent.textContent).toContain("Absent");
    expect(toggleOf(absent).getAttribute("aria-checked")).toBe("false");
  });

  it("shows the upcoming bookings count, singular and plural", async () => {
    await open();
    const [many, none, one] = items();

    expect(many.textContent).toContain("2 upcoming bookings");
    expect(none.textContent).not.toContain("upcoming booking");
    expect(one.textContent).toContain("1 upcoming booking");
    expect(one.textContent).not.toContain("1 upcoming bookings");
  });

  it("disables the switch of a present barber with bookings and says why", async () => {
    await open();
    const [locked, free, absentWithBooking] = items();

    expect(toggleOf(locked).disabled).toBe(true);
    expect(locked.textContent).toContain("Can’t be marked absent");
    expect(toggleOf(locked).getAttribute("aria-label")).toContain("Barber 10");
    // Absent barbers can be marked present even when they have bookings; free ones too.
    expect(toggleOf(free).disabled).toBe(false);
    expect(toggleOf(absentWithBooking).disabled).toBe(false);
    expect(absentWithBooking.textContent).not.toContain("Can’t be marked absent");
  });

  it("saves immediately when a switch is flipped: one single-item PUT, then the sheet reloads", async () => {
    await open();
    repo.sheets.set(1, [
      row(10, { isPresent: true, upcomingBookingsCount: 2 }),
      row(11, { isPresent: true }),
      row(12, { upcomingBookingsCount: 1 }),
    ]);

    toggleOf(items()[1]).click();
    await settle();

    expect(repo.puts).toEqual([{ barbers: [{ barberId: 11, isPresent: true }] }]);
    expect(repo.sheetCalls).toEqual([1, 1]); // opened + reloaded after the save
    expect(text()).toContain("2 of 3 present");
    expect(toggleOf(items()[1]).getAttribute("aria-checked")).toBe("true");
  });

  it("marks a present barber without bookings absent", async () => {
    repo.sheets.set(1, [row(11, { isPresent: true })]);
    await open();
    repo.sheets.set(1, [row(11, { isPresent: false })]);

    toggleOf(items()[0]).click();
    await settle();

    expect(repo.puts).toEqual([{ barbers: [{ barberId: 11, isPresent: false }] }]);
    expect(items()[0].textContent).toContain("Absent");
  });

  it("shows no toast on success but tells screen readers through the live region", async () => {
    await open();
    const success = vi.spyOn(TestBed.inject(NotificationService), "success");

    toggleOf(items()[1]).click();
    await settle();

    expect(success).not.toHaveBeenCalled();
    const live = el().querySelector('[role="status"]');
    expect(live?.textContent).toContain("Barber 11 marked present.");
    expect(live?.classList.contains("sr-only")).toBe(true);
  });

  it("disables only the barber being saved while the request is in flight", async () => {
    await open();
    const hold = new Subject<ApiResponse<null>>();
    repo.putResult = () => hold;

    toggleOf(items()[1]).click();
    fixture.detectChanges();

    expect(toggleOf(items()[1]).disabled).toBe(true);
    expect(toggleOf(items()[2]).disabled).toBe(false);

    hold.next(ok(null));
    hold.complete();
    await settle();
    expect(repo.puts).toHaveLength(1);
  });

  it("leaves the barber as it was when the save fails, and announces nothing", async () => {
    await open();
    repo.putResult = () => throwError(() => ({ status: 500 }));

    toggleOf(items()[1]).click();
    await settle();

    expect(toggleOf(items()[1]).getAttribute("aria-checked")).toBe("false");
    expect(el().querySelector('[role="status"]')?.textContent?.trim()).toBe("");
    expect(toggleOf(items()[1]).disabled).toBe(false);
  });

  it("a 409 (bookings appeared after the sheet loaded) refreshes the sheet with the new count", async () => {
    repo.sheets.set(1, [row(11, { isPresent: true })]);
    await open();
    expect(items()[0].textContent).not.toContain("upcoming booking");

    repo.sheets.set(1, [row(11, { isPresent: true, upcomingBookingsCount: 3 })]);
    repo.putResult = () => throwError(() => ({ status: 409 }));
    toggleOf(items()[0]).click();
    await settle();

    expect(items()[0].textContent).toContain("3 upcoming bookings");
    expect(toggleOf(items()[0]).disabled).toBe(true);
    expect(toggleOf(items()[0]).getAttribute("aria-checked")).toBe("true");
  });

  it("switching branch shows the other branch's sheet", async () => {
    await open();

    select().value = "2";
    select().dispatchEvent(new Event("change"));
    await settle();

    expect(repo.sheetCalls).toEqual([1, 2]);
    expect(items().map((li) => li.querySelector(".row__name")?.textContent?.trim())).toEqual([
      "Barber 20",
    ]);
    expect(text()).toContain("0 of 1 present");
  });

  it("clears the announcement when the branch changes", async () => {
    await open();
    toggleOf(items()[1]).click();
    await settle();
    expect(el().querySelector('[role="status"]')?.textContent).toContain("marked present");

    select().value = "2";
    select().dispatchEvent(new Event("change"));
    await settle();

    expect(el().querySelector('[role="status"]')?.textContent?.trim()).toBe("");
  });

  it("hides the switches when the user cannot mark attendance (the route guard is the boundary)", async () => {
    granted = [];
    await open();

    expect(items()).toHaveLength(3);
    expect(el().querySelectorAll("app-switch")).toHaveLength(0);
  });

  it("does not send anything if toggled without the permission", async () => {
    granted = [];
    await open();
    (
      fixture.componentInstance as unknown as {
        toggle(r: BarberAttendanceRow, v: boolean): void;
      }
    ).toggle(row(11), true);

    expect(repo.puts).toEqual([]);
  });

  it("shows a message and no selector when there are no branches", async () => {
    branches = [];
    await open();

    expect(text()).toContain("No branches yet");
    expect(el().querySelector("app-filter-select")).toBeNull();
    expect(repo.sheetCalls).toEqual([]);
  });

  it("shows an empty state for a branch without active barbers", async () => {
    repo.sheets.set(1, []);
    await open();

    expect(text()).toContain("No active barbers in this branch");
    expect(items()).toHaveLength(0);
  });

  it("shows the failed state with a retry when the first load fails", async () => {
    repo.getAttendance = () => throwError(() => ({ status: 500 }));
    await open();

    expect(el().querySelector("app-failed-state")).not.toBeNull();
    expect(items()).toHaveLength(0);

    const good = new FakeRepo();
    good.sheets.set(1, [row(10)]);
    repo.getAttendance = good.getAttendance.bind(good);
    el().querySelector<HTMLButtonElement>("app-failed-state button")!.click();
    await settle();

    expect(items()).toHaveLength(1);
    expect(el().querySelector("app-failed-state")).toBeNull();
  });

  it("keeps the rows on screen when a later reload fails", async () => {
    await open();
    repo.getAttendance = () => throwError(() => ({ status: 500 }));
    toggleOf(items()[1]).click(); // save OK → reload fails
    await settle();

    expect(items()).toHaveLength(3);
    expect(el().querySelector("app-failed-state")).not.toBeNull();
  });

  it("reloads on tab focus only when the Cairo day changed", async () => {
    await open();
    expect(repo.sheetCalls).toEqual([1]);

    window.dispatchEvent(new Event("focus"));
    await settle();
    expect(repo.sheetCalls).toEqual([1]); // same day: nothing to do

    // A sheet loaded "yesterday": the next focus reloads it.
    (TestBed.inject(BARBER_REPOSITORY) as unknown as FakeRepo).sheetCalls.length = 0;
    const service = fixture.componentInstance as unknown as {
      attendance: { _sheetDate: { set(v: string): void } };
    };
    service.attendance["_sheetDate"].set("2000-01-01");
    window.dispatchEvent(new Event("focus"));
    await settle();

    expect(repo.sheetCalls).toEqual([1]);
    expect(el().querySelector(".today")?.textContent).not.toContain("2000");
  });

  it("renders the Arabic page title", async () => {
    const translate = TestBed.inject(TranslateService);
    const ar = (await import("../../../../../assets/i18n/ar.json")).default;
    translate.setTranslation("ar", ar);
    translate.use("ar");
    await open();

    expect(el().querySelector("h1")?.textContent).toContain("حضور الحلاقين");
    expect(text()).toContain("حاضر");
  });
});
