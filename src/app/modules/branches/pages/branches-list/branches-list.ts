import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
} from "@angular/core";
import { TranslateModule, TranslateService } from "@ngx-translate/core";

import { PERMISSIONS } from "@core/auth/permissions";
import { AuthService } from "../../../auth/service/auth.service";
import { AppButtonComponent } from "../../../../shared/components/app-button/app-button.component";
import { EmptyStateComponent } from "../../../../shared/components/empty-state/empty-state.component";
import { FailedStateComponent } from "../../../../shared/components/failed-state/failed-state.component";
import {
  FilterOption,
  FilterSelectComponent,
} from "../../../../shared/components/filter-select/filter-select.component";
import { PageHeaderComponent } from "../../../../shared/components/page-header/page-header.component";
import { PaginationComponent } from "../../../../shared/components/pagination/pagination.component";
import { SearchInputComponent } from "../../../../shared/components/search-input/search-input.component";
import { SkeletonComponent } from "../../../../shared/components/skeleton/skeleton.component";
import { BranchCard } from "../../components/branch-card/branch-card";
import { BranchListItem } from "../../model/branch.model";
import { BranchesService } from "../../service/branches.service";
import { Router } from "@angular/router";

/** Cards shown as placeholders while the list loads. */
const SKELETON_CARDS = 6;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-branches-list",
  standalone: true,
  imports: [
    TranslateModule,
    PageHeaderComponent,
    AppButtonComponent,
    SearchInputComponent,
    FilterSelectComponent,
    EmptyStateComponent,
    FailedStateComponent,
    SkeletonComponent,
    PaginationComponent,
    BranchCard,
  ],
  templateUrl: "./branches-list.html",
  styleUrl: "./branches-list.scss",
})
export class BranchesList implements OnInit {
  private readonly branchesService = inject(BranchesService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  /** Lazy on purpose: reading PERMISSIONS in a field initializer came back undefined in combined test runs. */
  protected readonly canCreate = computed(() =>
    this.auth.hasPermission(PERMISSIONS.Branch.Create),
  );
  protected readonly canEdit = computed(() =>
    this.auth.hasPermission(PERMISSIONS.Branch.Edit),
  );
  protected readonly canDelete = computed(() =>
    this.auth.hasPermission(PERMISSIONS.Branch.Delete),
  );
  protected readonly branches = this.branchesService.branches;
  protected readonly meta = this.branchesService.meta;
  protected readonly loading = this.branchesService.loading;
  protected readonly hasError = this.branchesService.hasError;
  protected readonly query = this.branchesService.query;

  protected readonly skeletons = Array.from(
    { length: SKELETON_CARDS },
    (_, i) => i,
  );

  protected readonly visibilityFilterOptions = computed<FilterOption[]>(() => [
    { value: "", label: this.translate.instant("BRANCHES.FILTER.ALL") },
    { value: "true", label: this.translate.instant("BRANCHES.STATUS.VISIBLE") },
    { value: "false", label: this.translate.instant("BRANCHES.STATUS.HIDDEN") },
  ]);

  /** A search term or visibility filter is active → an empty result means "no matches", not "no branches yet". */
  protected readonly isFiltered = computed(
    () => !!this.query().search || this.query().isVisible !== undefined,
  );

  ngOnInit(): void {
    // The service outlives the page but the search box starts empty — reset so what you see is what is applied.
    this.branchesService.setFilters({
      search: undefined,
      isVisible: undefined,
    });
  }

  protected onSearch(term: string): void {
    // Ignore emissions that change nothing (e.g. typing then deleting a trailing space).
    if ((term || undefined) === this.query().search) return;
    this.branchesService.setFilters({ search: term || undefined });
  }

  protected onVisibilityFilter(value: string): void {
    this.branchesService.setFilters({
      isVisible: value === "" ? undefined : value === "true",
    });
  }

  protected onPage(page: number): void {
    this.branchesService.setPage(page);
  }

  protected reload(): void {
    this.branchesService.load();
  }

  /** Phase 2 hook: "Add branch" will navigate to the create page. Intentionally inert for now. */
  protected addBranch(): void {
    this.router.navigate(["main/branches/new"]);
  }

  /** Phase 2 hook: will open the branch form. Intentionally inert for now. */
  protected editBranch(_branch: BranchListItem): void {
    this.router.navigate(["main/branches", _branch.id, "edit"]);
  }

  /** Phase 3 hook: will show/hide the branch in the app. Intentionally inert for now. */
  protected toggleBranchStatus(_branch: BranchListItem): void {}

  /** Phase 3 hook: will ask for confirmation, then delete. Intentionally inert for now. */
  protected deleteBranch(_branch: BranchListItem): void {}
}
