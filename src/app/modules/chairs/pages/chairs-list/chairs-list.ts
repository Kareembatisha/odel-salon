import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { TranslateModule, TranslateService } from "@ngx-translate/core";

import { PERMISSIONS } from "@core/auth/permissions";
import { LanguageService } from "@core/services/language.service";
import { AuthService } from "../../../auth/service/auth.service";
import { BranchesService } from "../../../branches/service/branches.service";
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
import { StatCardComponent } from "@shared/components/stat-card/stat-card.component";
import { ChairCard } from "../../components/chair-card/chair-card";
import { ChairForm } from "../../components/chair-form/chair-form";
import {
  ChairBranchOption,
  ChairDetails,
  ChairListItem,
  ChairType,
  CreateChairPayload,
  UpdateChairPayload,
} from "../../model/chair.model";
import { ChairsService } from "../../service/chairs.service";
import { localizedName } from "../../utils/chair-labels.util";

/** Placeholder cards while the first page loads. */
const SKELETON_CARDS = 8;
/** Placeholder stat cards shown until the first response brings the summary. */
const SKELETON_STATS = [0, 1, 2];

/**
 * ChairsList — chair cards (same grid as Branches) with summary cards, filters, paging and a
 * create / edit drawer.
 *
 * Permissions: View (route), Create (header button), Edit (edit + change type),
 * ToggleStatus (the availability switch — separate from Edit so reception can flip chairs
 * only), Delete. Business rules (unique name per branch, the last-active-chair lock) live in
 * the backend; its 400 / 409 messages reach the user as interceptor toasts.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-chairs-list",
  standalone: true,
  imports: [
    TranslateModule,
    PageHeaderComponent,
    AppButtonComponent,
    SearchInputComponent,
    FilterSelectComponent,
    StatCardComponent,
    PaginationComponent,
    EmptyStateComponent,
    DrawerComponent,
    ConfirmModalComponent,
    FailedStateComponent,
    SkeletonComponent,
    ChairCard,
    ChairForm,
  ],
  templateUrl: "./chairs-list.html",
  styleUrl: "./chairs-list.scss",
})
export class ChairsList implements OnInit {
  private readonly chairsService = inject(ChairsService);
  private readonly branchesService = inject(BranchesService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  protected readonly skeletons = Array.from({ length: SKELETON_CARDS }, (_, i) => i);
  protected readonly skeletonStats = SKELETON_STATS;

  protected readonly rows = this.chairsService.chairs;
  protected readonly meta = this.chairsService.meta;
  protected readonly summary = this.chairsService.summary;
  protected readonly loading = this.chairsService.loading;
  protected readonly saving = this.chairsService.saving;
  protected readonly hasError = this.chairsService.hasError;
  protected readonly query = this.chairsService.query;

  /**
   * Lazy on purpose (same as BranchesList): reading PERMISSIONS in a field initializer comes back
   * undefined in combined test runs, so every flag is a `computed`.
   */
  protected readonly canCreate = computed(() => this.auth.hasPermission(PERMISSIONS.Chair.Create));
  protected readonly canEdit = computed(() => this.auth.hasPermission(PERMISSIONS.Chair.Edit));
  protected readonly canToggle = computed(() =>
    this.auth.hasPermission(PERMISSIONS.Chair.ToggleStatus),
  );
  protected readonly canDelete = computed(() => this.auth.hasPermission(PERMISSIONS.Chair.Delete));

  /**
   * Skeleton cards only while there is nothing to show yet. A reload with rows on screen
   * (after a toggle, a filter change…) keeps the cards in place instead of flashing placeholders.
   */
  protected readonly showSkeleton = computed(() => this.loading() && this.rows().length === 0);

  // ── Filters ──────────────────────────────────────────
  protected readonly branchList = signal<ChairBranchOption[]>([]);

  protected readonly branchFilterOptions = computed<FilterOption[]>(() => {
    const lang = this.language.currentLang();
    return [
      { value: "", label: this.translate.instant("CHAIRS.FILTER.ALL_BRANCHES") },
      ...this.branchList().map((b) => ({
        value: String(b.id),
        label: localizedName(b.nameAr, b.nameEn, lang),
      })),
    ];
  });

  protected readonly typeFilterOptions = computed<FilterOption[]>(() => {
    this.language.currentLang();
    return [
      { value: "", label: this.translate.instant("CHAIRS.FILTER.ALL_TYPES") },
      { value: String(ChairType.Regular), label: this.translate.instant("CHAIRS.TYPE.REGULAR") },
      { value: String(ChairType.Vip), label: this.translate.instant("CHAIRS.TYPE.VIP") },
    ];
  });

  protected readonly statusFilterOptions = computed<FilterOption[]>(() => {
    this.language.currentLang();
    return [
      { value: "", label: this.translate.instant("CHAIRS.FILTER.ALL_STATUSES") },
      { value: "true", label: this.translate.instant("CHAIRS.STATUS.ACTIVE") },
      { value: "false", label: this.translate.instant("CHAIRS.STATUS.INACTIVE") },
    ];
  });

  /** A filter is active → an empty result means "no matches", not "no chairs yet". */
  protected readonly isFiltered = computed(() => {
    const q = this.query();
    return (
      !!q.search || q.branchId !== undefined || q.type !== undefined || q.isActive !== undefined
    );
  });

  // ── Summary cards ────────────────────────────────────
  /** Cards need a response (meta) — before that the placeholders show instead of misleading zeros. */
  protected readonly showStats = computed(() => this.meta() !== null);

  /** The cards count the selected branch, or every branch — say which. */
  protected readonly statsHint = computed(() => {
    const id = this.query().branchId;
    if (id === undefined) return this.translate.instant("CHAIRS.STATS.ALL_BRANCHES");
    const branch = this.branchList().find((b) => b.id === id);
    return branch ? localizedName(branch.nameAr, branch.nameEn, this.language.currentLang()) : "";
  });

  // ── Drawer (create / edit) ───────────────────────────
  protected readonly drawerOpen = signal(false);
  protected readonly drawerMode = signal<"create" | "edit">("create");
  protected readonly editDetails = signal<ChairDetails | null>(null);
  protected readonly drawerLoading = signal(false);
  /** Bumped on every open / close so a slow details response can't hijack a newer drawer. */
  private drawerToken = 0;

  // ── Confirmations ────────────────────────────────────
  protected readonly pendingDelete = signal<ChairListItem | null>(null);

  protected readonly pendingTypeChange = signal<ChairListItem | null>(null);
  protected readonly changeTypeMessage = computed(() => {
    const chair = this.pendingTypeChange();
    if (!chair) return "";
    this.language.currentLang();
    return this.translate.instant("CHAIRS.CHANGE_TYPE.MESSAGE", {
      name: chair.name,
      from: this.translate.instant(this.typeKey(chair.type)),
      to: this.translate.instant(this.typeKey(this.otherType(chair.type))),
    });
  });

  ngOnInit(): void {
    // The service outlives the page but the filter widgets start empty — reset so what you see is what is applied.
    this.chairsService.setFilters({
      search: undefined,
      branchId: undefined,
      type: undefined,
      isActive: undefined,
    });
    this.branchesService.loadOptions().subscribe((list) => this.branchList.set(list));
  }

  // ── Helpers ──────────────────────────────────────────
  protected typeKey(type: ChairType): string {
    return type === ChairType.Vip ? "CHAIRS.TYPE.VIP" : "CHAIRS.TYPE.REGULAR";
  }

  protected otherType(type: ChairType): ChairType {
    return type === ChairType.Vip ? ChairType.Regular : ChairType.Vip;
  }

  // ── Filtering / paging ───────────────────────────────
  protected onSearch(term: string): void {
    // Ignore emissions that change nothing (e.g. typing then deleting a trailing space).
    if ((term || undefined) === this.query().search) return;
    this.chairsService.setFilters({ search: term || undefined });
  }

  protected onBranchFilter(value: string): void {
    this.chairsService.setFilters({ branchId: value === "" ? undefined : Number(value) });
  }

  protected onTypeFilter(value: string): void {
    this.chairsService.setFilters({
      type: value === "" ? undefined : (Number(value) as ChairType),
    });
  }

  protected onStatusFilter(value: string): void {
    this.chairsService.setFilters({ isActive: value === "" ? undefined : value === "true" });
  }

  protected onPage(page: number): void {
    this.chairsService.setPage(page);
  }

  protected reload(): void {
    this.chairsService.load();
  }

  // ── Create / edit ────────────────────────────────────
  protected openCreate(): void {
    this.drawerToken++;
    this.drawerMode.set("create");
    this.editDetails.set(null);
    this.drawerLoading.set(false);
    this.drawerOpen.set(true);
  }

  protected openEdit(chair: ChairListItem): void {
    if (!this.canEdit()) return;

    const token = ++this.drawerToken;
    this.drawerMode.set("edit");
    this.editDetails.set(null);
    this.drawerLoading.set(true);
    this.drawerOpen.set(true);

    this.chairsService.getChair(chair.id).subscribe((details) => {
      if (token !== this.drawerToken) return; // closed or replaced meanwhile
      this.drawerLoading.set(false);
      if (details) this.editDetails.set(details);
      else this.drawerOpen.set(false); // the interceptor already showed why
    });
  }

  protected closeDrawer(): void {
    this.drawerToken++;
    this.drawerOpen.set(false);
  }

  protected onSubmitted(payload: CreateChairPayload | UpdateChairPayload): void {
    if (this.drawerMode() === "create") {
      this.chairsService
        .createChair(payload as CreateChairPayload)
        .subscribe((id) => id !== null && this.closeDrawer());
      return;
    }

    const id = this.editDetails()?.id;
    if (id === undefined) return;
    this.chairsService
      .updateChair(id, payload as UpdateChairPayload)
      .subscribe((ok) => ok && this.closeDrawer());
  }

  // ── Status ───────────────────────────────────────────
  /** The service toasts the result and reloads (the switch is controlled, so a refused 409 simply stays put). */
  protected toggle(chair: ChairListItem): void {
    if (this.saving()) return;
    this.chairsService.toggleStatus(chair.id).subscribe();
  }

  // ── Change type ──────────────────────────────────────
  protected askChangeType(chair: ChairListItem): void {
    this.pendingTypeChange.set(chair);
  }

  protected confirmChangeType(): void {
    const chair = this.pendingTypeChange();
    if (!chair) return;

    this.chairsService
      .updateChair(chair.id, { name: chair.name, type: this.otherType(chair.type) })
      .subscribe((ok) => ok && this.pendingTypeChange.set(null));
  }

  // ── Delete ───────────────────────────────────────────
  protected askDelete(chair: ChairListItem): void {
    this.pendingDelete.set(chair);
  }

  protected confirmDelete(): void {
    const chair = this.pendingDelete();
    if (!chair) return;

    this.chairsService.remove([chair.id]).subscribe((ok) => ok && this.pendingDelete.set(null));
  }
}
