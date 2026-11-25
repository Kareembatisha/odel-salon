import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from "@angular/core";
import { Router } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";

import { LanguageService } from "@core/services/language.service";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { AvatarComponent } from "@shared/components/avatar/avatar.component";
import {
  DataTableCardDirective,
  DataTableColumnDirective,
  DataTableComponent,
} from "@shared/components/data-table/data-table.component";
import { FailedStateComponent } from "@shared/components/failed-state/failed-state.component";
import {
  FilterOption,
  FilterSelectComponent,
} from "@shared/components/filter-select/filter-select.component";
import { PageHeaderComponent } from "@shared/components/page-header/page-header.component";
import { SearchInputComponent } from "@shared/components/search-input/search-input.component";
import { TabItem, TabsComponent } from "@shared/components/tabs/tabs.component";
import { formatBookingDate } from "../../../bookings/utils/booking-dates.util";
import { localizedName } from "../../../barbers/utils/barber-labels.util";
import { cairoToday } from "../../../offers/utils/offer-dates.util";
import { CustomerListItem, CustomerTab } from "../../model/customer.model";
import { CustomersService } from "../../service/customers.service";
import { CUSTOMER_TABS, lastVisitKey, lastVisitOf } from "../../utils/customer-labels.util";

/** The one panel the tabs control (`aria-controls` / `aria-labelledby`). */
const PANEL_ID = "customers-panel";

/** Value of the "All branches" option (the API takes no branch then). */
const ALL_BRANCHES = "";

/** Everything one table row / card shows, worked out once per response and language. */
export interface CustomerRow {
  id: number;
  name: string;
  phone: string;
  visits: string;
  /** "Never", "Today", "Yesterday" or a date. */
  lastVisit: string;
  missed: string;
  /** At least one no-show: the count is highlighted. */
  hasMissed: boolean;
}

/**
 * CustomersList — the salon's customers (the app users who registered), with four tabs (All /
 * Visited this month / Has missed bookings / Not back in 60 days), a branch filter that defaults to
 * ALL branches, a name / phone search and paging. Every tab carries its count for the selected
 * branch; the counts ignore the search.
 *
 * Read-only: a row opens the customer's profile (`Customer.View`).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-customers-list",
  standalone: true,
  imports: [
    TranslateModule,
    PageHeaderComponent,
    TabsComponent,
    SearchInputComponent,
    FilterSelectComponent,
    DataTableComponent,
    DataTableColumnDirective,
    DataTableCardDirective,
    AvatarComponent,
    FailedStateComponent,
    AppButtonComponent,
  ],
  templateUrl: "./customers-list.html",
  styleUrl: "./customers-list.scss",
})
export class CustomersList implements OnInit {
  private readonly service = inject(CustomersService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  protected readonly panelId = PANEL_ID;

  protected readonly rows = this.service.customers;
  protected readonly meta = this.service.meta;
  protected readonly query = this.service.query;
  protected readonly tab = this.service.tab;
  protected readonly loading = this.service.loading;
  protected readonly hasError = this.service.hasError;
  protected readonly counters = this.service.counters;

  protected readonly tabs = computed<TabItem[]>(() => {
    this.language.currentLang();
    const counters = this.counters();
    const counts: Record<CustomerTab, number | null> = {
      [CustomerTab.All]: counters?.allCount ?? null,
      [CustomerTab.VisitedThisMonth]: counters?.visitedThisMonthCount ?? null,
      [CustomerTab.HasMissedBookings]: counters?.hasMissedBookingsCount ?? null,
      [CustomerTab.NotBackIn60Days]: counters?.notBackIn60DaysCount ?? null,
    };
    // A count is never shown before a response (no misleading 0).
    return CUSTOMER_TABS.map(([value, key]) => ({
      value: String(value),
      label: this.translate.instant(key),
      count: counts[value],
    }));
  });

  protected readonly branchOptions = computed<FilterOption[]>(() => {
    const lang = this.language.currentLang();
    return [
      { value: ALL_BRANCHES, label: this.translate.instant("CUSTOMERS.FILTER.ALL_BRANCHES") },
      ...this.service
        .branches()
        .map((b) => ({ value: String(b.id), label: localizedName(b, lang) })),
    ];
  });

  protected readonly branchValue = computed(() => {
    const id = this.service.branchId();
    return id === null ? ALL_BRANCHES : String(id);
  });

  /** A tab other than All or a search is active → an empty result means "no matches". */
  protected readonly isFiltered = computed(
    () => this.tab() !== CustomerTab.All || !!this.query().search,
  );

  protected readonly tableRows = computed<CustomerRow[]>(() => {
    const lang = this.language.currentLang();
    const today = cairoToday();
    return this.rows().map((c) => this.toRow(c, lang, today));
  });

  /** Screen-reader summary of what the list now shows, spoken (politely) after every load. */
  protected readonly announcement = computed(() => {
    const meta = this.meta();
    if (this.loading() || this.hasError() || meta === null) return "";
    this.language.currentLang();
    return this.translate.instant(
      meta.totalCount === 0 ? "CUSTOMERS.RESULTS_NONE" : "CUSTOMERS.RESULTS",
      {
        count: this.rows().length,
        total: meta.totalCount,
      },
    );
  });

  ngOnInit(): void {
    this.service.initialize();
  }

  // ── Filtering / paging ───────────────────────────────
  protected onTab(value: string): void {
    this.service.setTab(Number(value) as CustomerTab);
  }

  protected onBranch(value: string): void {
    this.service.selectBranch(value === ALL_BRANCHES ? null : Number(value));
  }

  protected onSearch(term: string): void {
    // Ignore emissions that change nothing (e.g. typing then deleting a trailing space).
    if ((term.trim() || undefined) === this.query().search) return;
    this.service.setSearch(term);
  }

  protected clearFilters(): void {
    this.service.clearFilters();
  }

  protected onPage(page: number): void {
    this.service.setPage(page);
  }

  protected reload(): void {
    this.service.load();
  }

  /** A row opens the customer's profile. */
  protected open(row: CustomerRow): void {
    this.router.navigate(["/main/customers", row.id]);
  }

  // ── Helpers ──────────────────────────────────────────
  private toRow(c: CustomerListItem, lang: string, today: string): CustomerRow {
    const number = (value: number): string =>
      new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US").format(value);
    const visit = lastVisitOf(c.lastVisitDate, today);

    return {
      id: c.id,
      name: c.fullName,
      phone: c.phoneNumber,
      visits: number(c.visitsCount),
      lastVisit:
        visit.kind === "date"
          ? formatBookingDate(`${visit.day}T00:00:00`, lang)
          : this.translate.instant(lastVisitKey(visit)),
      missed: number(c.missedCount),
      hasMissed: c.missedCount > 0,
    };
  }
}
