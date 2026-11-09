import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
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
} from "@angular/forms";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { startWith } from "rxjs";

import { LanguageService } from "@core/services/language.service";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { FloatLabelInput } from "@shared/components/float-label-input/float-label-input";
import { maxTrimmedLength, notBlank } from "@shared/validators/text.validators";
import { ServiceOption } from "../../../services/model/service.model";
import {
  ServicePicker,
  UnavailableService,
} from "../../../services/components/service-picker/service-picker";
import { ServiceTotals } from "../../../services/components/service-totals/service-totals";
import { savingsAmount, servicesTotals } from "../../../services/utils/service-option.util";
import { formatPrice, isValidPrice } from "../../../services/utils/service-price.util";
import {
  CreatePackagePayload,
  PACKAGE_MIN_SERVICES,
  PACKAGE_NAME_MAX_LENGTH,
  PackageDetails,
  UpdatePackagePayload,
} from "../../model/package.model";

type PriceField = "regularPrice" | "vipPrice" | "homePrice";

/** Number typed into a text field → `NaN` when empty or not a number (never 0 for ""). */
function toNumber(value: unknown): number {
  const text = String(value ?? "").trim();
  return text === "" ? NaN : Number(text);
}

/**
 * Create / edit package form (rendered inside a drawer).
 *
 *  - create: names, services, prices; the branch is the one selected on the list (shown locked)
 *    and goes into the {@link CreatePackagePayload}.
 *  - edit:   same fields; the branch can't change, so it isn't part of the
 *    {@link UpdatePackagePayload}. The active status is not edited here (the card switch does it).
 *
 * Presentational: it checks the same rules as the API so the user sees them inline —
 * at least 2 different active services, every price > 0 / ≤ 100,000 / ≤ 2 decimals and LOWER
 * than the selected services' total, a home price only when every service allows home visits.
 * Uniqueness of the names inside the branch is enforced by the backend; its message reaches
 * the user as a toast and the drawer stays open.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-package-form",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    AppButtonComponent,
    FloatLabelInput,
    ServicePicker,
    ServiceTotals,
  ],
  templateUrl: "./package-form.html",
  styleUrl: "./package-form.scss",
})
export class PackageForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly mode = input.required<"create" | "edit">();
  /** Loaded package (edit mode). */
  readonly details = input<PackageDetails | null>(null);
  /** The package's branch (create: the one selected on the list; edit: the package's own). */
  readonly branchId = input.required<number>();
  readonly branchName = input<string>("");
  /**
   * The ACTIVE services priced in that branch. Not `required`: the form's validators run while
   * the form is built, before Angular has bound any input.
   */
  readonly services = input<ServiceOption[]>([]);
  readonly saving = input<boolean>(false);

  /** {@link CreatePackagePayload} in create mode, {@link UpdatePackagePayload} in edit mode. */
  readonly submitted = output<CreatePackagePayload | UpdatePackagePayload>();
  readonly cancelled = output<void>();

  // ── Service selection ────────────────────────────────
  /** Chosen service ids, in the order they were picked. */
  protected readonly selected = signal<number[]>([]);
  /** Errors for the picker only appear after the first submit attempt. */
  private readonly attempted = signal(false);

  private readonly selectedOptions = computed(() =>
    this.services().filter((s) => this.selected().includes(s.id)),
  );

  /** Chosen ids that are no longer active in the branch (edit mode) — the API would refuse them. */
  protected readonly unavailableSelected = computed(() => {
    const active = new Set(this.services().map((s) => s.id));
    return this.selected().filter((id) => !active.has(id));
  });

  /** What the chosen services cost on their own — the "Before discount" box and each price's upper bound. */
  protected readonly totals = computed(() => servicesTotals(this.selectedOptions()));

  /** Home pricing needs at least one service and every one of them available for home visits. */
  protected readonly homeAllowed = computed(
    () => this.totals().home !== null && this.unavailableSelected().length === 0,
  );

  // ── Form ─────────────────────────────────────────────
  protected readonly form = this.fb.nonNullable.group({
    nameAr: ["", [notBlank, maxTrimmedLength(PACKAGE_NAME_MAX_LENGTH)]],
    nameEn: ["", [notBlank, maxTrimmedLength(PACKAGE_NAME_MAX_LENGTH)]],
    regularPrice: ["", [(c: AbstractControl) => this.priceRule(c, this.totals().regular, true)]],
    vipPrice: ["", [(c: AbstractControl) => this.priceRule(c, this.totals().vip, true)]],
    // Optional: empty = "In branch only". Only checked while home pricing is possible.
    homePrice: [
      "",
      [
        (c: AbstractControl) =>
          this.homeAllowed() ? this.priceRule(c, this.totals().home, false) : null,
      ],
    ],
  });

  private readonly values = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  // ── View models ──────────────────────────────────────
  /** Services the package already has that were deactivated in the branch since (edit mode) — shown so they can be removed. */
  protected readonly unavailableServices = computed<UnavailableService[]>(() => {
    const active = new Set(this.services().map((s) => s.id));
    return (this.details()?.services ?? [])
      .filter((s) => !active.has(s.serviceId))
      .map((s) => ({ id: s.serviceId, nameAr: s.nameAr, nameEn: s.nameEn }));
  });

  /** Message key for the picker, or "" when the selection is fine (or nothing was attempted yet). */
  protected readonly servicesError = computed(() => {
    if (!this.attempted()) return "";
    if (this.unavailableSelected().length > 0) return "PACKAGES.FORM.SERVICES_UNAVAILABLE";
    if (this.selected().length < PACKAGE_MIN_SERVICES) return "PACKAGES.FORM.SERVICES_MIN";
    return "";
  });

  protected readonly hasSelection = computed(() => this.selected().length > 0);

  /** "Save EGP X" under each price field, shown only while the typed price is valid and cheaper than the total. */
  protected readonly savings = computed(() => {
    const lang = this.language.currentLang();
    const currency = this.translate.instant("SERVICES.CURRENCY");
    const t = this.totals();
    const v = this.values();

    const saving = (raw: string | undefined, total: number | null): string => {
      const price = toNumber(raw);
      if (total === null || !isValidPrice(price) || price >= total) return "";
      return formatPrice(savingsAmount(total, price), lang, currency);
    };

    return {
      regular: saving(v.regularPrice, t.regular),
      vip: saving(v.vipPrice, t.vip),
      home: this.homeAllowed() ? saving(v.homePrice, t.home) : "",
    };
  });

  ngOnInit(): void {
    const d = this.details();
    if (this.mode() !== "edit" || !d) return;

    this.selected.set(d.services.map((s) => s.serviceId));
    this.form.patchValue({
      nameAr: d.nameAr,
      nameEn: d.nameEn,
      regularPrice: String(d.regularPrice),
      vipPrice: String(d.vipPrice),
      homePrice: d.homePrice === null ? "" : String(d.homePrice),
    });
    this.revalidatePrices();
  }

  // ── Interaction ──────────────────────────────────────
  protected isSelected(id: number): boolean {
    return this.selected().includes(id);
  }

  protected toggleService(id: number): void {
    this.selected.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    // The price bounds follow the selection, so every price is re-checked against the new totals.
    this.revalidatePrices();
  }

  protected nameError(name: "nameAr" | "nameEn"): string {
    const c = this.form.controls[name];
    if (!c.touched) return "";
    if (c.hasError("required")) return "PACKAGES.FORM.NAME_REQUIRED";
    if (c.hasError("maxlength")) return "PACKAGES.FORM.NAME_MAX";
    return "";
  }

  protected priceError(name: PriceField): string {
    const c = this.form.controls[name];
    if (!c.touched) return "";
    if (c.hasError("required")) return "PACKAGES.FORM.PRICE_REQUIRED";
    if (c.hasError("price")) return "PACKAGES.FORM.PRICE_INVALID";
    if (c.hasError("tooHigh")) return "PACKAGES.FORM.PRICE_TOO_HIGH";
    return "";
  }

  protected submit(): void {
    if (this.saving()) return;

    this.attempted.set(true);
    this.form.markAllAsTouched();

    if (this.form.invalid || this.servicesError()) {
      this.focusFirstError();
      return;
    }

    const v = this.form.getRawValue();
    const homeText = v.homePrice.trim();

    const body: UpdatePackagePayload = {
      nameAr: v.nameAr.trim(),
      nameEn: v.nameEn.trim(),
      serviceIds: [...this.selected()],
      regularPrice: Number(v.regularPrice),
      vipPrice: Number(v.vipPrice),
      // Empty, or no longer possible after the selection changed → "In branch only".
      homePrice: this.homeAllowed() && homeText !== "" ? Number(homeText) : null,
    };

    this.submitted.emit(this.mode() === "create" ? { branchId: this.branchId(), ...body } : body);
  }

  /** After the errors render, move focus to the first invalid field (or the picker) so keyboard / screen-reader users land on it. */
  private focusFirstError(): void {
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLInputElement>(".fli--error input, .sp--invalid .sp__check")
          ?.focus(),
      { injector: this.injector },
    );
  }

  // ── Validation ───────────────────────────────────────
  /**
   * > 0, ≤ 100,000, at most 2 decimals, and LOWER than the selected services' total.
   * Errors: `required` (only when `required`) | `price` | `tooHigh`.
   */
  private priceRule(
    control: AbstractControl,
    total: number | null,
    required: boolean,
  ): ValidationErrors | null {
    if (String(control.value ?? "").trim() === "") return required ? { required: true } : null;

    const price = toNumber(control.value);
    if (!isValidPrice(price)) return { price: true };
    // Without services there is no total yet — the picker explains what is missing.
    if (this.selected().length > 0 && total !== null && price >= total) return { tooHigh: true };
    return null;
  }

  private revalidatePrices(): void {
    const { regularPrice, vipPrice, homePrice } = this.form.controls;
    [regularPrice, vipPrice, homePrice].forEach((c) => c.updateValueAndValidity());
  }
}
