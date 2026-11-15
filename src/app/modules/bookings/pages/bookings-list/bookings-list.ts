import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";

import { LanguageService } from "@core/services/language.service";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import {
  DataTableColumnDirective,
  DataTableCardDirective,
  DataTableComponent,
} from "@shared/components/data-table/data-table.component";
import { DateFilterComponent } from "@shared/components/date-filter/date-filter.component";
import { EmptyStateComponent } from "@shared/components/empty-state/empty-state.component";
import { FailedStateComponent } from "@shared/components/failed-state/failed-state.component";
import {
  FilterOption,
  FilterSelectComponent,
} from "@shared/components/filter-select/filter-select.component";
import { PageHeaderComponent } from "@shared/components/page-header/page-header.component";
import { SearchInputComponent } from "@shared/components/search-input/search-input.component";
import {
  StatusBadgeComponent,
  StatusBadgeVariant,
} from "@shared/components/status-badge/status-badge.component";
import { TabItem, TabsComponent } from "@shared/components/tabs/tabs.component";
import { localizedName } from "../../../barbers/utils/barber-labels.util";
import { formatPrice } from "../../../services/utils/service-price.util";
import {
  BookingListItem,
  BookingStatus,
  BookingTab,
  BookingType,
  RefundStatus,
} from "../../model/booking.model";
import { BookingsService } from "../../service/bookings.service";
import { formatBookingDate, formatBookingTime } from "../../utils/booking-dates.util";
import {
  BOOKING_STATUSES,
  BOOKING_TYPES,
  bookingItemsLabel,
  bookingStatusKey,
  bookingStatusVariant,
  bookingTypeKey,
  bookingTypeVariant,
  paymentMethodIcon,
  paymentMethodKey,
  refundStatusKey,
} from "../../utils/booking-labels.util";

/** The one panel the tabs control (`aria-controls` / `aria-labelledby`). */
const PANEL_ID = "bookings-panel";

/** `BOOKINGS.TAB.*` key of each tab, in display order. */
const TABS: ReadonlyArray<[BookingTab, string]> = [
  [BookingTab.All, "BOOKINGS.TAB.ALL"],
  [BookingTab.Today, "BOOKINGS.TAB.TODAY"],
  [BookingTab.Upcoming, "BOOKINGS.TAB.UPCOMING"],
  [BookingTab.Past, "BOOKINGS.TAB.PAST"],
];

/** Everything one table row / card shows, worked out once per response and language. */
export interface BookingRow {
  id: number;
  number: string;
  /** Regular bookings show no badge — only VIP and Home do. */
  typeLabel: string | null;
  typeVariant: StatusBadgeVariant;
  date: string;
  time: string;
  customerName: string;
  customerPhone: string;
  services: string;
  barber: string;
  amount: string;
  methodLabel: string;
  methodIcon: string;
  statusLabel: string;
  statusVariant: StatusBadgeVariant;
  /** "Refund waiting · EGP 96" — Cancelled / Expired / Missed bookings only. */
  refundText: string | null;
  refundWaiting: boolean;
  /** "EGP 24 fee" — missed bookings only. */
  feeText: string | null;
}

