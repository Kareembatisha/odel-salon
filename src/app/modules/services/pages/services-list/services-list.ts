import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";

import { PERMISSIONS } from "@core/auth/permissions";
import { LanguageService } from "@core/services/language.service";
import { AuthService } from "../../../auth/service/auth.service";
import { AppButtonComponent } from "../../../../shared/components/app-button/app-button.component";
import { DrawerComponent } from "../../../../shared/components/drawer/drawer.component";
import { ConfirmModalComponent } from "../../../../shared/components/confirm-modal/confirm-modal.component";
import {
  DataTableCardDirective,
  DataTableColumnDirective,
  DataTableComponent,
} from "../../../../shared/components/data-table/data-table.component";
import { EmptyStateComponent } from "../../../../shared/components/empty-state/empty-state.component";
import { FailedStateComponent } from "../../../../shared/components/failed-state/failed-state.component";
import {
  FilterOption,
  FilterSelectComponent,
} from "../../../../shared/components/filter-select/filter-select.component";
import { PageHeaderComponent } from "../../../../shared/components/page-header/page-header.component";
import { SearchInputComponent } from "../../../../shared/components/search-input/search-input.component";
import { SkeletonComponent } from "../../../../shared/components/skeleton/skeleton.component";
import { StatCardComponent } from "../../../../shared/components/stat-card/stat-card.component";
import { StatusBadgeComponent } from "../../../../shared/components/status-badge/status-badge.component";
import { SwitchComponent } from "../../../../shared/components/switch/switch.component";
import { AdjustPricesForm } from "../../components/adjust-prices-form/adjust-prices-form";
import { BulkStatusForm } from "../../components/bulk-status-form/bulk-status-form";
import { CopyPricesForm } from "../../components/copy-prices-form/copy-prices-form";
import { ServiceListItem } from "../../model/service.model";
import { ServicesService } from "../../service/services.service";
import { localizedName } from "../../utils/service-labels.util";
import { formatDuration, formatPrice } from "../../utils/service-price.util";

/** The three bulk tools of the header / selection bar. */
type BulkTool = "adjust" | "copy" | "status";

/** Placeholder stat cards shown until the first response brings the summary. */
const SKELETON_STATS = [0, 1, 2, 3];

