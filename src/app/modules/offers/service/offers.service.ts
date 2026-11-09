import { Injectable, computed, inject, signal } from "@angular/core";
import { Observable, Subscription, catchError, finalize, map, of, tap } from "rxjs";

import { NotificationService } from "@core/services/notification.service";
import { ApiResponse, PaginationMeta } from "@shared/model/api_response.model";
import { CARD_PAGE_SIZE } from "@shared/model/pagination.constants";
import { BranchListItem } from "@modules/branches/model/branch.model";
import { BranchesService } from "@modules/branches/service/branches.service";
import {
  CreateOfferPayload,
  DeleteOffersRequest,
  OfferDetails,
  OfferListItem,
  OffersQuery,
  UpdateOfferPayload,
} from "../model/offer.model";
import { OFFER_REPOSITORY } from "../repository/offer.repository";
import { isOfferStopped } from "../utils/offer-labels.util";
import { OfferTab, statusesForTab } from "../utils/offer-status.util";
import { readOffersSummary } from "../utils/offer-summary.util";

// ============================================================
// Constants
// ============================================================

/** A branch as the selector and the form need it. */
export type OfferBranchOption = Pick<BranchListItem, "id" | "nameAr" | "nameEn">;

type ListQuery = Omit<OffersQuery, "branchId" | "statuses">;

// ============================================================
// Service
// ============================================================

/**
 * OffersService — state of the Offers screen: the branch selector, the status tab (with the
 * counts of every tab), the offers of the selected branch (server-side search / paging) and
 * every offer mutation, including stop / resume.
 *
 * Same shape as {@link PackagesService}: the API lists ONE branch at a time, so
 * {@link initialize} selects the FIRST branch by default (no "all branches" view). Mutations
 * resolve to a plain result (`id` / `true` on success, `null` / `false` on failure); the
 * service toasts a localized success message, failures were already explained by the error
 * interceptor.
 *
 * Tabs: All = no `statuses`; Active = [0]; Scheduled = [1]; Ended or full = [2, 3, 4].
 * The tab counts come from `meta.additionalData` and always cover the WHOLE branch.
 */
@Injectable({ providedIn: "root" })
export class OffersService {
  // ----------------------------------------------------------
  // Injected Dependencies
  // ----------------------------------------------------------

  private readonly repository = inject(OFFER_REPOSITORY);
  private readonly branchesService = inject(BranchesService);
  private readonly notify = inject(NotificationService);

  // ----------------------------------------------------------
  // Private State
  // ----------------------------------------------------------

  private readonly _offers = signal<OfferListItem[]>([]);
  private readonly _meta = signal<PaginationMeta | null>(null);
  private readonly _branches = signal<OfferBranchOption[]>([]);
  private readonly _branchId = signal<number | null>(null);
  private readonly _tab = signal<OfferTab>("all");
  private readonly _query = signal<ListQuery>({ pageNumber: 1, pageSize: CARD_PAGE_SIZE });
  private readonly _loading = signal(false);
  private readonly _branchesLoading = signal(false);
  private readonly _hasError = signal(false);
  /** Mutations in flight. A counter (not a boolean) so one finishing can't clear `saving` while another is still running. */
  private readonly pendingMutations = signal(0);

  private branchesLoaded = false;

  /** Newest request wins; the id stops an obsolete request's `finalize` clearing `loading`. */
  private inFlight?: Subscription;
  private requestId = 0;

  // ----------------------------------------------------------
  // Public Read-Only State
  // ----------------------------------------------------------

  readonly offers = this._offers.asReadonly();
  readonly meta = this._meta.asReadonly();
  /** Branches for the selector, oldest first (ascending id). */
  readonly branches = this._branches.asReadonly();
  readonly branchId = this._branchId.asReadonly();
  /** The active status tab. */
  readonly tab = this._tab.asReadonly();
  readonly query = this._query.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly branchesLoading = this._branchesLoading.asReadonly();
  readonly hasError = this._hasError.asReadonly();
  /** A mutation (create / update / toggle / delete) is in flight. */
  readonly saving = computed(() => this.pendingMutations() > 0);

  readonly selectedBranch = computed(
    () => this._branches().find((b) => b.id === this._branchId()) ?? null,
  );

  /** Options loaded, but the salon has no branches — nothing can be offered yet. */
  readonly noBranches = computed(
    () => !this._branchesLoading() && this.branchesLoaded && this._branches().length === 0,
  );

  /** The tab counts: whole branch, independent of search and of the selected tab. */
  readonly summary = computed(() => readOffersSummary(this._meta()));

  // ----------------------------------------------------------
  // Initialization & List Commands
  // ----------------------------------------------------------

  /**
   * Prepare the screen: reset search, tab and paging (the widgets start empty / on "All"),
   * load the branch options once, select the first branch when none is selected (or the
   * selected one vanished), then load its offers. The selected branch is kept between visits.
   */
  initialize(): void {
    this._query.set({ pageNumber: 1, pageSize: CARD_PAGE_SIZE });
    this._tab.set("all");

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
   * Issue a list request for the current branch + tab + query. Only the latest response may
   * write `offers` / `meta` or clear `loading`. A failure sets `hasError` but keeps the
   * previous rows. Does nothing until a branch is selected.
   */
  load(): void {
    const branchId = this._branchId();
    if (branchId === null) return;

    const currentRequest = ++this.requestId;

    this.inFlight?.unsubscribe();
    this._loading.set(true);
    this._hasError.set(false);
    this.inFlight = this.repository
      .getOffers({ ...this._query(), branchId, statuses: statusesForTab(this._tab()) })
      .pipe(
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
        this._offers.set(res.data ?? []);
        this._meta.set(res.meta);
      });
  }

