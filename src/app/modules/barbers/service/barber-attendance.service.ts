import { Injectable, computed, inject, signal } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import { Observable, Subscription, catchError, finalize, map, of, tap } from "rxjs";

import { NotificationService } from "@core/services/notification.service";
import { BranchListItem } from "../../branches/model/branch.model";
import { BranchesService } from "../../branches/service/branches.service";
import { cairoToday } from "../../offers/utils/offer-dates.util";
import { BarberAttendanceRow } from "../model/barber.model";
import { BARBER_REPOSITORY } from "../repository/barber.repository";

// ============================================================
// Types
// ============================================================

export type AttendanceBranchOption = Pick<BranchListItem, "id" | "nameAr" | "nameEn">;

// ============================================================
// Service
// ============================================================

/**
 * State for the daily attendance sheet (`/main/barbers/attendance`).
 *
 * The API gives ONE branch's sheet for TODAY (Cairo date), so — like Offers and Packages —
 * {@link initialize} selects the first branch by default (no "all branches" view).
 *
 * Marking is per barber: {@link setPresent} sends a single-item `PUT /barbers/attendance`
 * (the API also accepts the whole sheet, which this screen doesn't use). The row is patched as
 * soon as the call succeeds and the sheet is then reloaded, so counts stay the server's truth.
 * No success toast: the toggle itself is the feedback and a morning's worth of toasts is noise.
 *
 * A present barber with upcoming bookings can't be marked absent. That is checked here first
 * (localized message, no request); if the sheet was stale and the server answers `409` anyway,
 * the error interceptor already showed the server's message and the sheet is reloaded.
 */
@Injectable({ providedIn: "root" })
export class BarberAttendanceService {
  // ----------------------------------------------------------
  // Injected Dependencies
  // ----------------------------------------------------------

  private readonly repository = inject(BARBER_REPOSITORY);
  private readonly branchesService = inject(BranchesService);
  private readonly notify = inject(NotificationService);
  private readonly translate = inject(TranslateService);

  // ----------------------------------------------------------
  // Private State
  // ----------------------------------------------------------

  private readonly _rows = signal<BarberAttendanceRow[]>([]);
  private readonly _branches = signal<AttendanceBranchOption[]>([]);
  private readonly _branchId = signal<number | null>(null);
  private readonly _sheetDate = signal<string | null>(null);
  private readonly _loading = signal(false);
  private readonly _branchesLoading = signal(false);
  private readonly _hasError = signal(false);
  private readonly _pendingIds = signal<ReadonlySet<number>>(new Set());
  private readonly pendingMutations = signal(0);

  private branchesLoaded = false;

  /** In-flight sheet request — a newer one cancels it so a slow, stale response can't win. */
  private inFlight?: Subscription;
  private requestId = 0;

  // ----------------------------------------------------------
  // Public Read-only State
  // ----------------------------------------------------------

  readonly rows = this._rows.asReadonly();
  readonly branches = this._branches.asReadonly();
  readonly branchId = this._branchId.asReadonly();
  /** Cairo date (`yyyy-MM-dd`) the loaded sheet belongs to; `null` before the first load. */
  readonly sheetDate = this._sheetDate.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly branchesLoading = this._branchesLoading.asReadonly();
  readonly hasError = this._hasError.asReadonly();
  /** Barbers whose attendance is being saved right now (their toggle is disabled). */
  readonly pendingIds = this._pendingIds.asReadonly();
  readonly saving = computed(() => this.pendingMutations() > 0);

  readonly presentCount = computed(() => this._rows().filter((r) => r.isPresent).length);
  readonly totalCount = computed(() => this._rows().length);

  // ----------------------------------------------------------
  // Loading
  // ----------------------------------------------------------

  /**
   * Called when the page opens: loads the branch options once, keeps the selected branch when it
   * still exists (otherwise picks the oldest), then loads its sheet.
   */
  initialize(): void {
    if (this.branchesLoaded) {
      this.ensureBranchAndLoad();
      return;
    }

    this._branchesLoading.set(true);
    this.branchesService
      .loadOptions()
      .pipe(finalize(() => this._branchesLoading.set(false)))
      .subscribe((options) => {
        // The Branches API lists newest first; the selector reads oldest first.
        this._branches.set([...options].sort((a, b) => a.id - b.id));
        this.branchesLoaded = true;
        this.ensureBranchAndLoad();
      });
  }