/**
 * BookingsList — the bookings of ONE branch (the first one by default) with period tabs
 * (All / Today / Upcoming / Past), filters, search and paging.
 *
 * The "Today" tab carries the branch's count and a "Refund waiting" chip carries the number of
 * refunds still owed; both come from the backend and ignore the other filters, so they stay put
 * while the user filters. The chip is a one-click shortcut for the refund filter.
 *
 * Read-only: a row opens the details page, where the booking's one action (End session) lives.
 * The booking number is a real link too, so keyboard and screen-reader users can open it.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-bookings-list",
  standalone: true,
  imports: [
    RouterLink,
    TranslateModule,
    PageHeaderComponent,
    TabsComponent,
    SearchInputComponent,
    FilterSelectComponent,
    DateFilterComponent,
    DataTableComponent,
    DataTableColumnDirective,
    DataTableCardDirective,
    StatusBadgeComponent,
    EmptyStateComponent,
    FailedStateComponent,
    AppButtonComponent,
  ],
  templateUrl: "./bookings-list.html",
  styleUrl: "./bookings-list.scss",
})
export class BookingsList implements OnInit {
  private readonly service = inject(BookingsService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  protected readonly panelId = PANEL_ID;

  protected readonly rows = this.service.bookings;
  protected readonly meta = this.service.meta;
  protected readonly query = this.service.query;
  protected readonly tab = this.service.tab;
  protected readonly loading = this.service.loading;
  protected readonly hasError = this.service.hasError;
  protected readonly branchId = this.service.branchId;
  protected readonly noBranches = this.service.noBranches;
  protected readonly counters = this.service.counters;

  /** The table shows its skeleton while the branches or the first page are on their way. */
  protected readonly busy = computed(() => this.loading() || this.service.branchesLoading());

  /** The end date the user typed was before the start date (it was not applied). */
  protected readonly rangeError = signal(false);

  protected readonly tabs = computed<TabItem[]>(() => {
    this.language.currentLang();
    const counters = this.counters();
    return TABS.map(([value, key]) => ({
      value: String(value),
      label: this.translate.instant(key),
      // Only "Today" has a count in the contract; zeros are never shown before a response.
      count: value === BookingTab.Today && counters ? counters.todayCount : null,
    }));
  });

  /** No "all branches" option: the counters and the list belong to exactly one branch. */
  protected readonly branchOptions = computed<FilterOption[]>(() => {
    const lang = this.language.currentLang();
    return this.service
      .branches()
      .map((b) => ({ value: String(b.id), label: localizedName(b, lang) }));
  });

  protected readonly barberOptions = computed<FilterOption[]>(() => {
    this.language.currentLang();
    return [
      { value: "", label: this.translate.instant("BOOKINGS.FILTER.ALL_BARBERS") },
      ...this.service.barbers().map((b) => ({ value: String(b.id), label: b.fullName })),
    ];
  });

  protected readonly typeOptions = computed<FilterOption[]>(() => {
    this.language.currentLang();
    return [
      { value: "", label: this.translate.instant("BOOKINGS.FILTER.ALL_TYPES") },
      ...BOOKING_TYPES.map((t) => ({
        value: String(t),
        label: this.translate.instant(bookingTypeKey(t)),
      })),
    ];
  });

  protected readonly statusOptions = computed<FilterOption[]>(() => {
    this.language.currentLang();
    return [
      { value: "", label: this.translate.instant("BOOKINGS.FILTER.ALL_STATUSES") },
      ...BOOKING_STATUSES.map((s) => ({
        value: String(s),
        label: this.translate.instant(bookingStatusKey(s)),
      })),
    ];
  });

  /** Selected values of the selects, as strings (`""` = all). */
  protected readonly barberValue = computed(() => this.valueOf(this.query().barberId));
  protected readonly typeValue = computed(() => this.valueOf(this.query().type));
  protected readonly statusValue = computed(() => this.valueOf(this.query().statuses?.[0]));

  protected readonly refundWaitingActive = computed(
    () => this.query().refundStatus === RefundStatus.Waiting,
  );
  /** Refunds still owed in the selected branch; `null` before the first response. */
  protected readonly refundWaitingCount = computed(
    () => this.counters()?.refundWaitingCount ?? null,
  );

  /** Any tab other than All, filter or search is active → an empty result means "no matches". */
  protected readonly isFiltered = computed(() => {
    const q = this.query();
    return (
      this.tab() !== BookingTab.All ||
      !!q.search ||
      q.barberId !== undefined ||
      q.type !== undefined ||
      !!q.statuses?.length ||
      !!q.dateFrom ||
      !!q.dateTo ||
      q.refundStatus !== undefined
    );
  });

  protected readonly tableRows = computed<BookingRow[]>(() => {
    const lang = this.language.currentLang();
    const currency = this.translate.instant("SERVICES.CURRENCY");
    return this.rows().map((b) => this.toRow(b, lang, currency));
  });

  /**
   * Screen-reader summary of what the list now shows, spoken (politely) after every load: a tab,
   * filter or branch change otherwise swaps the rows in silence. Empty while loading, so the next
   * result is announced as a change even when the text is the same.
   */
  protected readonly announcement = computed(() => {
    const meta = this.meta();
    if (this.loading() || this.hasError() || meta === null) return "";
    this.language.currentLang();
    return this.translate.instant(
      meta.totalCount === 0 ? "BOOKINGS.RESULTS_NONE" : "BOOKINGS.RESULTS",
      { count: this.rows().length, total: meta.totalCount },
    );
  });

  ngOnInit(): void {
    this.rangeError.set(false);
    this.service.initialize();
  }

  // ── Filtering / paging ───────────────────────────────
  protected onBranch(value: string): void {
    if (value === "") return;
    this.rangeError.set(false);
    this.service.selectBranch(Number(value));
  }

  protected onTab(value: string): void {
    this.service.setTab(Number(value) as BookingTab);
  }

  protected onSearch(term: string): void {
    // Ignore emissions that change nothing (e.g. typing then deleting a trailing space).
    if ((term.trim() || undefined) === this.query().search) return;
    this.service.setFilters({ search: term.trim() || undefined });
  }

  protected onBarber(value: string): void {
    this.service.setFilters({ barberId: value === "" ? undefined : Number(value) });
  }

  protected onType(value: string): void {
    this.service.setFilters({ type: value === "" ? undefined : (Number(value) as BookingType) });
  }

  protected onStatus(value: string): void {
    this.service.setFilters({
      statuses: value === "" ? undefined : [Number(value) as BookingStatus],
    });
  }

  protected toggleRefundWaiting(): void {
    this.service.setFilters({
      refundStatus: this.refundWaitingActive() ? undefined : RefundStatus.Waiting,
    });
  }

  protected onFrom(value: string): void {
    const to = this.query().dateTo;
    this.rangeError.set(false);
    // A start date after the end date: the old end date no longer makes sense, so drop it.
    this.service.setFilters({
      dateFrom: value || undefined,
      dateTo: value && to && to < value ? undefined : to,
    });
  }

  protected onTo(value: string): void {
    const from = this.query().dateFrom;
    if (value && from && value < from) {
      this.rangeError.set(true); // not applied: the API would answer 400
      return;
    }
    this.rangeError.set(false);
    this.service.setFilters({ dateTo: value || undefined });
  }

  protected clearFilters(): void {
    this.rangeError.set(false);
    this.service.clearFilters();
  }

  /** A row (or its booking number) opens the booking's details page. */
  protected open(row: BookingRow): void {
    this.router.navigate(["/main/bookings", row.id]);
  }

  protected onPage(page: number): void {
    this.service.setPage(page);
  }

  protected reload(): void {
    this.service.load();
  }

  // ── Helpers ──────────────────────────────────────────
  private valueOf(value: number | undefined): string {
    return value === undefined ? "" : String(value);
  }

  private toRow(b: BookingListItem, lang: string, currency: string): BookingRow {
    const t = (key: string, params?: object): string => this.translate.instant(key, params);
    const refund = b.refund;

    return {
      id: b.id,
      number: b.bookingNumber,
      typeLabel: b.type === BookingType.Regular ? null : t(bookingTypeKey(b.type)),
      typeVariant: bookingTypeVariant(b.type),
      date: formatBookingDate(b.startAt, lang),
      time: formatBookingTime(b.startAt, lang),
      customerName: b.customer.fullName,
      customerPhone: b.customer.phoneNumber,
      services: bookingItemsLabel(b.items, lang),
      barber: b.barber.fullName,
      amount: formatPrice(b.payment.totalPrice, lang, currency),
      methodLabel: t(paymentMethodKey(b.payment.method)),
      methodIcon: paymentMethodIcon(b.payment.method),
      statusLabel: t(bookingStatusKey(b.status, b.isInProgress)),
      statusVariant: bookingStatusVariant(b.status, b.isInProgress),
      refundText: refund
        ? t("BOOKINGS.REFUND_LINE", {
            status: t(refundStatusKey(refund.status)),
            amount: formatPrice(refund.amount, lang, currency),
          })
        : null,
      refundWaiting: refund?.status === RefundStatus.Waiting,
      feeText:
        refund?.feeAmount != null
          ? t("BOOKINGS.FEE", { amount: formatPrice(refund.feeAmount, lang, currency) })
          : null,
    };
  }
}
