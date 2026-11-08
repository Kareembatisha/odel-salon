import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from "@angular/core";
import { TranslateModule, TranslateService } from "@ngx-translate/core";

import { AuthService } from "../../../auth/service/auth.service";
import { LanguageService } from "@core/services/language.service";
import {
  DataTableColumnDirective,
  DataTableComponent,
} from "@shared/components/data-table/data-table.component";
import { FailedStateComponent } from "@shared/components/failed-state/failed-state.component";
import { PageHeaderComponent } from "@shared/components/page-header/page-header.component";
import { SkeletonComponent } from "@shared/components/skeleton/skeleton.component";
import { StatCardComponent } from "@shared/components/stat-card/stat-card.component";
import { StatusBadgeComponent } from "@shared/components/status-badge/status-badge.component";
import { bookingBadgeVariant } from "@shared/utils/status-badge.util";
import { ChairAvailability } from "../../model/dashboard.model";
import { DashboardService } from "../../service/dashboard.service";

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-dashboard",
  standalone: true,
  imports: [
    TranslateModule,
    PageHeaderComponent,
    StatCardComponent,
    StatusBadgeComponent,
    DataTableComponent,
    DataTableColumnDirective,
    FailedStateComponent,
    SkeletonComponent,
  ],
  templateUrl: "./dashboard.html",
  styleUrl: "./dashboard.scss",
})
export class Dashboard implements OnInit {
  private readonly dashboard = inject(DashboardService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  protected readonly summary = this.dashboard.summary;
  protected readonly loading = this.dashboard.loading;
  protected readonly hasError = this.dashboard.hasError;
  protected readonly badge = bookingBadgeVariant;

  protected readonly firstName = computed(
    () => this.auth.currentUser()?.fullName?.split(" ")[0] ?? "",
  );

  protected readonly greetingKey = computed(() => {
    const hour = new Date().getHours();
    return hour < 12
      ? "DASHBOARD.GREETING_MORNING"
      : hour < 18
        ? "DASHBOARD.GREETING_AFTERNOON"
        : "DASHBOARD.GREETING_EVENING";
  });

  protected readonly today = computed(() =>
    new Intl.DateTimeFormat(this.language.currentLang() === "ar" ? "ar-EG" : "en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date()),
  );

  protected readonly money = computed(() => {
    const lang = this.language.currentLang() === "ar" ? "ar-EG" : "en-US";
    return (value: number) =>
      new Intl.NumberFormat(lang, {
        style: "currency",
        currency: "EGP",
        maximumFractionDigits: 0,
      }).format(value);
  });

  protected readonly freeBarbers = computed(
    () => this.summary()?.barbers.filter((b) => b.state === "free").length ?? 0,
  );
  protected readonly skeletonStats = [0, 1, 2, 3];

  ngOnInit(): void {
    this.dashboard.load();
  }

  protected reload(): void {
    this.dashboard.load();
  }

  protected usage(chair: ChairAvailability): number {
    const usable = chair.total - chair.locked;
    return usable > 0 ? Math.round((chair.inUse / usable) * 100) : 0;
  }

  protected free(chair: ChairAvailability): number {
    return Math.max(0, chair.total - chair.locked - chair.inUse);
  }

  protected trendDirection(pct: number): "up" | "down" | "flat" {
    return pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  }

  protected trendText(pct: number): string {
    return this.translate.instant("DASHBOARD.VS_LAST_WEEK", {
      value: `\u2066${pct > 0 ? "+" : ""}${pct}%\u2069`,
    });
  }
}
