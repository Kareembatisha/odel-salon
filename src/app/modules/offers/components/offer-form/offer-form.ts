import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
} from "@angular/forms";
import { TranslateModule } from "@ngx-translate/core";
import { startWith } from "rxjs";

import { NotificationService } from "@core/services/notification.service";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { FloatLabelInput } from "@shared/components/float-label-input/float-label-input";
import { createPreviewUrl, revokePreviewUrl } from "@shared/utils/image-preview.util";
import { maxTrimmedLength, notBlank } from "@shared/validators/text.validators";
import {
  ServicePicker,
  UnavailableService,
} from "../../../services/components/service-picker/service-picker";
import { ServiceTotals } from "../../../services/components/service-totals/service-totals";
import { ServiceOption } from "../../../services/model/service.model";
import { savingPercent, servicesTotals } from "../../../services/utils/service-option.util";
import { isValidPrice } from "../../../services/utils/service-price.util";
import {
  CreateOfferPayload,
  OFFER_IMAGE_ACCEPT,
  OFFER_MAX_BOOKINGS_MAX,
  OFFER_MIN_SERVICES,
  OFFER_NAME_MAX_LENGTH,
  OfferDetails,
  UpdateOfferPayload,
} from "../../model/offer.model";
import { cairoToday, isValidDate } from "../../utils/offer-dates.util";
import { validateOfferImage } from "../../utils/offer-image.util";

type PriceField = "regularPrice" | "vipPrice" | "homePrice";

/** Number typed into a field → `NaN` when empty or not a number (never 0 for ""). */
function toNumber(value: unknown): number {
  const text = String(value ?? "").trim();
  return text === "" ? NaN : Number(text);
}

