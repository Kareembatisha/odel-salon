import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { FormControl, ReactiveFormsModule, Validators } from "@angular/forms";

import { NotificationService } from "@core/services/notification.service";
import { ThemeService } from "@core/services/theme.service";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { ConfirmModalComponent } from "@shared/components/confirm-modal/confirm-modal.component";
import {
  DataTableColumnDirective,
  DataTableComponent,
} from "@shared/components/data-table/data-table.component";
import { EmptyStateComponent } from "@shared/components/empty-state/empty-state.component";
import { FailedStateComponent } from "@shared/components/failed-state/failed-state.component";
import { FloatLabelInput } from "@shared/components/float-label-input/float-label-input";
import { PageHeaderComponent } from "@shared/components/page-header/page-header.component";
import { SkeletonComponent } from "@shared/components/skeleton/skeleton.component";
import { StatCardComponent } from "@shared/components/stat-card/stat-card.component";
import {
  StatusBadgeComponent,
  StatusBadgeVariant,
} from "@shared/components/status-badge/status-badge.component";
import { TabItem, TabsComponent } from "@shared/components/tabs/tabs.component";

interface DemoRow {
  id: number;
  name: string;
  branch: string;
  tier: "VIP" | "Regular";
  active: boolean;
}

/**
 * Living reference for the design system (dev builds only — `environment.showDesignSystem`).
 * Every block renders the real shared component, so what you see here is exactly what
 * feature pages get. Flip the theme/language in the header to review both.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-design-system",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    AppButtonComponent,
    StatusBadgeComponent,
    StatCardComponent,
    FloatLabelInput,
    DataTableComponent,
    DataTableColumnDirective,
    EmptyStateComponent,
    FailedStateComponent,
    SkeletonComponent,
    ConfirmModalComponent,
    TabsComponent,
  ],
  templateUrl: "./design-system.html",
  styleUrl: "./design-system.scss",
})
export class DesignSystem {
  private readonly notify = inject(NotificationService);
  protected readonly theme = inject(ThemeService);

  protected readonly primarySteps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  protected readonly neutralSteps = [0, 25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

  protected readonly semantic = [
    { name: "Page", css: "--odl-bg-page" },
    { name: "Surface", css: "--odl-surface" },
    { name: "Surface sunken", css: "--odl-surface-sunken" },
    { name: "Border", css: "--odl-border" },
    { name: "Text", css: "--odl-text" },
    { name: "Text secondary", css: "--odl-text-secondary" },
    { name: "Primary", css: "--odl-primary" },
    { name: "Primary soft", css: "--odl-primary-soft" },
    { name: "Success", css: "--odl-success" },
    { name: "Warning", css: "--odl-warning" },
    { name: "Danger", css: "--odl-danger" },
    { name: "Info", css: "--odl-info" },
  ];

  protected readonly badgeVariants: StatusBadgeVariant[] = [
    "success",
    "warning",
    "danger",
    "info",
    "neutral",
    "vip",
  ];

  protected readonly typeScale = [
    { token: "text-6xl · display", px: 56, sample: "Odel", display: true },
    { token: "text-3xl · page title", px: 32, sample: "Branches", display: true },
    { token: "text-xl · section", px: 18, sample: "Today’s schedule", display: false },
    {
      token: "text-base · body",
      px: 14,
      sample: "Classic haircut with beard trim, VIP chair, 45 minutes.",
      display: false,
    },
    { token: "text-sm · meta", px: 13, sample: "Updated 2 minutes ago", display: false },
    {
      token: "text-xs · caption",
      px: 12,
      sample: "Badges and captions never go below 12px",
      display: false,
    },
  ];

  protected readonly demoTabs: TabItem[] = [
    { value: "all", label: "All", count: 5 },
    { value: "active", label: "Active", count: 3 },
    { value: "scheduled", label: "Scheduled", count: 1 },
    { value: "ended", label: "Ended or full", count: 1 },
  ];
  protected readonly demoTab = signal("all");
  protected readonly startDate = new FormControl("", { nonNullable: true });

  protected readonly email = new FormControl("", {
    nonNullable: true,
    validators: [Validators.required, Validators.email],
  });
  protected readonly password = new FormControl("secret12", { nonNullable: true });
  protected readonly invalid = new FormControl("abc", {
    nonNullable: true,
    validators: [Validators.email],
  });

  protected readonly rows: DemoRow[] = [
    { id: 1, name: "Karim Adel", branch: "Maadi", tier: "VIP", active: true },
    { id: 2, name: "Youssef Nabil", branch: "Zamalek", tier: "Regular", active: true },
    { id: 3, name: "Hady Mahmoud", branch: "Maadi", tier: "VIP", active: false },
  ];
  protected readonly page = signal(1);
  protected readonly tableLoading = signal(false);
  protected readonly confirmOpen = signal(false);
  protected readonly busy = signal(false);

  protected showToast(kind: "success" | "warning" | "error" | "info"): void {
    this.notify[kind]("Design system", `This is a ${kind} toast`);
  }

  protected reloadTable(): void {
    this.tableLoading.set(true);
    setTimeout(() => this.tableLoading.set(false), 1200);
  }

  protected confirmDelete(): void {
    this.busy.set(true);
    setTimeout(() => {
      this.busy.set(false);
      this.confirmOpen.set(false);
      this.notify.success("Deleted");
    }, 900);
  }
}