/**
 * ServicesList — the price table of ONE branch (the first branch by default) with summary
 * cards, search, status / home filters, a per-row Active switch, bulk delete and paging.
 *
 * A service has one price row per branch, so everything on screen — rows, prices, the Active
 * switch and the summary counts — belongs to the branch picked in the selector. A service with
 * no price in that branch shows as "Not priced" (no switch; edit it to add prices).
 *
 * Permissions: View (route), Create (header button), Edit (switch + edit), Delete (single and
 * bulk). Every action is hidden, not just disabled, when the user lacks it, and permissions are
 * read lazily (`computed`) rather than in field initializers. Business rules (the last-active
 * lock, services used by packages / offers) live in the backend; its 400 / 409 messages reach
 * the user as interceptor toasts.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-services-list",
  standalone: true,
  imports: [
    TranslateModule,
    PageHeaderComponent,
    AppButtonComponent,
    SearchInputComponent,
    FilterSelectComponent,
    StatCardComponent,
    DataTableComponent,
    DataTableColumnDirective,
    DataTableCardDirective,
    StatusBadgeComponent,
    SwitchComponent,
    ConfirmModalComponent,
    DrawerComponent,
    AdjustPricesForm,
    CopyPricesForm,
    BulkStatusForm,
    EmptyStateComponent,
    FailedStateComponent,
    SkeletonComponent,
  ],
  templateUrl: "./services-list.html",
  styleUrl: "./services-list.scss",
})
export class ServicesList implements OnInit {
  private readonly servicesService = inject(ServicesService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  protected readonly skeletonStats = SKELETON_STATS;

  protected readonly rows = this.servicesService.services;
  protected readonly meta = this.servicesService.meta;
  protected readonly summary = this.servicesService.summary;
  protected readonly loading = this.servicesService.loading;
  protected readonly saving = this.servicesService.saving;
  protected readonly hasError = this.servicesService.hasError;
  protected readonly query = this.servicesService.query;
  protected readonly branchId = this.servicesService.branchId;
  protected readonly noBranches = this.servicesService.noBranches;

  protected readonly canCreate = computed(() => this.auth.hasPermission(PERMISSIONS.Service.Create));
  protected readonly canEdit = computed(() => this.auth.hasPermission(PERMISSIONS.Service.Edit));
  protected readonly canDelete = computed(() => this.auth.hasPermission(PERMISSIONS.Service.Delete));

  // ── Filters ──────────────────────────────────────────
  /** No "all branches" option: prices only exist per branch. */
  protected readonly branchOptions = computed<FilterOption[]>(() => {
    const lang = this.language.currentLang();
    return this.servicesService
      .branches()
      .map((b) => ({ value: String(b.id), label: localizedName(b.nameAr, b.nameEn, lang) }));
  });

  protected readonly statusFilterOptions = computed<FilterOption[]>(() => {
    this.language.currentLang();
    return [
      { value: "", label: this.translate.instant("SERVICES.FILTER.ALL_STATUSES") },
      { value: "true", label: this.translate.instant("SERVICES.STATUS.ACTIVE") },
      { value: "false", label: this.translate.instant("SERVICES.STATUS.INACTIVE") },
    ];
  });

  protected readonly homeFilterOptions = computed<FilterOption[]>(() => {
    this.language.currentLang();
    return [
      { value: "", label: this.translate.instant("SERVICES.FILTER.ALL_HOME") },
      { value: "true", label: this.translate.instant("SERVICES.FILTER.HOME_YES") },
      { value: "false", label: this.translate.instant("SERVICES.FILTER.HOME_NO") },
    ];
  });

  /** A filter is active → an empty result means "no matches", not "no services yet". */
  protected readonly isFiltered = computed(() => {
    const q = this.query();
    return !!q.search || q.isActive !== undefined || q.isHomeAvailable !== undefined;
  });

  // ── Summary cards ────────────────────────────────────
  /** Cards need a response (meta) — before that placeholders show instead of misleading zeros. */
  protected readonly showStats = computed(() => this.meta() !== null);

  /** The cards count the whole selected branch — say which. */
  protected readonly statsHint = computed(() => {
    this.language.currentLang();
    const branch = this.servicesService.selectedBranch();
    return branch ? localizedName(branch.nameAr, branch.nameEn, this.language.currentLang()) : "";
  });

  // ── Bulk tools (drawers) ─────────────────────────────
  protected readonly tool = signal<BulkTool | null>(null);
  protected readonly branches = this.servicesService.branches;
  /** Bulk tools change prices / status, so they need Edit and at least one branch. */
  protected readonly canBulk = computed(() => this.canEdit() && this.branches().length > 0);
  /** Copying needs two different branches. */
  protected readonly canCopy = computed(() => this.canEdit() && this.branches().length > 1);
  /** The ticked services as ids (the table's selection is typed loosely). */
  protected readonly selectedIds = computed(() => this.selection().map(Number));

  // ── Selection / delete ───────────────────────────────
  protected readonly selection = signal<Array<string | number>>([]);
  protected readonly pendingDelete = signal<ServiceListItem[]>([]);
  protected readonly deleteMessage = computed(() => {
    const items = this.pendingDelete();
    if (!items.length) return "";
    this.language.currentLang();
    return items.length === 1
      ? this.translate.instant("SERVICES.DELETE.MESSAGE_ONE", { name: this.name(items[0]) })
      : this.translate.instant("SERVICES.DELETE.MESSAGE_MANY", { count: items.length });
  });

  ngOnInit(): void {
    this.selection.set([]);
    this.servicesService.initialize();
  }

  // ── Labels ───────────────────────────────────────────
  protected name(row: ServiceListItem): string {
    return localizedName(row.nameAr, row.nameEn, this.language.currentLang());
  }

  /** The name in the other language, shown under the main one. */
  protected otherName(row: ServiceListItem): string {
    return localizedName(row.nameEn, row.nameAr, this.language.currentLang());
  }

  protected price(value: number | null): string {
    return formatPrice(value, this.language.currentLang(), this.translate.instant("SERVICES.CURRENCY"));
  }

  protected duration(minutes: number | null): string {
    this.language.currentLang();
    return formatDuration(minutes, {
      h: this.translate.instant("SERVICES.UNITS.H"),
      min: this.translate.instant("SERVICES.UNITS.MIN"),
    });
  }

  // ── Filtering / paging ───────────────────────────────
  protected onBranch(value: string): void {
    if (value === "") return;
    this.selection.set([]);
    this.servicesService.selectBranch(Number(value));
  }

  protected onSearch(term: string): void {
    // Ignore emissions that change nothing (e.g. typing then deleting a trailing space).
    if ((term || undefined) === this.query().search) return;
    this.selection.set([]);
    this.servicesService.setFilters({ search: term || undefined });
  }

  protected onStatusFilter(value: string): void {
    this.selection.set([]);
    this.servicesService.setFilters({ isActive: value === "" ? undefined : value === "true" });
  }

  protected onHomeFilter(value: string): void {
    this.selection.set([]);
    this.servicesService.setFilters({ isHomeAvailable: value === "" ? undefined : value === "true" });
  }

  protected onPage(page: number): void {
    this.selection.set([]);
    this.servicesService.setPage(page);
  }

  protected reload(): void {
    this.servicesService.load();
  }

  // ── Create / edit (own page) ─────────────────────────
  protected openCreate(): void {
    void this.router.navigate(["/main/services/new"]);
  }

  protected openEdit(row: ServiceListItem): void {
    if (!this.canEdit()) return;
    void this.router.navigate(["/main/services", row.id, "edit"]);
  }

  // ── Status (this branch only) ────────────────────────
  /**
   * The switch sets the TARGET state for the selected branch only. It is controlled by the
   * row, so a refused change (409: last active service of a visible branch…) simply stays put.
   */
  protected toggle(row: ServiceListItem, isActive: boolean): void {
    const branchId = this.branchId();
    if (branchId === null || this.saving() || !row.pricing.isPriced) return;
    this.servicesService.setStatusInBranch(row.id, branchId, isActive).subscribe();
  }

  // ── Bulk tools ───────────────────────────────────────
  protected openTool(tool: BulkTool): void {
    if (!this.canEdit()) return;
    this.tool.set(tool);
  }

  protected closeTool(): void {
    this.tool.set(null);
  }

  /** The status tool acts on the ticked rows — once applied the selection has served its purpose. */
  protected statusDone(): void {
    this.selection.set([]);
    this.closeTool();
  }

  // ── Delete ───────────────────────────────────────────
  protected askDelete(row: ServiceListItem, event: Event): void {
    event.stopPropagation();
    this.pendingDelete.set([row]);
  }

  protected askBulkDelete(): void {
    const ids = this.selection();
    this.pendingDelete.set(this.rows().filter((s) => ids.includes(s.id)));
  }

  protected confirmDelete(): void {
    const ids = this.pendingDelete().map((s) => s.id);
    this.servicesService.remove(ids).subscribe((ok) => {
      if (ok) {
        this.pendingDelete.set([]);
        this.selection.set([]);
      }
    });
  }
}
