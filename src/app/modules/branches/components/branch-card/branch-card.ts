import { ChangeDetectionStrategy, Component, computed, inject, input, output } from "@angular/core";
import { TranslateModule } from "@ngx-translate/core";

import { LanguageService } from "@core/services/language.service";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { SwitchComponent } from "@shared/components/switch/switch.component";
import { StatusBadgeComponent } from "@shared/components/status-badge/status-badge.component";
import { activeBadgeVariant } from "@shared/utils/status-badge.util";
import { BranchListItem } from "../../model/branch.model";

/**
 * BranchCard — one branch in the list grid. Presentational: it shows the action buttons it is
 * allowed to and emits events; it never checks permissions or calls the API itself.
 * The counts are totals as returned by the API (suspended barbers / inactive chairs included).
 */
@Component({
  selector: "app-branch-card",
  standalone: true,
  imports: [TranslateModule, StatusBadgeComponent, AppButtonComponent, SwitchComponent],
  templateUrl: "./branch-card.html",
  styleUrl: "./branch-card.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BranchCard {
  private readonly language = inject(LanguageService);

  readonly branch = input.required<BranchListItem>();

  /** Which actions this user may see — decided by the page from permissions. */
  readonly canEdit = input<boolean>(false);
  readonly canDelete = input<boolean>(false);
  /** A mutation is running — the visibility switch is disabled so a second click can't race the first. */
  readonly busy = input<boolean>(false);

  /** Open the branch details page — the name is the link, so it needs no permission. */
  readonly view = output<BranchListItem>();
  readonly edit = output<BranchListItem>();
  readonly delete = output<BranchListItem>();
  /** Show/hide in the app — asks the parent to flip `isVisible`; the card never changes it itself. */
  readonly toggleStatus = output<BranchListItem>();

  /** The name in the current UI language leads; the other language is the secondary line. */
  protected readonly isArabic = computed(() => this.language.currentLang() === "ar");
  protected readonly primaryName = computed(() =>
    this.isArabic() ? this.branch().nameAr : this.branch().nameEn,
  );
  protected readonly secondaryName = computed(() =>
    this.isArabic() ? this.branch().nameEn : this.branch().nameAr,
  );
  protected readonly primaryLang = computed(() => (this.isArabic() ? "ar" : "en"));
  protected readonly secondaryLang = computed(() => (this.isArabic() ? "en" : "ar"));

  protected readonly visibilityVariant = computed(() =>
    activeBadgeVariant(this.branch().isVisible),
  );
  protected readonly hasBookingTypes = computed(() => {
    const b = this.branch();
    return b.allowsRegular || b.allowsVip || b.allowsHome;
  });
}
