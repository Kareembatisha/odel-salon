import { ChangeDetectionStrategy, Component, computed, inject, input, output } from "@angular/core";
import { TranslateModule } from "@ngx-translate/core";

import { LanguageService } from "@core/services/language.service";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { StatusBadgeComponent } from "@shared/components/status-badge/status-badge.component";
import { SwitchComponent } from "@shared/components/switch/switch.component";
import { activeBadgeVariant } from "@shared/utils/status-badge.util";
import { ChairListItem, ChairType } from "../../model/chair.model";
import { localizedName } from "../../utils/chair-labels.util";

/**
 * ChairCard — one chair in the list grid (same anatomy as BranchCard).
 *
 * Presentational: it shows only the controls it is allowed to and emits events; it never
 * checks permissions or calls the API. The active switch is controlled — the card never
 * flips `isActive` itself, so a refused change (e.g. the "last active chair" 409) simply
 * leaves the switch where it was.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-chair-card",
  standalone: true,
  imports: [TranslateModule, AppButtonComponent, StatusBadgeComponent, SwitchComponent],
  templateUrl: "./chair-card.html",
  styleUrl: "./chair-card.scss",
})
export class ChairCard {
  private readonly language = inject(LanguageService);

  readonly chair = input.required<ChairListItem>();

  /** Which controls this user may see — decided by the page from permissions. */
  readonly canEdit = input<boolean>(false);
  readonly canToggle = input<boolean>(false);
  readonly canDelete = input<boolean>(false);
  /** A mutation is running — switch and type button are disabled so a second click can't race the first. */
  readonly busy = input<boolean>(false);

  readonly edit = output<ChairListItem>();
  readonly changeType = output<ChairListItem>();
  readonly delete = output<ChairListItem>();
  /** Asks the parent to flip `isActive`. */
  readonly toggleStatus = output<ChairListItem>();

  protected readonly branchName = computed(() => {
    const c = this.chair();
    return localizedName(c.branchNameAr, c.branchNameEn, this.language.currentLang());
  });
  protected readonly branchLang = computed(() =>
    this.language.currentLang() === "ar" ? "ar" : "en",
  );

  protected readonly isVip = computed(() => this.chair().type === ChairType.Vip);
  protected readonly typeKey = computed(() =>
    this.isVip() ? "CHAIRS.TYPE.VIP" : "CHAIRS.TYPE.REGULAR",
  );
  protected readonly statusVariant = computed(() => activeBadgeVariant(this.chair().isActive));

  protected readonly hasFooter = computed(
    () => this.canToggle() || this.canEdit() || this.canDelete(),
  );
}
