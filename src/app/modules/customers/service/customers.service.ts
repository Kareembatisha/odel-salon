import { Injectable, computed, inject, signal } from "@angular/core";
import { Subscription, catchError, finalize, map, of } from "rxjs";

import { PaginationMeta } from "@shared/model/api_response.model";
import { BranchListItem } from "../../branches/model/branch.model";
import { BranchesService } from "../../branches/service/branches.service";
import { CustomerListItem, CustomerTab, CustomersQuery } from "../model/customer.model";
import { CUSTOMER_REPOSITORY } from "../repository/customer.repository";
import { readCustomerCounters } from "../utils/customer-counters.util";

/** The API's default page size. */
export const CUSTOMERS_PAGE_SIZE = 20;

export type CustomerBranchOption = Pick<BranchListItem, "id" | "nameAr" | "nameEn">;

/**
 * State of the Customers list (`/main/customers`).
 *
 * Unlike Bookings, the branch is OPTIONAL: with none, every customer is listed and the numbers
 * cover all branches ("All branches"); with one, only the customers who booked there are listed
 * and every number counts that branch only. The selected branch is kept between visits; the tab,
 * search and paging are reset every time the page opens (the filter widgets start empty).
 *
 * Every filter change reloads from page 1. Only the latest response may write the rows, so a slow,
 * stale response can't overwrite fresh results; a failure keeps the previous rows and sets
 * `hasError`. The tab counts come with every response and ignore the search; they are `null` until
 * a response brought them (never a misleading 0).
 */
@Injectable({ providedIn: "root" })
export class CustomersService {
  private readonly repository = inject(CUSTOMER_REPOSITORY);
  private readonly branchesService = inject(BranchesService);

  private readonly _customers = signal<CustomerListItem[]>([]);
  private readonly _meta = signal<PaginationMeta | null>(null);
  private readonly _query = signal<CustomersQuery>(this.freshQuery());
  private readonly _branches = signal<CustomerBranchOption[]>([]);
  private readonly _branchId = signal<number | null>(null);
  private readonly _loading = signal(false);
  private readonly _branchesLoading = signal(false);
  private readonly _hasError = signal(false);

  private branchesLoaded = false;

  /** In-flight list request — a newer one cancels it. Paired with {@link requestId}. */
  private inFlight?: Subscription;
  private requestId = 0;

  readonly customers = this._customers.asReadonly();
  readonly meta = this._meta.asReadonly();
  readonly query = this._query.asReadonly();
  readonly branches = this._branches.asReadonly();
  /** The selected branch, or `null` for "All branches". */
  readonly branchId = this._branchId.asReadonly();
  /**
   * The list is loading: from the moment the page opens — while the branch options are still on
   * their way, before the first list request even starts — until its response arrives. The page
   * shows its skeleton for this whole span, so the empty state can only ever mean "loaded, and
   * there is genuinely nothing".
   */
  readonly loading = computed(() => this._loading() || this._branchesLoading());
  readonly hasError = this._hasError.asReadonly();

  readonly tab = computed(() => this._query().tab ?? CustomerTab.All);
  readonly totalCount = computed(() => this._meta()?.totalCount ?? 0);

  /** The count of every tab; `null` before the first response. */
  readonly counters = computed(() => {
    const meta = this._meta();
    return meta === null ? null : readCustomerCounters(meta);
  });

  /**
   * Called every time the page opens: resets the tab, search and paging (only the branch is kept),
   * loads the branch options once, drops a selected branch that is gone, and loads the customers.
   */
  initialize(): void {
    const q = this._query();
    const wasFiltered =
      q.pageNumber !== 1 || (q.tab ?? CustomerTab.All) !== CustomerTab.All || !!q.search;
    this._query.set(this.freshQuery());
    // Only then: an unfiltered list can stay on screen while it refreshes, instead of flashing empty.
    if (wasFiltered) this._customers.set([]);

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

  /** Request a page of customers (of the selected branch, or of all of them). */
  load(): void {
    const currentRequest = ++this.requestId;

    this.inFlight?.unsubscribe();
    this._loading.set(true);
    this._hasError.set(false);
    this.inFlight = this.repository
      .getCustomers({ ...this._query(), branchId: this._branchId() ?? undefined })
      .pipe(
        map((res) => {
          if (!res.status) throw new Error(res.message);
          return res;
        }),
        catchError(() => {
          this._hasError.set(true);
          return of(null);
        }),
        finalize(() => {
          if (currentRequest === this.requestId) this._loading.set(false);
        }),
      )
      .subscribe((res) => {
        if (!res) return;
        this._customers.set(res.data ?? []);
        this._meta.set(res.meta);
      });
  }

  /** Show one branch's customers, or all of them (`null`). Its rows and counts replace the old ones. */
  selectBranch(branchId: number | null): void {
    if (branchId === this._branchId()) return;

    this._branchId.set(branchId);
    this._query.update((q) => ({ ...q, pageNumber: 1 }));
    this._customers.set([]);
    this._meta.set(null);
    this.load();
  }

  setTab(tab: CustomerTab): void {
    this._query.update((q) => ({ ...q, tab, pageNumber: 1 }));
    this.load();
  }

  /** A blank search clears it. */
  setSearch(search: string): void {
    this._query.update((q) => ({ ...q, search: search.trim() || undefined, pageNumber: 1 }));
    this.load();
  }

  /** Jump to a page and reload. The pager owns the upper bound. */
  setPage(pageNumber: number): void {
    this._query.update((q) => ({ ...q, pageNumber }));
    this.load();
  }

  /** Back to the plain list: tab All, no search, page 1 (the branch stays). */
  clearFilters(): void {
    this._query.set(this.freshQuery());
    this.load();
  }

  // ----------------------------------------------------------
  // Private
  // ----------------------------------------------------------

  private freshQuery(): CustomersQuery {
    return { pageNumber: 1, pageSize: CUSTOMERS_PAGE_SIZE, tab: CustomerTab.All };
  }

  /** Keep the selected branch if it still exists, otherwise fall back to "All branches"; then load. */
  private ensureBranchAndLoad(): void {
    const current = this._branchId();
    if (current !== null && !this._branches().some((b) => b.id === current)) {
      this._branchId.set(null);
      this._customers.set([]);
      this._meta.set(null);
    }
    this.load();
  }
}
