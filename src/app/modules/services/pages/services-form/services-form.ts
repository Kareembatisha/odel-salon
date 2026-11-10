import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";

import { LanguageService } from "@core/services/language.service";
import { BreadcrumbService } from "../../../../layout/main-layout/components/header/breadcrumb.service";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { EmptyStateComponent } from "@shared/components/empty-state/empty-state.component";
import { FailedStateComponent } from "@shared/components/failed-state/failed-state.component";
import { FloatLabelInput } from "@shared/components/float-label-input/float-label-input";
import { PageHeaderComponent } from "@shared/components/page-header/page-header.component";
import { SkeletonComponent } from "@shared/components/skeleton/skeleton.component";
import { StatusBadgeComponent } from "@shared/components/status-badge/status-badge.component";
import { SwitchComponent } from "@shared/components/switch/switch.component";
import { ServiceBranchPricing, ServiceDetails } from "../../model/service.model";
import { ServicesService } from "../../service/services.service";
import { branchesArray, createServiceForm } from "../../utils/service-form.factory";
import {
  ServiceFormValue,
  applyBranchesToForm,
  applyServiceToForm,
  buildServicePayload,
} from "../../utils/service-form.mapper";
import { localizedName } from "../../utils/service-labels.util";

const LIST_ROUTE = "/main/services";

/** Name field → validation error → translation key. */
const NAME_ERRORS: Record<string, Record<string, string>> = {
  nameAr: {
    required: "SERVICES.VALIDATION.NAME_AR_REQUIRED",
    maxlength: "SERVICES.VALIDATION.NAME_MAX",
  },
  nameEn: {
    required: "SERVICES.VALIDATION.NAME_EN_REQUIRED",
    maxlength: "SERVICES.VALIDATION.NAME_MAX",
  },
};

/** Branch price field → validation error → translation key. */
const PRICE_ERRORS: Record<string, Record<string, string>> = {
  durationMinutes: {
    required: "SERVICES.VALIDATION.DURATION_REQUIRED",
    duration: "SERVICES.VALIDATION.DURATION_INVALID",
  },
  regularPrice: {
    required: "SERVICES.VALIDATION.PRICE_REQUIRED",
    price: "SERVICES.VALIDATION.PRICE_INVALID",
  },
  vipPrice: {
    required: "SERVICES.VALIDATION.PRICE_REQUIRED",
    price: "SERVICES.VALIDATION.PRICE_INVALID",
  },
  homePrice: {
    required: "SERVICES.VALIDATION.HOME_PRICE_REQUIRED",
    price: "SERVICES.VALIDATION.PRICE_INVALID",
  },
};

/**
 * Create / edit service page (`/services/new`, `/services/:id/edit`).
 *
 * One form for both modes: the Arabic and English names plus a price card for EVERY branch
 * (the contract wants each branch exactly once). Edit mode loads the service first; a branch
 * with no price yet shows a "set prices" state. Each card highlights the prices the branch
 * actually uses (`branchAllows*`) — the others are still required by the API, so they stay
 * editable, just visually secondary.
 *
 * Validation mirrors the contract inline; the backend's 400 / 409 messages (duplicate name,
 * last-active lock…) arrive as interceptor toasts. A successful save is announced by
 * ServicesService and returns to the list.
 */
