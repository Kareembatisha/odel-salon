import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { TranslateModule, TranslateService } from "@ngx-translate/core";

import { LanguageService } from "@core/services/language.service";
import { AppButtonComponent } from "../../../../shared/components/app-button/app-button.component";
import { StatusBadgeComponent } from "../../../../shared/components/status-badge/status-badge.component";
import { savingsAmount } from "../../../services/utils/service-option.util";
import { formatPrice } from "../../../services/utils/service-price.util";
import { localizedName } from "../../../packages/utils/package-labels.util";
import { OfferListItem } from "../../model/offer.model";
import { formatOfferDateRange } from "../../utils/offer-dates.util";
import {
  canToggleOffer,
  isOfferStopped,
  offerBookingsText,
  offerStatusKey,
  offerStatusVariant,
} from "../../utils/offer-labels.util";

/** One price line: the offer price, the services' total apart (struck through) and the saving. */
interface PriceLine {
  key: "REGULAR" | "VIP" | "HOME";
  /** Formatted offer price, or `null` for "In branch only" (home). */
  price: string | null;
  /** Formatted "before discount" total — only when the offer is actually cheaper. */
  original: string | null;
}

/**
 * OfferCard — one offer in the list grid.
 *
 * Presentational: it shows only the controls it is allowed to and emits events; it never
 * checks permissions or calls the API.
 *  - `canToggle`  → the Stop offer / Resume button (hidden on Ended offers).
 *  - `canEdit`    → the pencil and the name link (open the edit form).
 *  - `canDelete`  → the trash button.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-offer-card",
  standalone: true,
  imports: [TranslateModule, AppButtonComponent, StatusBadgeComponent],
  templateUrl: "./offer-card.html",
  styleUrl: "./offer-card.scss",
})
export class OfferCard {
  private readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  readonly offer = input.required<OfferListItem>();

  readonly canEdit = input<boolean>(false);
  readonly canToggle = input<boolean>(false);
  readonly canDelete = input<boolean>(false);
  /** A mutation is running — Stop / Resume is disabled so a second click can't race the first. */
  readonly busy = input<boolean>(false);

  readonly edit = output<OfferListItem>();
  readonly delete = output<OfferListItem>();
  /** Asks the parent to stop (or, when stopped, resume) the offer. */
  readonly toggleStatus = output<OfferListItem>();

  /** The banner failed to load (broken URL) → show the placeholder instead of a broken image. */
  protected readonly imageFailed = signal(false);

  protected readonly name = computed(() => {
    const o = this.offer();
    return localizedName(o.nameAr, o.nameEn, this.language.currentLang());
  });

  protected readonly otherName = computed(() => {
    const o = this.offer();
    return localizedName(o.nameEn, o.nameAr, this.language.currentLang());
  });
  protected readonly otherLang = computed(() =>
    this.language.currentLang() === "ar" ? "en" : "ar",
  );

  protected readonly showImage = computed(() => !!this.offer().imageUrl && !this.imageFailed());

  protected readonly statusKey = computed(() => offerStatusKey(this.offer().status));
  protected readonly statusVariant = computed(() => offerStatusVariant(this.offer().status));

  protected readonly dates = computed(() => {
    const o = this.offer();
    return formatOfferDateRange(
      o.startDate,
      o.endDate,
      this.language.currentLang(),
      this.translate.instant("OFFERS.NO_END"),
    );
  });

  protected readonly bookings = computed(() => {
    this.language.currentLang();
    return offerBookingsText(this.offer(), this.translate.instant("OFFERS.NO_LIMIT"));
  });

  protected readonly serviceNames = computed(() => {
    const lang = this.language.currentLang();
    return this.offer().services.map((s) => ({
      id: s.serviceId,
      name: localizedName(s.nameAr, s.nameEn, lang),
    }));
  });

  /** Per-offer names: a grid of identical "Stop offer" / "Edit" buttons is meaningless to a screen reader. */
  protected readonly toggleLabel = computed(() =>
    this.translate.instant(this.isStopped() ? "OFFERS.CARD.RESUME_LABEL" : "OFFERS.CARD.STOP_LABEL", { name: this.name() }),
  );
  protected readonly editLabel = computed(() => this.translate.instant("OFFERS.CARD.EDIT_LABEL", { name: this.name() }));
  protected readonly deleteLabel = computed(() => this.translate.instant("OFFERS.CARD.DELETE_LABEL", { name: this.name() }));

  protected readonly isStopped = computed(() => isOfferStopped(this.offer()));
  /** Stopped / ended offers read as "off" at a glance. */
  protected readonly isMuted = computed(() => this.offer().status !== 0 && this.offer().status !== 1);

  /** Regular and VIP always have a price; home is "In branch only" when `homePrice` is null. */
  protected readonly lines = computed<PriceLine[]>(() => {
    const o = this.offer();
    const lang = this.language.currentLang();
    const currency = this.translate.instant("SERVICES.CURRENCY");
    const fmt = (value: number | null) => formatPrice(value, lang, currency);

    const line = (key: PriceLine["key"], price: number | null, original: number | null): PriceLine => ({
      key,
      price: price === null ? null : fmt(price),
      original: savingsAmount(original, price) > 0 ? fmt(original) : null,
    });

    return [
      line("REGULAR", o.regularPrice, o.originalRegularPrice),
      line("VIP", o.vipPrice, o.originalVipPrice),
      line("HOME", o.homePrice, o.originalHomePrice),
    ];
  });

  protected readonly showToggle = computed(() => this.canToggle() && canToggleOffer(this.offer()));
  protected readonly hasFooter = computed(
    () => this.showToggle() || this.canEdit() || this.canDelete(),
  );
}
