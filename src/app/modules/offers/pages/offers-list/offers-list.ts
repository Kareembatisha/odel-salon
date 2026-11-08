import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { forkJoin } from "rxjs";

import { PERMISSIONS } from "@core/auth/permissions";
import { LanguageService } from "@core/services/language.service";
import { AuthService } from "../../../auth/service/auth.service";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { ConfirmModalComponent } from "@shared/components/confirm-modal/confirm-modal.component";
import { DrawerComponent } from "@shared/components/drawer/drawer.component";
import { EmptyStateComponent } from "@shared/components/empty-state/empty-state.component";
import { FailedStateComponent } from "@shared/components/failed-state/failed-state.component";
import {
  FilterOption,
  FilterSelectComponent,
} from "@shared/components/filter-select/filter-select.component";
import { PageHeaderComponent } from "@shared/components/page-header/page-header.component";
import { PaginationComponent } from "@shared/components/pagination/pagination.component";
import { SearchInputComponent } from "@shared/components/search-input/search-input.component";
import { SkeletonComponent } from "@shared/components/skeleton/skeleton.component";
import { TabItem, TabsComponent } from "@shared/components/tabs/tabs.component";
import { localizedName } from "../../../packages/utils/package-labels.util";
import { ServiceOption } from "../../../services/model/service.model";
import { ServicesService } from "../../../services/service/services.service";
import { OfferCard } from "../../components/offer-card/offer-card";
import { OfferForm } from "../../components/offer-form/offer-form";
import {
  CreateOfferPayload,
  OfferDetails,
  OfferListItem,
  UpdateOfferPayload,
} from "../../model/offer.model";
import { OffersService } from "../../service/offers.service";
import { OFFER_TABS, OfferTab } from "../../utils/offer-status.util";
import { tabCount } from "../../utils/offer-summary.util";

/** Placeholder cards while the first page loads. */
const SKELETON_CARDS = 6;

/** `OFFERS.TABS.*` key of each tab. */
const TAB_KEYS: Record<OfferTab, string> = {
  all: "OFFERS.TABS.ALL",
  active: "OFFERS.TABS.ACTIVE",
  scheduled: "OFFERS.TABS.SCHEDULED",
  endedOrFull: "OFFERS.TABS.ENDED_OR_FULL",
};

/** The one panel the tabs control (`aria-controls` / `aria-labelledby`). */
const PANEL_ID = "offers-panel";

