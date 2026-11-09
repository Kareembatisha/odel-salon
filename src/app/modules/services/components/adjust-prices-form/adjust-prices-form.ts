import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { startWith } from "rxjs";

import { LanguageService } from "@core/services/language.service";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { FloatLabelInput } from "@shared/components/float-label-input/float-label-input";
import {
  FloatLabelSelect,
  SelectOption,
} from "@shared/components/float-label-select/float-label-select";
import { SkeletonComponent } from "@shared/components/skeleton/skeleton.component";
import {
  SERVICE_PERCENTAGE_MAX,
  SERVICE_PERCENTAGE_MIN,
  ServiceListItem,
} from "../../model/service.model";
import { ServiceBranchOption, ServicesService } from "../../service/services.service";
import { localizedName } from "../../utils/service-labels.util";
import {
  applyPercentage,
  exceedsMaxPrice,
  formatPrice,
  isValidPercentage,
} from "../../utils/service-price.util";

/** How many services the preview lists before "and N more". */
const PREVIEW_ROWS = 6;
/** Shown if a targeted service has no regular / VIP price (the list only offers priced ones). */
const NO_PRICE: PreviewPrice = { from: "", to: "" };

function percentageValidator(control: AbstractControl): ValidationErrors | null {
  const text = String(control.value ?? "").trim();
  if (text === "") return { required: true };
  return isValidPercentage(Number(text)) ? null : { percentage: true };
}

/** One line of the preview: the three prices before → after (`null` = not offered). */
interface PreviewPrice {
  from: string;
  to: string;
}
interface PreviewRow {
  id: number;
  name: string;
  regular: PreviewPrice;
  vip: PreviewPrice;
  home: PreviewPrice | null;
}

