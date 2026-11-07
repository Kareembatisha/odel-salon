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
import { ServiceOption } from "../../model/service.model";
import { formatDuration, formatPrice } from "../../utils/service-price.util";

/** A service the bundle already has but that is no longer active in the branch. */
export type UnavailableService = Pick<ServiceOption, "id" | "nameAr" | "nameEn">;

interface PickerItem {
  id: number;
  name: string;
  meta: string;
  unavailable: boolean;
}

let nextId = 0;

/**
 * ServicePicker — the checkbox list a package / offer form uses to choose its services.
 *
 * Controlled and presentational: the form owns the selection and the rules (how many services,
 * which are still valid) and passes the result in as `error`; this component only renders the
 * options and emits `toggled`. It lists the ACTIVE services of the branch, plus — when editing —
 * the bundle's services that were deactivated since, marked "no longer active" so the user can
 * see and remove them.
 *
 *   <app-service-picker [options]="options" [selected]="ids" hint="PACKAGES.FORM.SERVICES_HINT"
 *     [error]="errorKey" (toggled)="toggle($event)" />
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-service-picker",
  standalone: true,
  imports: [TranslateModule],
  templateUrl: "./service-picker.html",
  styleUrl: "./service-picker.scss",
})
export class ServicePicker {
  private readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  /** The active services priced in the branch. */
  readonly options = input<ServiceOption[]>([]);
  /** Chosen service ids. */
  readonly selected = input<number[]>([]);
  /** Services of the bundle that are no longer active (edit mode). */
  readonly unavailable = input<UnavailableService[]>([]);
  /** Translation key of the short rule under the title ("Choose at least 2 services…"). */
  readonly hint = input<string>("");
  /** Translation key of the current problem, or "" when the selection is fine. */
  readonly error = input<string>("");

  readonly toggled = output<number>();

  protected readonly hintId = `sp-hint-${nextId++}`;

  protected readonly items = computed<PickerItem[]>(() => {
    const lang = this.language.currentLang();
    const currency = this.translate.instant("SERVICES.CURRENCY");
    const units = {
      h: this.translate.instant("SERVICES.UNITS.H"),
      min: this.translate.instant("SERVICES.UNITS.MIN"),
    };
    const regular = this.translate.instant("SERVICE_PICKER.REGULAR");
    const vip = this.translate.instant("SERVICE_PICKER.VIP");
    const name = (s: UnavailableService) => (lang === "ar" ? s.nameAr : s.nameEn);

    const active = this.options().map((s): PickerItem => ({
      id: s.id,
      name: name(s),
      meta: `${formatDuration(s.durationMinutes, units)} · ${regular} ${formatPrice(s.regularPrice, lang, currency)} · ${vip} ${formatPrice(s.vipPrice, lang, currency)}`,
      unavailable: false,
    }));

    const stale = this.unavailable().map((s): PickerItem => ({
      id: s.id,
      name: name(s),
      meta: this.translate.instant("SERVICE_PICKER.UNAVAILABLE"),
      unavailable: true,
    }));

    return [...active, ...stale];
  });

  protected isSelected(id: number): boolean {
    return this.selected().includes(id);
  }
}