@Component({
  selector: "app-services-form",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslateModule,
    PageHeaderComponent,
    AppButtonComponent,
    FloatLabelInput,
    SwitchComponent,
    StatusBadgeComponent,
    SkeletonComponent,
    FailedStateComponent,
    EmptyStateComponent,
  ],
  templateUrl: "./services-form.html",
  styleUrl: "./services-form.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicesForm {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly servicesService = inject(ServicesService);
  private readonly breadcrumbs = inject(BreadcrumbService);
  private readonly language = inject(LanguageService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  private serviceId: number | null = null;

  protected readonly isEditMode = signal(false);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly saving = this.servicesService.saving;
  /** One entry per card, in the same order as the form's `branches` array. */
  protected readonly branchInfo = signal<ServiceBranchPricing[]>([]);

  protected readonly titleKey = computed(() =>
    this.isEditMode() ? "SERVICES.FORM.EDIT_TITLE" : "SERVICES.FORM.CREATE_TITLE",
  );
  protected readonly subtitleKey = computed(() =>
    this.isEditMode() ? "SERVICES.FORM.EDIT_SUBTITLE" : "SERVICES.FORM.CREATE_SUBTITLE",
  );
  protected readonly noBranches = computed(
    () => !this.loading() && !this.failed() && this.branchInfo().length === 0,
  );

  protected readonly form = createServiceForm(this.fb);

  protected get branchGroups(): FormArray<FormGroup> {
    return branchesArray(this.form);
  }

  constructor() {
    this.initializePage();
  }

  private initializePage(): void {
    const id = this.route.snapshot.paramMap.get("id");

    if (id === null) {
      this.load();
      return;
    }

    const serviceId = Number(id);
    if (!Number.isInteger(serviceId) || serviceId <= 0) {
      void this.router.navigate([LIST_ROUTE]);
      return;
    }

    this.serviceId = serviceId;
    this.isEditMode.set(true);
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);

    if (this.serviceId === null) {
      this.servicesService.getBranchesForForm().subscribe((branches) => {
        this.branchInfo.set(branches);
        applyBranchesToForm(this.fb, this.form, branches);
        this.loading.set(false);
      });
      return;
    }

    this.servicesService.getService(this.serviceId).subscribe((service) => {
      this.loading.set(false);
      if (!service) {
        this.failed.set(true);
        return;
      }
      this.branchInfo.set(service.branches);
      applyServiceToForm(this.fb, this.form, service);
      this.setBreadcrumbs(service);
    });
  }

  /** The route's static breadcrumb says "Edit service"; put the service name in the trail. */
  private setBreadcrumbs(service: ServiceDetails): void {
    this.breadcrumbs.setBreadcrumbs([
      { label: "LAYOUT.NAV.SERVICES", route: LIST_ROUTE },
      { label: localizedName(service.nameAr, service.nameEn, this.language.currentLang()) },
    ]);
  }

  // ── Template helpers ─────────────────────────────────
  protected branchName(index: number): string {
    const b = this.branchInfo()[index];
    return b ? localizedName(b.branchNameAr, b.branchNameEn, this.language.currentLang()) : "";
  }

  /** `true` when the branch has no price yet (edit mode) — the card shows a "set prices" state. */
  protected isUnpriced(index: number): boolean {
    return this.isEditMode() && !this.branchInfo()[index]?.isPriced;
  }

  /** Does this branch currently offer the booking type? (create mode: unknown → all highlighted) */
  protected uses(index: number, kind: "Regular" | "Vip" | "Home"): boolean {
    const b = this.branchInfo()[index];
    if (!b) return true;
    return kind === "Regular"
      ? b.branchAllowsRegular
      : kind === "Vip"
        ? b.branchAllowsVip
        : b.branchAllowsHome;
  }

  protected isHome(index: number): boolean {
    return !!this.branchGroups.at(index).get("isHomeAvailable")?.value;
  }

  protected isActive(index: number): boolean {
    return !!this.branchGroups.at(index).get("isActive")?.value;
  }

  /** Translation key of the first error of a name field once touched, else ''. */
  protected nameError(field: "nameAr" | "nameEn"): string {
    const control = this.form.get(field);
    if (!control?.touched || !control.errors) return "";
    const map = NAME_ERRORS[field];
    const key = Object.keys(control.errors).find((k) => map[k]);
    return key ? map[key] : "";
  }

  /** Translation key of the first error of a price field in one card once touched, else ''. */
  protected priceError(index: number, field: keyof typeof PRICE_ERRORS): string {
    const control = this.branchGroups.at(index).get(field);
    if (!control?.touched || !control.errors) return "";
    const map = PRICE_ERRORS[field];
    const key = Object.keys(control.errors).find((k) => map[k]);
    return key ? map[key] : "";
  }

  /** The card has an error the user can't see yet (used for the summary banner on submit). */
  protected cardInvalid(index: number): boolean {
    return this.branchGroups.at(index).invalid;
  }

  protected readonly submitted = signal(false);

  protected readonly invalidCount = computed(() => {
    this.submitted();
    return this.form.invalid ? this.branchGroups.controls.filter((g) => g.invalid).length : 0;
  });

  // ── Card actions ─────────────────────────────────────
  protected setHome(index: number, on: boolean): void {
    const group = this.branchGroups.at(index);
    group.patchValue(on ? { isHomeAvailable: true } : { isHomeAvailable: false, homePrice: "" });
    group.get("homePrice")?.updateValueAndValidity();
    group.markAsDirty();
  }

  protected setActive(index: number, on: boolean): void {
    const group = this.branchGroups.at(index);
    group.patchValue({ isActive: on });
    group.markAsDirty();
  }

  /** Copy one card's duration, prices, home and status onto every other branch. */
  protected copyToAll(index: number): void {
    const source = this.branchGroups.at(index).getRawValue();
    this.branchGroups.controls.forEach((group, i) => {
      if (i === index) return;
      group.patchValue({
        durationMinutes: source.durationMinutes,
        regularPrice: source.regularPrice,
        vipPrice: source.vipPrice,
        isHomeAvailable: source.isHomeAvailable,
        homePrice: source.isHomeAvailable ? source.homePrice : "",
        isActive: source.isActive,
      });
      group.get("homePrice")?.updateValueAndValidity();
      group.markAsDirty();
    });
  }

  // ── Actions ──────────────────────────────────────────
  protected submit(): void {
    this.submitted.set(true);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstError();
      return;
    }
    if (this.saving()) return;

    const payload = buildServicePayload(this.form.getRawValue() as ServiceFormValue);

    if (this.serviceId !== null) {
      this.servicesService.updateService(this.serviceId, payload).subscribe((ok) => {
        if (ok) void this.router.navigate([LIST_ROUTE]);
      });
      return;
    }

    this.servicesService.createService(payload).subscribe((id) => {
      if (id !== null) void this.router.navigate([LIST_ROUTE]);
    });
  }

  /** After the errors render, move focus to the first invalid field so keyboard / screen-reader users land on it. */
  private focusFirstError(): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLInputElement>(".fli--error input")?.focus(),
      { injector: this.injector },
    );
  }

  protected cancel(): void {
    void this.router.navigate([LIST_ROUTE]);
  }
}
