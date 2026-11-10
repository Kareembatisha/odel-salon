import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";

import { PERMISSIONS } from "@core/auth/permissions";
import { LanguageService } from "@core/services/language.service";
import { activeBadgeVariant } from "@shared/utils/status-badge.util";
import { AuthService } from "../../../auth/service/auth.service";
import { BreadcrumbService } from "../../../../layout/main-layout/components/header/breadcrumb.service";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { ConfirmModalComponent } from "@shared/components/confirm-modal/confirm-modal.component";
import { FailedStateComponent } from "@shared/components/failed-state/failed-state.component";
import { PageHeaderComponent } from "@shared/components/page-header/page-header.component";
import { SkeletonComponent } from "@shared/components/skeleton/skeleton.component";
import { StatusBadgeComponent } from "@shared/components/status-badge/status-badge.component";
import { SwitchComponent } from "@shared/components/switch/switch.component";
import { BranchDetails as BranchDetailsModel } from "../../model/branch.model";
import { BranchesService } from "../../service/branches.service";
import { closesNextDay, dayKey, shortTime, sortWorkingHours } from "../../utils/branch-hours.util";

const LIST_ROUTE = "/main/branches";

/**
 * Branch details (`/branches/:id`) — read-only view of everything the
 * `GET /branches/{id}` endpoint returns, plus the actions the user is allowed:
 * edit, show/hide in the app, delete (with confirmation).
 */
@Component({
  selector: "app-branch-details",
  standalone: true,
  imports: [
    RouterLink,
    TranslateModule,
    PageHeaderComponent,
    AppButtonComponent,
    StatusBadgeComponent,
    SwitchComponent,
    SkeletonComponent,
    FailedStateComponent,
    ConfirmModalComponent,
  ],
  templateUrl: "./branch-details.html",
  styleUrl: "./branch-details.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BranchDetails implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly branches = inject(BranchesService);
  private readonly auth = inject(AuthService);
  private readonly language = inject(LanguageService);
  private readonly breadcrumbs = inject(BreadcrumbService);

  protected readonly id = Number(this.route.snapshot.paramMap.get("id"));
  protected readonly dayKey = dayKey;

  protected readonly branch = signal<BranchDetailsModel | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly saving = this.branches.saving;
  protected readonly confirmDeleteOpen = signal(false);

  protected readonly canEdit = computed(() => this.auth.hasPermission(PERMISSIONS.Branch.Edit));
  protected readonly canDelete = computed(() => this.auth.hasPermission(PERMISSIONS.Branch.Delete));

  protected readonly isArabic = computed(() => this.language.currentLang() === "ar");
  protected readonly primaryName = computed(() => {
    const b = this.branch();
    return b ? (this.isArabic() ? b.nameAr : b.nameEn) : "";
  });
  protected readonly secondaryName = computed(() => {
    const b = this.branch();
    return b ? (this.isArabic() ? b.nameEn : b.nameAr) : "";
  });
  protected readonly visibilityVariant = computed(() =>
    activeBadgeVariant(this.branch()?.isVisible ?? false),
  );
  protected readonly hasBookingTypes = computed(() => {
    const b = this.branch();
    return !!b && (b.allowsRegular || b.allowsVip || b.allowsHome);
  });
  protected readonly hours = computed(() => sortWorkingHours(this.branch()?.workingHours ?? []));

  protected readonly createdAt = computed(() => this.formatDate(this.branch()?.createdAt ?? null));
  protected readonly updatedAt = computed(() => this.formatDate(this.branch()?.updatedAt ?? null));

  ngOnInit(): void {
    if (!Number.isInteger(this.id) || this.id <= 0) {
      this.router.navigate([LIST_ROUTE]);
      return;
    }

    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);

    this.branches.getBranch(this.id).subscribe((branch) => {
      this.loading.set(false);

      if (!branch) {
        this.failed.set(true);
        return;
      }

      this.applyBranch(branch);
    });
  }

  private applyBranch(branch: BranchDetailsModel): void {
    this.branch.set(branch);

    // The route's static breadcrumb says "Branch details"; swap in the real name.
    this.breadcrumbs.setBreadcrumbs([
      { label: "LAYOUT.NAV.BRANCHES", route: LIST_ROUTE },
      { label: this.isArabic() ? branch.nameAr : branch.nameEn },
    ]);
  }

  // ── Template helpers ───────────────────────────────────
  protected time(value: string | null): string {
    return shortTime(value);
  }

  protected overnight = closesNextDay;

  private formatDate(iso: string | null): string {
    if (!iso) return "";

    return new Intl.DateTimeFormat(this.isArabic() ? "ar-EG" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  }

  // ── Actions ────────────────────────────────────────────
  protected edit(): void {
    this.router.navigate([LIST_ROUTE, this.id, "edit"]);
  }

  /** Flip visibility, then re-read the branch so the badge and `updatedAt` are the server's. */
  protected toggleStatus(): void {
    if (this.saving()) return;

    this.branches.toggleStatus(this.id).subscribe((ok) => {
      if (!ok) return;

      this.branches.getBranch(this.id).subscribe((branch) => {
        if (branch) this.applyBranch(branch);
      });
    });
  }

  protected confirmDelete(): void {
    this.branches.remove([this.id]).subscribe((ok) => {
      if (!ok) return;

      this.confirmDeleteOpen.set(false);
      this.router.navigate([LIST_ROUTE]);
    });
  }
}
