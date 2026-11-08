import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { TranslateModule, TranslateService } from "@ngx-translate/core";

import { LanguageService } from "@core/services/language.service";
import { ServicesTotals } from "../../utils/service-option.util";
import { formatDuration, formatPrice } from "../../utils/service-price.util";

/**
 * ServiceTotals — the "Before discount" box of a package / offer form: what the chosen
 * services cost on their own (Regular, VIP and — when every service allows home visits — Home)
 * and their total duration (the booking buffer is not included).
 *
 *   <app-service-totals [totals]="totals()" [showHome]="homeAllowed()" />
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-service-totals",
  standalone: true,
  imports: [TranslateModule],
  templateUrl: "./service-totals.html",
  styleUrl: "./service-totals.scss",
})
export class ServiceTotals {
  private readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  readonly totals = input.required<ServicesTotals>();
  /** Show the Home total. The form decides (every chosen service must allow home visits). */
  readonly showHome = input<boolean>(false);

  protected readonly view = computed(() => {
    const lang = this.language.currentLang();
    const currency = this.translate.instant("SERVICES.CURRENCY");
    const t = this.totals();
    return {
      regular: formatPrice(t.regular, lang, currency),
      vip: formatPrice(t.vip, lang, currency),
      home: this.showHome() ? formatPrice(t.home, lang, currency) : null,
      duration: formatDuration(t.durationMinutes, {
        h: this.translate.instant("SERVICES.UNITS.H"),
        min: this.translate.instant("SERVICES.UNITS.MIN"),
      }),
    };
  });
}