  /**
   * Show another branch's offers. Search and tab are kept, paging restarts at 1, and the
   * previous branch's rows and counts are cleared right away.
   */
  selectBranch(branchId: number): void {
    if (branchId === this._branchId()) return;

    this._branchId.set(branchId);
    this._query.update((q) => ({ ...q, pageNumber: 1 }));
    this._offers.set([]);
    this._meta.set(null);
    this.load();
  }

  /** Switch the status tab and reload from page 1. Clicking the current tab does nothing. */
  setTab(tab: OfferTab): void {
    if (tab === this._tab()) return;

    this._tab.set(tab);
    this._query.update((q) => ({ ...q, pageNumber: 1 }));
    this.load();
  }

  /** Apply a search (empty / `undefined` clears it) and reload from page 1. */
  setSearch(search: string | undefined): void {
    this._query.update((q) => ({ ...q, search: search?.trim() || undefined, pageNumber: 1 }));
    this.load();
  }

  /** Jump to a page and reload. The pager owns the upper bound. */
  setPage(pageNumber: number): void {
    this._query.update((q) => ({ ...q, pageNumber }));
    this.load();
  }

  // ----------------------------------------------------------
  // Detail
  // ----------------------------------------------------------

  /** One offer, or `null` when it can't be loaded (error already toasted / `status: false`). */
  getOffer(id: number): Observable<OfferDetails | null> {
    return this.repository.getOfferById(id).pipe(
      map((res) => (res.status ? res.data : null)),
      catchError(() => of(null)),
    );
  }

  // ----------------------------------------------------------
  // Mutations
  // ----------------------------------------------------------

  /** Create an offer → its new id, or `null` on failure; reloads the list. */
  createOffer(payload: CreateOfferPayload): Observable<number | null> {
    return this.mutate(this.repository.createOffer(payload), () => "OFFERS.CREATED").pipe(
      map((res) => res?.data ?? null),
      tap((id) => id !== null && this.load()),
    );
  }

  /** Update an offer (fields, services, prices, banner) → `true` on success; reloads the list. */
  updateOffer(id: number, payload: UpdateOfferPayload): Observable<boolean> {
    return this.mutate(this.repository.updateOffer(id, payload), () => "OFFERS.UPDATED").pipe(
      map((res) => res !== null),
      tap((ok) => ok && this.load()),
    );
  }

  /**
   * Stop a running offer / resume a stopped one → `true` on success; reloads the list (and the
   * tab counts). The toast says which one happened, decided from the offer's status at the
   * moment of the call. Resuming can be refused (a service is no longer active in the branch,
   * or the home price is no longer allowed).
   */
  toggleStatus(id: number): Observable<boolean> {
    const offer = this._offers().find((o) => o.id === id);
    const successKey = offer && isOfferStopped(offer) ? "OFFERS.RESUMED" : "OFFERS.STOPPED";

    return this.mutate(this.repository.toggleOfferStatus(id), () => successKey).pipe(
      map((res) => res !== null),
      tap((ok) => ok && this.load()),
    );
  }

  /** Permanently delete offers (all-or-nothing, banners too) → `true` on success; reloads the list. */
  remove(ids: number[]): Observable<boolean> {
    const payload: DeleteOffersRequest = { ids };

    return this.mutate(this.repository.deleteOffers(payload), () => "OFFERS.DELETED").pipe(
      map((res) => res !== null),
      tap((ok) => ok && this.reloadAfterRemoval(ids.length)),
    );
  }

  // ----------------------------------------------------------
  // Internals
  // ----------------------------------------------------------

  private ensureBranchAndLoad(): void {
    const options = this._branches();
    const stillThere = options.some((b) => b.id === this._branchId());

    if (!stillThere) {
      this._branchId.set(options[0]?.id ?? null);
      this._query.update((q) => ({ ...q, pageNumber: 1 }));
      this._offers.set([]);
      this._meta.set(null);
    }
    this.load();
  }

  /** If the delete emptied the current page, step back one page first. */
  private reloadAfterRemoval(removed: number): void {
    const pageEmptied = this._offers().length <= removed && this._query().pageNumber > 1;
    if (pageEmptied) this._query.update((q) => ({ ...q, pageNumber: q.pageNumber - 1 }));
    this.load();
  }

  /**
   * Runs a mutation with the `saving` flag, toasts our own i18n success key (the backend
   * message is English-only) and turns every failure into `null`. A `status: false` body
   * counts as a failure too.
   */
  private mutate<T>(
    request: Observable<ApiResponse<T>>,
    successKey: () => string,
  ): Observable<ApiResponse<T> | null> {
    this.pendingMutations.update((n) => n + 1);

    return request.pipe(
      map((res) => {
        if (!res.status) throw new Error(res.message);
        return res;
      }),
      tap(() => this.notify.success(successKey())),
      catchError(() => of(null)),
      finalize(() => this.pendingMutations.update((n) => n - 1)),
    );
  }
}
