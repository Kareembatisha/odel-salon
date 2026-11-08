import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
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
import { StatCardComponent } from "@shared/components/stat-card/stat-card.component";
import { PackageCard } from "../../components/package-card/package-card";
import { PackageForm } from "../../components/package-form/package-form";
import {
  CreatePackagePayload,
  PackageDetails,
  PackageListItem,
  UpdatePackagePayload,
} from "../../model/package.model";
import { ServiceOption } from "../../../services/model/service.model";
import { ServicesService } from "../../../services/service/services.service";
import { PackagesService } from "../../service/packages.service";
import { localizedName } from "../../utils/package-labels.util";

/** Placeholder cards while the first page loads. */
const SKELETON_CARDS = 6;
/** Placeholder stat cards shown until the first response brings the summary. */
const SKELETON_STATS = [0, 1, 2];

/**
 * PackagesList — the packages of ONE branch (the first branch by default) as cards, with
 * summary cards, search / status filters and paging.
 *
 * A package belongs to a single branch, so everything on screen — cards and summary counts —
 * follows the branch picked in the selector (there is no "all branches" view).
 *
 * Create / edit happen in a drawer on this page (same as Chairs). The drawer needs the branch's
 * active services for the picker, so it loads them (and, for edit, the package) before showing the form.
 *
 * Permissions: View (route), Create (header button), Edit (edit + the status switch — the API
 * has no separate toggle permission), Delete. Business rules (unique name, service / price
 * rules, re-activation checks) live in the backend; its 400 / 404 messages reach the user as
 * interceptor toasts.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-packages-list",
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
    PackageCard,
    PackageForm,
  ],
  templateUrl: "./packages-list.html",
  styleUrl: "./packages-list.scss",
})
export class PackagesList implements OnInit {
  private readonly packagesService = inject(PackagesService);
  private readonly servicesService = inject(ServicesService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  protected readonly skeletons = Array.from({ length: SKELETON_CARDS }, (_, i) => i);
  protected readonly skeletonStats = SKELETON_STATS;

  protected readonly rows = this.packagesService.packages;
  protected readonly meta = this.packagesService.meta;
  protected readonly summary = this.packagesService.summary;
  protected readonly loading = this.packagesService.loading;
  protected readonly saving = this.packagesService.saving;
  protected readonly hasError = this.packagesService.hasError;
  protected readonly query = this.packagesService.query;
  protected readonly branchId = this.packagesService.branchId;
  protected readonly noBranches = this.packagesService.noBranches;

  /**
   * Lazy on purpose (same as ChairsList): reading PERMISSIONS in a field initializer comes back
   * undefined in combined test runs, so every flag is a `computed`.
   */
  protected readonly canCreate = computed(() =>
    this.auth.hasPermission(PERMISSIONS.Package.Create),
  );
  protected readonly canEdit = computed(() => this.auth.hasPermission(PERMISSIONS.Package.Edit));
  protected readonly canDelete = computed(() =>
    this.auth.hasPermission(PERMISSIONS.Package.Delete),
  );

  /**
   * Skeleton cards only while there is nothing to show yet. A reload with cards on screen
   * (after a toggle, a filter change…) keeps them in place instead of flashing placeholders.
   */
  protected readonly showSkeleton = computed(() => this.loading() && this.rows().length === 0);

  // ── Filters ──────────────────────────────────────────
  /** No "all branches" option: a package lives in exactly one branch. */
  protected readonly branchOptions = computed<FilterOption[]>(() => {
    const lang = this.language.currentLang();
    return this.packagesService
      .branches()
      .map((b) => ({ value: String(b.id), label: localizedName(b.nameAr, b.nameEn, lang) }));
  });

  protected readonly statusFilterOptions = computed<FilterOption[]>(() => {
    this.language.currentLang();
    return [
      { value: "", label: this.translate.instant("PACKAGES.FILTER.ALL_STATUSES") },
      { value: "true", label: this.translate.instant("PACKAGES.STATUS.ACTIVE") },
      { value: "false", label: this.translate.instant("PACKAGES.STATUS.INACTIVE") },
    ];
  });

  /** A filter is active → an empty result means "no matches", not "no packages yet". */
  protected readonly isFiltered = computed(() => {
    const q = this.query();
    return !!q.search || q.isActive !== undefined;
  });

  // ── Summary cards ────────────────────────────────────
  /** Cards need a response (meta) — before that placeholders show instead of misleading zeros. */
  protected readonly showStats = computed(() => this.meta() !== null);

  /** The API counts total and active; inactive is the difference. */
  protected readonly inactiveCount = computed(() => {
    const { total, active } = this.summary();
    return Math.max(0, total - active);
  });

  /** The selected branch's name: the summary cards count the whole branch, and the form shows where the package goes. */
  protected readonly branchName = computed(() => {
    const branch = this.packagesService.selectedBranch();
    return branch ? localizedName(branch.nameAr, branch.nameEn, this.language.currentLang()) : "";
  });

  // ── Create / edit drawer ─────────────────────────────
  protected readonly drawerOpen = signal(false);
  protected readonly drawerMode = signal<"create" | "edit">("create");
  protected readonly drawerLoading = signal(false);
  protected readonly editDetails = signal<PackageDetails | null>(null);
  /** The active services the picker offers for the drawer's branch. */
  protected readonly serviceOptions = signal<ServiceOption[]>([]);
  /** Branch of the package being created / edited (create: the selected one, edit: the package's own). */
  protected readonly drawerBranchId = signal<number | null>(null);

  /** Bumped on every open / close so a slow response for a drawer that was closed or replaced is dropped. */
  private drawerToken = 0;

  // ── Delete ───────────────────────────────────────────
  protected readonly pendingDelete = signal<PackageListItem | null>(null);
  protected readonly deleteName = computed(() => {
    const pkg = this.pendingDelete();
    return pkg ? localizedName(pkg.nameAr, pkg.nameEn, this.language.currentLang()) : "";
  });

  ngOnInit(): void {
    this.pendingDelete.set(null);
    this.drawerOpen.set(false);
    this.packagesService.initialize();
  }

  // ── Filtering / paging ───────────────────────────────
  protected onBranch(value: string): void {
    if (value !== "") this.packagesService.selectBranch(Number(value));
  }

  protected onSearch(term: string): void {
    // Ignore emissions that change nothing (e.g. typing then deleting a trailing space).
    if ((term || undefined) === this.query().search) return;
    this.packagesService.setFilters({ search: term || undefined });
  }

  protected onStatusFilter(value: string): void {
    this.packagesService.setFilters({ isActive: value === "" ? undefined : value === "true" });
  }

  protected onPage(page: number): void {
    this.packagesService.setPage(page);
  }

  protected reload(): void {
    this.packagesService.load();
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

  protected openEdit(pkg: PackageListItem): void {
    if (!this.canEdit()) return;

    const token = ++this.drawerToken;
    this.drawerMode.set("edit");
    this.drawerBranchId.set(pkg.branchId);
    this.editDetails.set(null);
    this.serviceOptions.set([]);
    this.drawerLoading.set(true);
    this.drawerOpen.set(true);

    forkJoin({
      details: this.packagesService.getPackage(pkg.id),
      options: this.servicesService.loadServiceOptions(pkg.branchId),
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

  protected closeDrawer(): void {
    this.drawerToken++;
    this.drawerOpen.set(false);
  }

  protected onSubmitted(payload: CreatePackagePayload | UpdatePackagePayload): void {
    if (this.drawerMode() === "create") {
      this.packagesService
        .createPackage(payload as CreatePackagePayload)
        .subscribe((id) => id !== null && this.closeDrawer());
      return;
    }

    const id = this.editDetails()?.id;
    if (id === undefined) return;
    this.packagesService
      .updatePackage(id, payload as UpdatePackagePayload)
      .subscribe((ok) => ok && this.closeDrawer());
  }

  // ── Status ───────────────────────────────────────────
  /**
   * The switch is controlled by the card, so a refused change (re-activating a package whose
   * service is no longer active…) simply stays where it was; the interceptor shows why.
   */
  protected toggle(pkg: PackageListItem): void {
    if (this.saving()) return;
    this.packagesService.toggleStatus(pkg.id).subscribe();
  }

  // ── Delete ───────────────────────────────────────────
  protected askDelete(pkg: PackageListItem): void {
    this.pendingDelete.set(pkg);
  }

  protected confirmDelete(): void {
    const pkg = this.pendingDelete();
    if (!pkg) return;

    this.packagesService.remove([pkg.id]).subscribe((ok) => ok && this.pendingDelete.set(null));
  }
}