/**
 * OffersList — the offers of ONE branch (the first branch by default) as cards, with status
 * tabs (each with its count), search and paging.
 *
 * Tab counts come from the backend over the WHOLE branch and ignore the search, so a search
 * that matches nothing still shows the real totals on the tabs.
 *
 * Create / edit happen in a drawer on this page (same as Packages). The drawer needs the branch's
 * active services for the picker, so it loads them (and, for edit, the offer) before showing the form.
 *
 * Permissions: View (route), Create (header button), Edit (edit button + Stop / Resume — the
 * contract has no separate permission), Delete. Business rules live in the backend; its 400 / 404
 * messages reach the user as interceptor toasts.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-offers-list",
  standalone: true,
  imports: [
    TranslateModule,
    PageHeaderComponent,
    TabsComponent,
    SearchInputComponent,
    FilterSelectComponent,
    PaginationComponent,
    EmptyStateComponent,
    ConfirmModalComponent,
    DrawerComponent,
    AppButtonComponent,
    FailedStateComponent,
    SkeletonComponent,
    OfferCard,
    OfferForm,
  ],
  templateUrl: "./offers-list.html",
  styleUrl: "./offers-list.scss",
})
export class OffersList implements OnInit {
  private readonly offersService = inject(OffersService);
  private readonly servicesService = inject(ServicesService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly panelId = PANEL_ID;
  protected readonly skeletons = Array.from({ length: SKELETON_CARDS }, (_, i) => i);

  protected readonly rows = this.offersService.offers;
  protected readonly meta = this.offersService.meta;
  protected readonly summary = this.offersService.summary;
  protected readonly tab = this.offersService.tab;
  protected readonly loading = this.offersService.loading;
  protected readonly saving = this.offersService.saving;
  protected readonly hasError = this.offersService.hasError;
  protected readonly query = this.offersService.query;
  protected readonly branchId = this.offersService.branchId;
  protected readonly noBranches = this.offersService.noBranches;

  /** Lazy on purpose (same as PackagesList): every flag is a `computed`. */
  protected readonly canCreate = computed(() => this.auth.hasPermission(PERMISSIONS.Offer.Create));
  protected readonly canEdit = computed(() => this.auth.hasPermission(PERMISSIONS.Offer.Edit));
  /** Stop / Resume is gated by Edit too. */
  protected readonly canToggle = this.canEdit;
  protected readonly canDelete = computed(() => this.auth.hasPermission(PERMISSIONS.Offer.Delete));

  /** Skeleton cards only while there is nothing to show yet; a reload keeps the cards in place. */
  protected readonly showSkeleton = computed(() => this.loading() && this.rows().length === 0);

  /** Tabs show real counts only once a response brought them (never misleading zeros). */
  protected readonly tabs = computed<TabItem[]>(() => {
    this.language.currentLang();
    const counts = this.meta() !== null ? this.summary() : null;
    return OFFER_TABS.map((value) => ({
      value,
      label: this.translate.instant(TAB_KEYS[value]),
      count: counts ? tabCount(counts, value) : null,
    }));
  });

  /** No "all branches" option: an offer lives in exactly one branch. */
  protected readonly branchOptions = computed<FilterOption[]>(() => {
    const lang = this.language.currentLang();
    return this.offersService
      .branches()
      .map((b) => ({ value: String(b.id), label: localizedName(b.nameAr, b.nameEn, lang) }));
  });

  /** A search or a tab other than "All" is active → an empty result means "no matches". */
  protected readonly isFiltered = computed(() => !!this.query().search || this.tab() !== "all");

  /** The selected branch's name: the form shows where the offer goes. */
  protected readonly branchName = computed(() => {
    const branch = this.offersService.selectedBranch();
    return branch ? localizedName(branch.nameAr, branch.nameEn, this.language.currentLang()) : "";
  });

  /**
   * Screen-reader summary of what the list now shows, spoken (politely) after every load: a tab,
   * search or branch change otherwise swaps the cards in silence. Empty while loading, so the next
   * result is announced as a change even when the text is the same.
   */
  protected readonly announcement = computed(() => {
    const meta = this.meta();
    if (this.loading() || this.hasError() || meta === null) return "";
    this.language.currentLang();
    return this.translate.instant(
      meta.totalCount === 0 ? "OFFERS.RESULTS_NONE" : "OFFERS.RESULTS",
      { count: this.rows().length, total: meta.totalCount },
    );
  });

  // ── Create / edit drawer ─────────────────────────────
  protected readonly drawerOpen = signal(false);
  protected readonly drawerMode = signal<"create" | "edit">("create");
  protected readonly drawerLoading = signal(false);
  protected readonly editDetails = signal<OfferDetails | null>(null);
  /** The active services the picker offers for the drawer's branch. */
  protected readonly serviceOptions = signal<ServiceOption[]>([]);
  /** Branch of the offer being created / edited (create: the selected one, edit: the offer's own). */
  protected readonly drawerBranchId = signal<number | null>(null);

  /** Bumped on every open / close so a slow response for a drawer that was closed or replaced is dropped. */
  private drawerToken = 0;

  // ── Delete ───────────────────────────────────────────
  protected readonly pendingDelete = signal<OfferListItem | null>(null);
  protected readonly deleteName = computed(() => {
    const offer = this.pendingDelete();
    return offer ? localizedName(offer.nameAr, offer.nameEn, this.language.currentLang()) : "";
  });

  /** A mutation may remove the card that had focus (stopped / deleted / edited out of the tab). */
  private focusCheckPending = false;

  constructor() {
    // Once the reload after a mutation has finished, make sure keyboard focus didn't fall to <body>.
    effect(() => {
      if (this.loading() || !this.focusCheckPending) return;
      untracked(() => {
        this.focusCheckPending = false;
        this.keepFocusOnPage();
      });
    });
  }

  ngOnInit(): void {
    this.pendingDelete.set(null);
    this.drawerOpen.set(false);
    this.offersService.initialize();
  }

  // ── Filtering / paging ───────────────────────────────
  protected onBranch(value: string): void {
    if (value !== "") this.offersService.selectBranch(Number(value));
  }

  protected onTab(value: string): void {
    this.offersService.setTab(value as OfferTab);
  }

  protected onSearch(term: string): void {
    // Ignore emissions that change nothing (e.g. typing then deleting a trailing space).
    if ((term.trim() || undefined) === this.query().search) return;
    this.offersService.setSearch(term);
  }

  protected onPage(page: number): void {
    this.offersService.setPage(page);
  }

  protected reload(): void {
    this.offersService.load();
  }

  // ── Create / edit ────────────────────────────────────
  protected openCreate(): void {
    const branchId = this.branchId();
    if (branchId === null) return;

    const token = ++this.drawerToken;
    this.drawerMode.set("create");
    this.drawerBranchId.set(branchId);
    this.editDetails.set(null);
    this.serviceOptions.set([]);
    this.drawerLoading.set(true);
    this.drawerOpen.set(true);

    this.servicesService.loadServiceOptions(branchId).subscribe((options) => {
      if (token !== this.drawerToken) return; // closed or replaced meanwhile
      this.serviceOptions.set(options);
      this.drawerLoading.set(false);
    });
  }

  protected openEdit(offer: OfferListItem): void {
    if (!this.canEdit()) return;

    const token = ++this.drawerToken;
    this.drawerMode.set("edit");
    this.drawerBranchId.set(offer.branchId);
    this.editDetails.set(null);
    this.serviceOptions.set([]);
    this.drawerLoading.set(true);
    this.drawerOpen.set(true);

    forkJoin({
      details: this.offersService.getOffer(offer.id),
      options: this.servicesService.loadServiceOptions(offer.branchId),
    }).subscribe(({ details, options }) => {
      if (token !== this.drawerToken) return;
      if (!details) {
        // Gone or unreadable — the interceptor already showed why.
        this.drawerLoading.set(false);
        this.drawerOpen.set(false);
        return;
      }
      this.editDetails.set(details);
      this.serviceOptions.set(options);
      this.drawerLoading.set(false);
    });
  }

  /**
   * Called after a successful mutation. If the card the user acted on is gone once the list
   * reloaded (e.g. "Stop" on the Active tab), focus moves to the offers panel instead of being lost.
   */
  private keepFocusAfterReload(): void {
    this.focusCheckPending = true;
  }

  private keepFocusOnPage(): void {
    // The drawer / dialog restore their own focus on a timer; check after it has run.
    afterNextRender(
      () =>
        setTimeout(() => {
          const active = document.activeElement;
          if (active && active !== document.body && this.host.nativeElement.contains(active))
            return;
          this.host.nativeElement.querySelector<HTMLElement>(`#${this.panelId}`)?.focus();
        }),
      { injector: this.injector },
    );
  }

  protected closeDrawer(): void {
    this.drawerToken++;
    this.drawerOpen.set(false);
  }

  protected onSubmitted(payload: CreateOfferPayload | UpdateOfferPayload): void {
    if (this.drawerMode() === "create") {
      this.offersService.createOffer(payload as CreateOfferPayload).subscribe((id) => {
        if (id === null) return;
        this.keepFocusAfterReload();
        this.closeDrawer();
      });
      return;
    }

    const id = this.editDetails()?.id;
    if (id === undefined) return;
    this.offersService.updateOffer(id, payload as UpdateOfferPayload).subscribe((ok) => {
      if (!ok) return;
      this.keepFocusAfterReload();
      this.closeDrawer();
    });
  }

  // ── Stop / Resume ────────────────────────────────────
  /** A refused resume (a service is no longer active…) changes nothing; the interceptor shows why. */
  protected toggle(offer: OfferListItem): void {
    if (this.saving()) return;
    this.offersService.toggleStatus(offer.id).subscribe((ok) => ok && this.keepFocusAfterReload());
  }

  // ── Delete ───────────────────────────────────────────
  protected askDelete(offer: OfferListItem): void {
    this.pendingDelete.set(offer);
  }

  protected confirmDelete(): void {
    const offer = this.pendingDelete();
    if (!offer) return;

    this.offersService.remove([offer.id]).subscribe((ok) => {
      if (!ok) return;
      this.keepFocusAfterReload();
      this.pendingDelete.set(null);
    });
  }
}