/**
 * "Change prices by %" (rendered inside a drawer).
 *
 * Pick a branch and a percentage (-90 … 500, not 0); the Regular / VIP / Home prices of the
 * branch's services change by it, rounded to the nearest pound (durations stay). The preview
 * uses the SAME rounding as the backend ({@link applyPercentage}) so what you see is what you
 * get, and a result above 100,000 EGP blocks the request (the backend would refuse it).
 *
 * The scope is every service priced in the branch, or — when rows are selected in the list and
 * the branch is the one on screen — just the selected ones.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-adjust-prices-form",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    AppButtonComponent,
    FloatLabelInput,
    FloatLabelSelect,
    SkeletonComponent,
  ],
  templateUrl: "./adjust-prices-form.html",
  styleUrls: ["../bulk-form.scss", "./adjust-prices-form.scss"],
})
export class AdjustPricesForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly servicesService = inject(ServicesService);
  private readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  readonly branches = input.required<ServiceBranchOption[]>();
  /** The branch on screen — pre-selected, and the only one a row selection applies to. */
  readonly initialBranchId = input<number | null>(null);
  /** Services ticked in the list. */
  readonly selectedIds = input<number[]>([]);

  readonly done = output<void>();
  readonly cancelled = output<void>();

  protected readonly saving = this.servicesService.saving;
  protected readonly rows = signal<ServiceListItem[]>([]);
  protected readonly rowsLoading = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    branchId: ["", [Validators.required]],
    percentage: ["", [percentageValidator]],
    scope: ["all"],
  });

  private readonly value = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    {
      initialValue: this.form.getRawValue(),
    },
  );

  protected readonly min = SERVICE_PERCENTAGE_MIN;
  protected readonly max = SERVICE_PERCENTAGE_MAX;

  protected readonly branchOptions = computed<SelectOption[]>(() => {
    const lang = this.language.currentLang();
    return this.branches().map((b) => ({
      value: String(b.id),
      label: localizedName(b.nameAr, b.nameEn, lang),
    }));
  });

  /** A row selection only makes sense for the branch the list is showing. */
  protected readonly canScopeToSelection = computed(
    () => this.selectedIds().length > 0 && Number(this.value().branchId) === this.initialBranchId(),
  );

  protected readonly scopeOptions = computed<SelectOption[]>(() => {
    this.language.currentLang();
    return [
      { value: "all", label: this.translate.instant("SERVICES.BULK.SCOPE_ALL") },
      {
        value: "selected",
        label: this.translate.instant("SERVICES.BULK.SCOPE_SELECTED", {
          count: this.selectedIds().length,
        }),
      },
    ];
  });

  private readonly useSelection = computed(
    () => this.canScopeToSelection() && this.value().scope === "selected",
  );

  /** The services the request will change. */
  private readonly targets = computed(() => {
    if (!this.useSelection()) return this.rows();
    const ids = this.selectedIds();
    return this.rows().filter((r) => ids.includes(r.id));
  });

  private readonly percentage = computed<number | null>(() => {
    const text = String(this.value().percentage ?? "").trim();
    return text !== "" && isValidPercentage(Number(text)) ? Number(text) : null;
  });

  /** Services whose new price would pass 100,000 — blocks the request. */
  protected readonly overLimit = computed(() => {
    const pct = this.percentage();
    if (pct === null) return 0;
    return this.targets().filter((r) =>
      [r.pricing.regularPrice, r.pricing.vipPrice, r.pricing.homePrice].some(
        (p) => p !== null && exceedsMaxPrice(p, pct),
      ),
    ).length;
  });

  protected readonly targetCount = computed(() => this.targets().length);

  protected readonly preview = computed<PreviewRow[]>(() => {
    const pct = this.percentage();
    if (pct === null) return [];
    const lang = this.language.currentLang();
    const currency = this.translate.instant("SERVICES.CURRENCY");
    const price = (value: number | null): PreviewPrice | null =>
      value === null
        ? null
        : {
            from: formatPrice(value, lang, currency),
            to: formatPrice(applyPercentage(value, pct), lang, currency),
          };

    return this.targets()
      .slice(0, PREVIEW_ROWS)
      .map((r) => ({
        id: r.id,
        name: localizedName(r.nameAr, r.nameEn, lang),
        regular: price(r.pricing.regularPrice) ?? NO_PRICE,
        vip: price(r.pricing.vipPrice) ?? NO_PRICE,
        home: price(r.pricing.homePrice),
      }));
  });

  protected readonly moreCount = computed(() => Math.max(0, this.targets().length - PREVIEW_ROWS));

  protected readonly canSubmit = computed(
    () =>
      this.percentage() !== null &&
      this.targetCount() > 0 &&
      this.overLimit() === 0 &&
      !this.rowsLoading(),
  );

  ngOnInit(): void {
    const initial = this.initialBranchId() ?? this.branches()[0]?.id ?? null;
    if (initial !== null) {
      this.form.patchValue({
        branchId: String(initial),
        scope: this.selectedIds().length ? "selected" : "all",
      });
      this.loadRows(initial);
    }

    this.form.controls.branchId.valueChanges.subscribe((id) => {
      if (id) this.loadRows(Number(id));
    });
  }

  private loadRows(branchId: number): void {
    this.rowsLoading.set(true);
    this.rows.set([]);
    this.servicesService.loadBranchServices(branchId).subscribe((rows) => {
      // Ignore a slow answer for a branch that is no longer selected.
      if (Number(this.form.controls.branchId.value) !== branchId) return;
      this.rows.set(rows);
      this.rowsLoading.set(false);
    });
  }

  protected percentageError(): string {
    const c = this.form.controls.percentage;
    if (!c.touched) return "";
    if (c.hasError("required")) return "SERVICES.BULK.PERCENTAGE_REQUIRED";
    return c.hasError("percentage") ? "SERVICES.BULK.PERCENTAGE_INVALID" : "";
  }

  protected submit(): void {
    if (this.saving()) return;
    const percentage = this.percentage();
    if (this.form.invalid || !this.canSubmit() || percentage === null) {
      this.form.markAllAsTouched();
      return;
    }

    this.servicesService
      .adjustPrices({
        branchId: Number(this.form.controls.branchId.value),
        percentage,
        serviceIds: this.useSelection() ? this.selectedIds() : [],
      })
      .subscribe((ok) => {
        if (ok) this.done.emit();
      });
  }
}