  /**
   * Request today's sheet for the selected branch. Only the latest response may write `rows` or
   * clear `loading`. A failure sets `hasError` but keeps the previous rows. Does nothing until a
   * branch is selected.
   */
  load(): void {
    const branchId = this._branchId();
    if (branchId === null) return;

    const currentRequest = ++this.requestId;

    this.inFlight?.unsubscribe();
    this._loading.set(true);
    this._hasError.set(false);
    this.inFlight = this.repository
      .getAttendance(branchId)
      .pipe(
        map((res) => {
          if (!res.status) throw new Error(res.message);
          return res.data ?? [];
        }),
        catchError(() => {
          this._hasError.set(true);
          return of(null);
        }),
        finalize(() => {
          if (currentRequest === this.requestId) this._loading.set(false);
        }),
      )
      .subscribe((rows) => {
        if (!rows) return;
        this._rows.set(rows);
        this._sheetDate.set(cairoToday());
      });
  }

  /** Show another branch's sheet; the previous branch's rows disappear right away. */
  selectBranch(branchId: number): void {
    if (branchId === this._branchId()) return;

    this._branchId.set(branchId);
    this._rows.set([]);
    this._sheetDate.set(null);
    this.load();
  }

  /**
   * The sheet is for one Cairo day. If the page stayed open past midnight (or the tab was in the
   * background) the loaded sheet is old: reload it. Cheap to call on every tab focus.
   */
  refreshIfDayChanged(): void {
    const loaded = this._sheetDate();
    if (loaded !== null && loaded !== cairoToday()) this.load();
  }

  // ----------------------------------------------------------
  // Marking attendance
  // ----------------------------------------------------------

  /**
   * Mark one barber present or absent for today. Resolves `true` when the barber is in the
   * requested state afterwards (including "already was"), `false` when nothing was saved:
   * blocked, already saving that barber, or the request failed (the interceptor explained why).
   */
  setPresent(row: BarberAttendanceRow, isPresent: boolean): Observable<boolean> {
    if (row.isPresent === isPresent) return of(true);
    if (this._pendingIds().has(row.barberId)) return of(false);

    if (!isPresent && row.upcomingBookingsCount > 0) {
      this.notify.warning(
        this.translate.instant("BARBERS.ERRORS.ATTENDANCE_HAS_BOOKINGS", {
          name: row.fullName,
          count: row.upcomingBookingsCount,
        }),
      );
      return of(false);
    }

    this.pendingMutations.update((n) => n + 1);
    this._pendingIds.update((ids) => new Set(ids).add(row.barberId));

    return this.repository.setAttendance({ barbers: [{ barberId: row.barberId, isPresent }] }).pipe(
      map((res) => {
        if (!res.status) throw new Error(res.message);
        return true;
      }),
      catchError((err: { status?: number }) => {
        // 409 / 404: the sheet we are showing is out of date — refresh it.
        if (err?.status === 409 || err?.status === 404) this.load();
        return of(false);
      }),
      finalize(() => {
        this.pendingMutations.update((n) => n - 1);
        this._pendingIds.update((ids) => {
          const next = new Set(ids);
          next.delete(row.barberId);
          return next;
        });
      }),
      tap((ok) => {
        if (!ok) return;
        this._rows.update((rows) =>
          rows.map((r) => (r.barberId === row.barberId ? { ...r, isPresent } : r)),
        );
        this.load();
      }),
    );
  }

  // ----------------------------------------------------------
  // Private
  // ----------------------------------------------------------

  /** Keep the selected branch if it still exists, otherwise take the first; then load the sheet. */
  private ensureBranchAndLoad(): void {
    const options = this._branches();
    const current = this._branchId();

    if (current === null || !options.some((b) => b.id === current)) {
      this._branchId.set(options[0]?.id ?? null);
      this._rows.set([]);
      this._sheetDate.set(null);
    }

    if (this._branchId() === null) {
      this._loading.set(false);
      return;
    }

    this.load();
  }
}
