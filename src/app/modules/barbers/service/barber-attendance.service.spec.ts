import { TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Observable, Subject, firstValueFrom, of, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import { BranchesService } from "../../branches/service/branches.service";
import { cairoToday } from "../../offers/utils/offer-dates.util";
import { BarberAttendanceRow, SetBarberAttendanceRequest } from "../model/barber.model";
import { BARBER_REPOSITORY } from "../repository/barber.repository";
import { BarberAttendanceService } from "./barber-attendance.service";

const row = (
  barberId: number,
  overrides: Partial<BarberAttendanceRow> = {},
): BarberAttendanceRow => ({
  barberId,
  fullName: `Barber ${barberId}`,
  imageUrl: null,
  isPresent: false,
  upcomingBookingsCount: 0,
  ...overrides,
});

function ok<T>(data: T, status = true): ApiResponse<T> {
  return { status, statusCode: status ? 200 : 400, message: "msg", errors: null, meta: null, data };
}

const BRANCHES = [
  { id: 9, nameAr: "ب", nameEn: "B" },
  { id: 2, nameAr: "أ", nameEn: "A" },
];

/** Repository double: sheet requests return Subjects the test resolves by hand. */
class FakeRepository {
  sheetCalls: number[] = [];
  pending: Array<Subject<ApiResponse<BarberAttendanceRow[]>>> = [];
  setCalls: SetBarberAttendanceRequest[] = [];
  nextSet: () => Observable<ApiResponse<null>> = () => of(ok(null));

  getAttendance(branchId: number) {
    this.sheetCalls.push(branchId);
    const s = new Subject<ApiResponse<BarberAttendanceRow[]>>();
    this.pending.push(s);
    return s;
  }

  setAttendance(payload: SetBarberAttendanceRequest) {
    this.setCalls.push(payload);
    return this.nextSet();
  }

  get last() {
    return this.pending[this.pending.length - 1];
  }

  /** Answer the newest sheet request. */
  answer(rows: BarberAttendanceRow[]) {
    this.last.next(ok(rows));
    this.last.complete();
  }
}

describe("BarberAttendanceService", () => {
  let repo: FakeRepository;
  let service: BarberAttendanceService;
  let warning: ReturnType<typeof vi.spyOn>;
  let success: ReturnType<typeof vi.spyOn>;
  let loadOptions: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    repo = new FakeRepository();
    loadOptions = vi.fn(() => of(BRANCHES));
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: BARBER_REPOSITORY, useValue: repo },
        { provide: BranchesService, useValue: { loadOptions } },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation("en", {
      BARBERS: {
        ERRORS: { ATTENDANCE_HAS_BOOKINGS: "{{name}} has {{count}} upcoming booking(s)" },
      },
    });
    translate.use("en");
    service = TestBed.inject(BarberAttendanceService);
    const notify = TestBed.inject(NotificationService);
    warning = vi.spyOn(notify, "warning");
    success = vi.spyOn(notify, "success");
  });

  afterEach(() => vi.useRealTimers());

  describe("initialize", () => {
    it("loads the branches (oldest first), selects the first and loads its sheet", () => {
      service.initialize();

      expect(service.branches().map((b) => b.id)).toEqual([2, 9]);
      expect(service.branchId()).toBe(2);
      expect(repo.sheetCalls).toEqual([2]);
      expect(service.loading()).toBe(true);

      repo.answer([row(1), row(2, { isPresent: true })]);

      expect(service.loading()).toBe(false);
      expect(service.rows().map((r) => r.barberId)).toEqual([1, 2]);
      expect(service.sheetDate()).toBe(cairoToday());
    });

    it("loads the branch options only once, and keeps the selected branch on re-entry", () => {
      service.initialize();
      repo.answer([row(1)]);
      service.selectBranch(9);
      repo.answer([row(5)]);

      service.initialize();

      expect(loadOptions).toHaveBeenCalledTimes(1);
      expect(service.branchId()).toBe(9);
      expect(repo.sheetCalls).toEqual([2, 9, 9]);
    });

    it("falls back to the first branch when the selected one no longer exists", () => {
      service.initialize();
      repo.answer([row(1)]);
      service.selectBranch(9);
      repo.answer([row(5)]);
      loadOptions.mockReturnValue(of([BRANCHES[1]])); // branch 9 was deleted
      (service as unknown as { branchesLoaded: boolean }).branchesLoaded = false;

      service.initialize();

      expect(service.branchId()).toBe(2);
      expect(service.rows()).toEqual([]);
    });

    it("with no branches there is nothing to load", () => {
      loadOptions.mockReturnValue(of([]));

      service.initialize();

      expect(service.branchId()).toBeNull();
      expect(repo.sheetCalls).toEqual([]);
      expect(service.loading()).toBe(false);
      expect(service.branchesLoading()).toBe(false);
    });
  });

  describe("load", () => {
    beforeEach(() => service.initialize());

    it("ignores a stale response; only the latest request clears `loading`", () => {
      const first = repo.last;
      service.load();
      const second = repo.last;

      first.next(ok([row(1)])); // cancelled by the second load
      expect(service.rows()).toEqual([]);
      expect(service.loading()).toBe(true);

      second.next(ok([row(9)]));
      second.complete();
      expect(service.rows().map((r) => r.barberId)).toEqual([9]);
      expect(service.loading()).toBe(false);
    });

    it("keeps the previous rows and flags `hasError` when a reload fails", () => {
      repo.answer([row(1)]);

      service.load();
      repo.last.error(new Error("boom"));

      expect(service.hasError()).toBe(true);
      expect(service.loading()).toBe(false);
      expect(service.rows().map((r) => r.barberId)).toEqual([1]);
    });

    it("treats a status:false body as a failure", () => {
      repo.last.next(ok(null as unknown as BarberAttendanceRow[], false));
      repo.last.complete();

      expect(service.hasError()).toBe(true);
      expect(service.rows()).toEqual([]);
    });

    it("clears the error flag on the next attempt", () => {
      repo.last.error(new Error("boom"));
      service.load();
      expect(service.hasError()).toBe(false);
    });

    it("counts who is present", () => {
      repo.answer([row(1, { isPresent: true }), row(2), row(3, { isPresent: true })]);

      expect(service.presentCount()).toBe(2);
      expect(service.totalCount()).toBe(3);
    });
  });

  describe("selectBranch", () => {
    beforeEach(() => {
      service.initialize();
      repo.answer([row(1)]);
    });

    it("clears the previous branch's rows at once and loads the new sheet", () => {
      service.selectBranch(9);

      expect(service.rows()).toEqual([]);
      expect(service.sheetDate()).toBeNull();
      expect(repo.sheetCalls.at(-1)).toBe(9);
    });

    it("does nothing for the branch that is already selected", () => {
      service.selectBranch(2);
      expect(repo.sheetCalls).toEqual([2]);
    });

    it("a late answer for the previous branch can't overwrite the new one", () => {
      service.selectBranch(9);
      const forNine = repo.last;
      service.selectBranch(2);
      forNine.next(ok([row(99)]));
      expect(service.rows()).toEqual([]);
    });
  });

  describe("refreshIfDayChanged", () => {
    it("reloads when the Cairo date moved on since the sheet was loaded", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-12T10:00:00Z"));
      service.initialize();
      repo.answer([row(1)]);
      const calls = repo.sheetCalls.length;

      vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
      service.refreshIfDayChanged();

      expect(repo.sheetCalls.length).toBe(calls + 1);
    });

    it("does nothing on the same day, or before anything was loaded", () => {
      service.refreshIfDayChanged();
      service.initialize();
      repo.answer([row(1)]);
      const calls = repo.sheetCalls.length;

      service.refreshIfDayChanged();

      expect(repo.sheetCalls.length).toBe(calls);
    });
  });

  describe("setPresent", () => {
    beforeEach(() => {
      service.initialize();
      repo.answer([row(1), row(2), row(3, { isPresent: true, upcomingBookingsCount: 3 })]);
    });

    const find = (id: number) => service.rows().find((r) => r.barberId === id)!;

    it("sends a single-item PUT for one barber, patches the row, then reloads the sheet", async () => {
      const calls = repo.sheetCalls.length;

      expect(await firstValueFrom(service.setPresent(find(1), true))).toBe(true);

      expect(repo.setCalls).toEqual([{ barbers: [{ barberId: 1, isPresent: true }] }]);
      expect(find(1).isPresent).toBe(true);
      expect(find(2).isPresent).toBe(false);
      expect(repo.sheetCalls.length).toBe(calls + 1);
    });

    it("does not toast on success (the toggle is the feedback)", async () => {
      await firstValueFrom(service.setPresent(find(1), true));
      expect(success).not.toHaveBeenCalled();
    });

    it("does nothing when the barber is already in the requested state", async () => {
      expect(await firstValueFrom(service.setPresent(find(3), true))).toBe(true);
      expect(repo.setCalls).toEqual([]);
    });

    it("marks a barber with no bookings absent", async () => {
      service.load();
      repo.answer([row(1, { isPresent: true })]);
      await firstValueFrom(service.setPresent(find(1), false));
      expect(repo.setCalls).toEqual([{ barbers: [{ barberId: 1, isPresent: false }] }]);
    });

    it("blocks 'absent' for a present barber with upcoming bookings: localized warning, no request", async () => {
      expect(await firstValueFrom(service.setPresent(find(3), false))).toBe(false);

      expect(repo.setCalls).toEqual([]);
      expect(warning).toHaveBeenCalledWith("Barber 3 has 3 upcoming booking(s)");
      expect(find(3).isPresent).toBe(true);
    });

    it("lets a barber with bookings be marked PRESENT", async () => {
      service.load();
      repo.answer([row(1, { upcomingBookingsCount: 2 })]);
      expect(await firstValueFrom(service.setPresent(find(1), true))).toBe(true);
    });

    describe("failure", () => {
      it("a failed request leaves the row alone, doesn't reload and resolves false", async () => {
        repo.nextSet = () => throwError(() => ({ status: 500 }));
        const calls = repo.sheetCalls.length;

        expect(await firstValueFrom(service.setPresent(find(1), true))).toBe(false);

        expect(find(1).isPresent).toBe(false);
        expect(repo.sheetCalls.length).toBe(calls);
      });

      it("a status:false body counts as a failure", async () => {
        repo.nextSet = () => of(ok(null, false));
        expect(await firstValueFrom(service.setPresent(find(1), true))).toBe(false);
        expect(find(1).isPresent).toBe(false);
      });

      it.each([409, 404])("a %s means the sheet is stale: it is reloaded", async (status) => {
        repo.nextSet = () => throwError(() => ({ status }));
        const calls = repo.sheetCalls.length;

        expect(await firstValueFrom(service.setPresent(find(1), true))).toBe(false);

        expect(repo.sheetCalls.length).toBe(calls + 1);
      });
    });

    describe("pending state", () => {
      it("tracks the barber being saved and `saving`, and clears both when done", () => {
        const pending = new Subject<ApiResponse<null>>();
        repo.nextSet = () => pending;

        service.setPresent(find(1), true).subscribe();

        expect(service.pendingIds().has(1)).toBe(true);
        expect(service.saving()).toBe(true);

        pending.next(ok(null));
        pending.complete();

        expect(service.pendingIds().has(1)).toBe(false);
        expect(service.saving()).toBe(false);
      });

      it("refuses any second call for the same barber while the first is running", async () => {
        const pending = new Subject<ApiResponse<null>>();
        repo.nextSet = () => pending;
        service.setPresent(find(1), true).subscribe();

        expect(await firstValueFrom(service.setPresent(find(1), true))).toBe(false);
        expect(
          await firstValueFrom(service.setPresent({ ...find(1), isPresent: true }, false)),
        ).toBe(false);
        expect(repo.setCalls).toHaveLength(1);
      });

      it("allows different barbers at the same time; `saving` stays true until the LAST one finishes", () => {
        const a = new Subject<ApiResponse<null>>();
        const b = new Subject<ApiResponse<null>>();
        const queue = [a, b];
        repo.nextSet = () => queue.shift()!;

        service.setPresent(find(1), true).subscribe();
        service.setPresent(find(2), true).subscribe();
        expect([...service.pendingIds()].sort()).toEqual([1, 2]);

        a.next(ok(null));
        a.complete();
        expect(service.saving()).toBe(true);
        expect(service.pendingIds().has(2)).toBe(true);

        b.next(ok(null));
        b.complete();
        expect(service.saving()).toBe(false);
      });

      it("is released even when the request fails", async () => {
        repo.nextSet = () => throwError(() => ({ status: 500 }));
        await firstValueFrom(service.setPresent(find(1), true));

        expect(service.pendingIds().size).toBe(0);
        expect(service.saving()).toBe(false);
      });
    });
  });
});
