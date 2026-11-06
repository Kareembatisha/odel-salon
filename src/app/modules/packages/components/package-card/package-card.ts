import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { TranslateModule, TranslateService } from "@ngx-translate/core";

import { LanguageService } from "@core/services/language.service";
import { AppButtonComponent } from "../../../../shared/components/app-button/app-button.component";
import { StatusBadgeComponent } from "../../../../shared/components/status-badge/status-badge.component";
import { SwitchComponent } from "../../../../shared/components/switch/switch.component";
import { activeBadgeVariant } from "../../../../shared/utils/status-badge.util";
import { formatDuration, formatPrice } from "../../../services/utils/service-price.util";
import { PackageListItem } from "../../model/package.model";
import { localizedName } from "../../utils/package-labels.util";
import { packageSavings } from "../../utils/package-price.util";

/** One price line of the card: what the package costs, what the services cost apart, and the saving. */
interface PriceLine {
  key: "REGULAR" | "VIP" | "HOME";
  /** Formatted package price, or `null` for "In branch only" (home). */
  price: string | null;
  /** Formatted "before discount" total — shown struck through only when there is a saving. */
  original: string | null;
  /** Formatted saving ("EGP 20"), or `null` when the package isn't cheaper. */
  saving: string | null;
}

/**
 * PackageCard — one package in the list grid (same anatomy as ChairCard / BranchCard).
 *
 * Presentational: it shows only the controls it is allowed to and emits events; it never
 * checks permissions or calls the API. The status switch is controlled — the card never flips
 * `isActive` itself, so a refused re-activation (a service is no longer active…) simply leaves
 * the switch where it was.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-package-card",
  standalone: true,
  imports: [
    TranslateModule,
    AppButtonComponent,
    StatusBadgeComponent,
    SwitchComponent,
  ],
  templateUrl: "./package-card.html",
  styleUrl: "./package-card.scss",
})
export class PackageCard {
  private readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  readonly pkg = input.required<PackageListItem>();

  /** Which controls this user may see — decided by the page from permissions. Edit also gates the status switch. */
  readonly canEdit = input<boolean>(false);
  readonly canDelete = input<boolean>(false);
  /** A mutation is running — the switch is disabled so a second click can't race the first. */
  readonly busy = input<boolean>(false);

  readonly edit = output<PackageListItem>();
  readonly delete = output<PackageListItem>();
  /** Asks the parent to flip `isActive`. */
  readonly toggleStatus = output<PackageListItem>();

  protected readonly name = computed(() => {
    const p = this.pkg();
    return localizedName(p.nameAr, p.nameEn, this.language.currentLang());
  });

  /** The name in the other language, shown muted under the main one. */
  protected readonly otherName = computed(() => {
    const p = this.pkg();
    return localizedName(p.nameEn, p.nameAr, this.language.currentLang());
  });
  protected readonly otherLang = computed(() =>
    this.language.currentLang() === "ar" ? "en" : "ar",
  );

  protected readonly serviceNames = computed(() => {
    const lang = this.language.currentLang();
    return this.pkg().services.map((s) => ({
      id: s.serviceId,
      name: localizedName(s.nameAr, s.nameEn, lang),
    }));
  });

  protected readonly statusVariant = computed(() => activeBadgeVariant(this.pkg().isActive));

  protected readonly duration = computed(() => {
    this.language.currentLang();
    return formatDuration(this.pkg().durationMinutes, {
      h: this.translate.instant("SERVICES.UNITS.H"),
      min: this.translate.instant("SERVICES.UNITS.MIN"),
    });
  });

  /** Regular and VIP always have a price; home is "In branch only" when `homePrice` is null. */
  protected readonly lines = computed<PriceLine[]>(() => {
    const p = this.pkg();
    const lang = this.language.currentLang();
    const currency = this.translate.instant("SERVICES.CURRENCY");
    const fmt = (value: number | null) => formatPrice(value, lang, currency);

    const line = (
      key: PriceLine["key"],
      price: number | null,
      original: number | null,
    ): PriceLine => {
      const saving = packageSavings(original, price);
      return {
        key,
        price: price === null ? null : fmt(price),
        original: saving > 0 ? fmt(original) : null,
        saving: saving > 0 ? fmt(saving) : null,
      };
    };

    return [
      line("REGULAR", p.regularPrice, p.originalRegularPrice),
      line("VIP", p.vipPrice, p.originalVipPrice),
      line("HOME", p.homePrice, p.originalHomePrice),
    ];
  });

  protected readonly hasFooter = computed(() => this.canEdit() || this.canDelete());
}
