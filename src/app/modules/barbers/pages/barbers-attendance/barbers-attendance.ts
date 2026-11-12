import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { TranslateModule, TranslateService } from "@ngx-translate/core";

import { PERMISSIONS } from "@core/auth/permissions";
import { LanguageService } from "@core/services/language.service";
import { AvatarComponent } from "@shared/components/avatar/avatar.component";
import { EmptyStateComponent } from "@shared/components/empty-state/empty-state.component";
import { FailedStateComponent } from "@shared/components/failed-state/failed-state.component";
import {
  FilterOption,
  FilterSelectComponent,
} from "@shared/components/filter-select/filter-select.component";
import { PageHeaderComponent } from "@shared/components/page-header/page-header.component";
import { SkeletonComponent } from "@shared/components/skeleton/skeleton.component";
import { StatusBadgeComponent } from "@shared/components/status-badge/status-badge.component";
import { SwitchComponent } from "@shared/components/switch/switch.component";
import { AuthService } from "../../../auth/service/auth.service";
import { cairoToday } from "../../../offers/utils/offer-dates.util";
import { BarberAttendanceRow } from "../../model/barber.model";
import { BarberAttendanceService } from "../../service/barber-attendance.service";
import { formatAttendanceDate } from "../../utils/barber-attendance-date.util";
import { localizedName } from "../../utils/barber-labels.util";

/** Skeleton rows shown while the first sheet loads. */
const SKELETON_ROWS = [1, 2, 3, 4, 5];

/**
 * Barber attendance — today's sheet (Cairo date) for ONE branch (the first by default).
 *
 * Each row has an Absent / Present switch that saves immediately (no "Save" button): the service
 * sends a single-item PUT and reloads the sheet. A present barber with upcoming bookings can't be
 * marked absent, so that switch is disabled and the row says why. There is no success toast — the
 * switch is the feedback, and a polite live region tells screen-reader users what was saved.
 *
 * The date is the sheet's own date; when the tab regains focus the service reloads the sheet if the
 * Cairo day changed while the page was open.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-barbers-attendance",
  standalone: true,
  imports: [
    TranslateModule,
    PageHeaderComponent,
    FilterSelectComponent,
    AvatarComponent,
    SwitchComponent,
    StatusBadgeComponent,
    SkeletonComponent,
    EmptyStateComponent,
    FailedStateComponent,
  ],
  templateUrl: "./barbers-attendance.html",
  styleUrl: "./barbers-attendance.scss",
})
export class BarbersAttendance implements OnInit {
  private readonly attendance = inject(BarberAttendanceService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  protected readonly rows = this.attendance.rows;
  protected readonly branchId = this.attendance.branchId;
  protected readonly loading = this.attendance.loading;
  protected readonly branchesLoading = this.attendance.branchesLoading;
  protected readonly hasError = this.attendance.hasError;
  protected readonly pendingIds = this.attendance.pendingIds;
  protected readonly presentCount = this.attendance.presentCount;
  protected readonly totalCount = this.attendance.totalCount;

  protected readonly skeletons = SKELETON_ROWS;

  /** Read lazily (computed), never in a field initializer — the route guard stays the real boundary. */
  protected readonly canMark = computed(() =>
    this.auth.hasPermission(PERMISSIONS.Barber.Attendance),
  );

  /** No "all branches" option: a sheet belongs to exactly one branch. */
  protected readonly branchOptions = computed<FilterOption[]>(() =>
    this.attendance.branches().map((b) => ({
      value: String(b.id),
      label: localizedName(b, this.language.currentLang()),
    })),
  );

  /** Branches finished loading and there is none: nothing to select, nothing to mark. */
  protected readonly noBranches = computed(
    () =>
      !this.attendance.branchesLoading() &&
      this.attendance.branches().length === 0 &&
      this.branchId() === null,
  );

  /** The sheet's own date, so the heading stays true until the next reload replaces it. */
  protected readonly dateLabel = computed(() =>
    formatAttendanceDate(this.attendance.sheetDate() ?? cairoToday(), this.language.currentLang()),
  );

  /** First load of a branch's sheet: nothing to show yet. Later reloads keep the rows in place. */
  protected readonly showSkeleton = computed(
    () => this.branchesLoading() || (this.loading() && !this.rows().length && !this.hasError()),
  );

  /** What the last save did, for the polite live region (the page shows no toast). */
  protected readonly announcement = signal("");

  ngOnInit(): void {
    this.attendance.initialize();
  }

  // The sheet is for one Cairo day: check on every return to the tab (cheap, a no-op on the same day).
  @HostListener("window:focus")
  @HostListener("document:visibilitychange")
  protected onTabFocus(): void {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    this.attendance.refreshIfDayChanged();
  }

  protected onBranch(value: string): void {
    if (value === "") return;
    this.announcement.set("");
    this.attendance.selectBranch(Number(value));
  }

  protected reload(): void {
    this.attendance.load();
  }

  protected isPending(row: BarberAttendanceRow): boolean {
    return this.pendingIds().has(row.barberId);
  }

  /** A present barber with upcoming bookings can't be marked absent (the API would answer 409). */
  protected isLocked(row: BarberAttendanceRow): boolean {
    return row.isPresent && row.upcomingBookingsCount > 0;
  }

  protected switchLabel(row: BarberAttendanceRow): string {
    return this.translate.instant(
      row.isPresent ? "BARBERS.ATTENDANCE.MARK_ABSENT" : "BARBERS.ATTENDANCE.MARK_PRESENT",
      { name: row.fullName },
    );
  }

  protected toggle(row: BarberAttendanceRow, isPresent: boolean): void {
    if (!this.canMark()) return;

    this.attendance.setPresent(row, isPresent).subscribe((ok) => {
      if (!ok) return;
      this.announcement.set(
        this.translate.instant(
          isPresent ? "BARBERS.ATTENDANCE.ANNOUNCE_PRESENT" : "BARBERS.ATTENDANCE.ANNOUNCE_ABSENT",
          { name: row.fullName },
        ),
      );
    });
  }
}