/**
 * Create / edit offer form (rendered inside a drawer).
 *
 *  - create: the branch is the one selected on the list (shown locked) and goes into the
 *    {@link CreateOfferPayload}; the start date can't be before today (Cairo).
 *  - edit:   same fields without the branch; the start date MAY be in the past (a running offer
 *    stays editable). Stop / resume is not edited here — the card button does it.
 *
 * Presentational: it checks the same rules as the API so the user sees them inline —
 * names ≤ 100, at least 1 active service, every price > 0 / ≤ 100,000 / ≤ 2 decimals and LOWER
 * than the selected services' total, a home price only when every service allows home visits,
 * a valid start date, an end date on or after it, max bookings a whole number 1–100,000.
 *
 * Banner: optional JPG / PNG / WebP up to 5 MB. A chosen file previews locally; in edit mode
 * "Remove banner" sends `removeImage` (nothing changes on the server until the form is saved).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-offer-form",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    AppButtonComponent,
    FloatLabelInput,
    ServicePicker,
    ServiceTotals,
  ],
  templateUrl: "./offer-form.html",
  styleUrl: "./offer-form.scss",
})
export class OfferForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(NotificationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly mode = input.required<"create" | "edit">();
  /** Loaded offer (edit mode). */
  readonly details = input<OfferDetails | null>(null);
  /** The offer's branch (create: the one selected on the list; edit: the offer's own). */
  readonly branchId = input.required<number>();
  readonly branchName = input<string>("");
  /**
   * The ACTIVE services priced in that branch. Not `required`: the form's validators run while
   * the form is built, before Angular has bound any input.
   */
  readonly services = input<ServiceOption[]>([]);
  readonly saving = input<boolean>(false);

  /** {@link CreateOfferPayload} in create mode, {@link UpdateOfferPayload} in edit mode. */
  readonly submitted = output<CreateOfferPayload | UpdateOfferPayload>();
  readonly cancelled = output<void>();

  protected readonly accept = OFFER_IMAGE_ACCEPT;
  /** Cairo's "today" when the form opened — the earliest start date of a new offer. */
  protected readonly today = cairoToday();

  // ── Service selection ────────────────────────────────
  protected readonly selected = signal<number[]>([]);
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

  protected readonly homeAllowed = computed(
    () => this.totals().home !== null && this.unavailableSelected().length === 0,
  );

  // ── Banner ───────────────────────────────────────────
  protected readonly pendingImage = signal<File | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly removeImage = signal(false);

  /** What the banner box shows: the new file, else the current banner unless it is being removed. */
  protected readonly shownImage = computed(
    () => this.previewUrl() ?? (this.removeImage() ? null : (this.details()?.imageUrl ?? null)),
  );
  protected readonly hasBanner = computed(() => !!this.shownImage() || !!this.pendingImage());
  protected readonly bannerChanged = computed(() => !!this.pendingImage() || this.removeImage());

  // ── Form ─────────────────────────────────────────────
  protected readonly form = this.fb.nonNullable.group({
    nameAr: ["", [notBlank, maxTrimmedLength(OFFER_NAME_MAX_LENGTH)]],
    nameEn: ["", [notBlank, maxTrimmedLength(OFFER_NAME_MAX_LENGTH)]],
    startDate: ["", [(c: AbstractControl) => this.startRule(c)]],
    endDate: ["", [(c: AbstractControl) => this.endRule(c)]],
    maxBookings: ["", [(c: AbstractControl) => this.maxBookingsRule(c)]],
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
  /** Services the offer already has that were deactivated in the branch since (edit mode) — shown so they can be removed. */
  protected readonly unavailableServices = computed<UnavailableService[]>(() => {
    const active = new Set(this.services().map((s) => s.id));
    return (this.details()?.services ?? [])
      .filter((s) => !active.has(s.serviceId))
      .map((s) => ({ id: s.serviceId, nameAr: s.nameAr, nameEn: s.nameEn }));
  });

  protected readonly servicesError = computed(() => {
    if (!this.attempted()) return "";
    if (this.unavailableSelected().length > 0) return "OFFERS.FORM.SERVICES_UNAVAILABLE";
    if (this.selected().length < OFFER_MIN_SERVICES) return "OFFERS.FORM.SERVICES_MIN";
    return "";
  });

  protected readonly hasSelection = computed(() => this.selected().length > 0);

  /** Earliest pickable start date: today for a new offer; unrestricted when editing. */
  protected readonly startMin = computed(() => (this.mode() === "create" ? this.today : ""));

  /** Earliest pickable end date: the start date, once it is a real date. */
  protected readonly endMin = computed(() => {
    const start = this.values().startDate ?? "";
    return isValidDate(start) ? start : "";
  });

  /** "Save 22%" under each price field — only while the typed price is valid and cheaper than the total. */
  protected readonly savings = computed(() => {
    const t = this.totals();
    const v = this.values();

    const percent = (raw: string | undefined, total: number | null): number => {
      const price = toNumber(raw);
      if (total === null || !isValidPrice(price)) return 0;
      return savingPercent(total, price);
    };

    return {
      regular: percent(v.regularPrice, t.regular),
      vip: percent(v.vipPrice, t.vip),
      home: this.homeAllowed() ? percent(v.homePrice, t.home) : 0,
    };
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => revokePreviewUrl(this.previewUrl()));

    // Changing the start date can make the end date invalid (or valid again).
    this.form.controls.startDate.valueChanges
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.form.controls.endDate.updateValueAndValidity());
  }

  ngOnInit(): void {
    const d = this.details();
    if (this.mode() !== "edit" || !d) {
      // A new offer starts today unless told otherwise.
      this.form.patchValue({ startDate: this.today });
      return;
    }

    this.selected.set(d.services.map((s) => s.serviceId));
    this.form.patchValue({
      nameAr: d.nameAr,
      nameEn: d.nameEn,
      startDate: d.startDate,
      endDate: d.endDate ?? "",
      maxBookings: d.maxBookings === null ? "" : String(d.maxBookings),
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

  // ── Banner handlers ──────────────────────────────────
  protected onPickBanner(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // allow picking the same file again later
    if (!file) return;

    const problem = validateOfferImage(file);
    if (problem) {
      this.notify.error(
        problem === "type" ? "FILE_VALIDATION.UNSUPPORTED_TYPE" : "FILE_VALIDATION.FILE_TOO_LARGE",
        "OFFERS.FORM.BANNER_HINT",
      );
      return;
    }

    revokePreviewUrl(this.previewUrl());
    this.pendingImage.set(file);
    this.previewUrl.set(createPreviewUrl(file));
    this.removeImage.set(false);
  }

  protected removeBanner(): void {
    revokePreviewUrl(this.previewUrl());
    this.pendingImage.set(null);
    this.previewUrl.set(null);
    // Only an existing server banner needs a "remove" instruction; a just-picked one is simply dropped.
    this.removeImage.set(!!this.details()?.imageUrl);
  }

  // ── Error messages ───────────────────────────────────
  protected nameError(name: "nameAr" | "nameEn"): string {
    const c = this.form.controls[name];
    if (!c.touched) return "";
    if (c.hasError("required")) return "OFFERS.FORM.NAME_REQUIRED";
    if (c.hasError("maxlength")) return "OFFERS.FORM.NAME_MAX";
    return "";
  }

  protected startError(): string {
    const c = this.form.controls.startDate;
    if (!c.touched) return "";
    if (c.hasError("required")) return "OFFERS.FORM.START_REQUIRED";
    if (c.hasError("invalid")) return "OFFERS.FORM.START_INVALID";
    if (c.hasError("past")) return "OFFERS.FORM.START_PAST";
    return "";
  }

  protected endError(): string {
    const c = this.form.controls.endDate;
    if (!c.touched) return "";
    if (c.hasError("invalid")) return "OFFERS.FORM.END_INVALID";
    if (c.hasError("beforeStart")) return "OFFERS.FORM.END_BEFORE_START";
    return "";
  }

  protected maxBookingsError(): string {
    const c = this.form.controls.maxBookings;
    return c.touched && c.hasError("invalid") ? "OFFERS.FORM.MAX_BOOKINGS_INVALID" : "";
  }

  protected priceError(name: PriceField): string {
    const c = this.form.controls[name];
    if (!c.touched) return "";
    if (c.hasError("required")) return "OFFERS.FORM.PRICE_REQUIRED";
    if (c.hasError("price")) return "OFFERS.FORM.PRICE_INVALID";
    if (c.hasError("tooHigh")) return "OFFERS.FORM.PRICE_TOO_HIGH";
    return "";
  }

  // ── Submit ───────────────────────────────────────────
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
    const endText = v.endDate.trim();
    const maxText = v.maxBookings.trim();

    const body = {
      nameAr: v.nameAr.trim(),
      nameEn: v.nameEn.trim(),
      serviceIds: [...this.selected()],
      regularPrice: Number(v.regularPrice),
      vipPrice: Number(v.vipPrice),
      // Empty, or no longer possible after the selection changed → "In branch only".
      homePrice: this.homeAllowed() && homeText !== "" ? Number(homeText) : null,
      startDate: v.startDate.trim(),
      endDate: endText === "" ? null : endText,
      maxBookings: maxText === "" ? null : Number(maxText),
      image: this.pendingImage(),
    };

    this.submitted.emit(
      this.mode() === "create"
        ? { branchId: this.branchId(), ...body }
        : { ...body, removeImage: this.removeImage() },
    );
  }

  /** After the errors render, move focus to the first invalid field (or the picker). */
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
  /** Errors: `required` | `invalid` (not a real date) | `past` (create only: before today in Cairo). */
  private startRule(control: AbstractControl): ValidationErrors | null {
    const value = String(control.value ?? "").trim();
    if (value === "") return { required: true };
    if (!isValidDate(value)) return { invalid: true };
    if (this.mode() === "create" && value < this.today) return { past: true };
    return null;
  }

  /** Optional. Errors: `invalid` | `beforeStart`. */
  private endRule(control: AbstractControl): ValidationErrors | null {
    const value = String(control.value ?? "").trim();
    if (value === "") return null;
    if (!isValidDate(value)) return { invalid: true };

    const start = String(this.form?.controls.startDate.value ?? "").trim();
    if (isValidDate(start) && value < start) return { beforeStart: true };
    return null;
  }

  /** Optional (empty = no limit); otherwise a whole number from 1 to 100,000. */
  private maxBookingsRule(control: AbstractControl): ValidationErrors | null {
    const text = String(control.value ?? "").trim();
    if (text === "") return null;

    const n = Number(text);
    return Number.isInteger(n) && n >= 1 && n <= OFFER_MAX_BOOKINGS_MAX ? null : { invalid: true };
  }

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
