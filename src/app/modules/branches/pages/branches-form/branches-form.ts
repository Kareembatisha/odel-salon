import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";

import { LanguageService } from "@core/services/language.service";
import { BreadcrumbService } from "../../../../layout/main-layout/components/header/breadcrumb.service";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { FailedStateComponent } from "@shared/components/failed-state/failed-state.component";
import { FloatLabelInput } from "@shared/components/float-label-input/float-label-input";
import { PageHeaderComponent } from "@shared/components/page-header/page-header.component";
import { SkeletonComponent } from "@shared/components/skeleton/skeleton.component";
import { SwitchComponent } from "@shared/components/switch/switch.component";
import { BranchDetails } from "../../model/branch.model";
import { dayKey } from "../../utils/branch-hours.util";
import { BranchesService } from "../../service/branches.service";
import { createBranchForm } from "../../utils/branch-form.factory";
import {
  BranchFormValue,
  applyBranchToForm,
  buildBranchPayload,
} from "../../utils/branch-form.mapper";

const LIST_ROUTE = "/main/branches";

/** Validation error → translation key, per field. */
const FIELD_ERRORS: Record<string, Record<string, string>> = {
  "basicInfo.nameAr": {
    required: "BRANCHES.VALIDATION.NAME_AR_REQUIRED",
    maxlength: "BRANCHES.VALIDATION.NAME_AR_MAX",
  },
  "basicInfo.nameEn": {
    required: "BRANCHES.VALIDATION.NAME_EN_REQUIRED",
    maxlength: "BRANCHES.VALIDATION.NAME_EN_MAX",
  },
  "basicInfo.address": {
    required: "BRANCHES.VALIDATION.ADDRESS_REQUIRED",
    maxlength: "BRANCHES.VALIDATION.ADDRESS_MAX",
  },
  "basicInfo.phone": {
    required: "BRANCHES.VALIDATION.PHONE_REQUIRED",
    pattern: "BRANCHES.VALIDATION.PHONE_INVALID",
  },
  "basicInfo.mapUrl": {
    invalidUrl: "BRANCHES.VALIDATION.URL_INVALID",
  },
};

/** Working-day group error → translation key. */
const DAY_ERRORS: Record<string, string> = {
  requiredTimes: "BRANCHES.VALIDATION.HOURS_REQUIRED",
  invalidTime: "BRANCHES.VALIDATION.HOURS_INVALID",
  minimumDuration: "BRANCHES.VALIDATION.HOURS_MIN_DURATION",
  invalidOvernightClose: "BRANCHES.VALIDATION.HOURS_OVERNIGHT",
};

/**
 * Create / edit branch page (`/branches/new`, `/branches/:id/edit`).
 *
 * One form for both modes; edit mode loads the branch first. A successful save
 * is announced by BranchesService (toast) and navigates to the branch details.
 */
@Component({
  selector: "odl-branches-form",
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslateModule,
    PageHeaderComponent,
    AppButtonComponent,
    FloatLabelInput,
    SwitchComponent,
    SkeletonComponent,
    FailedStateComponent,
  ],
  templateUrl: "./branches-form.html",
  styleUrl: "./branches-form.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BranchesForm {
  // Dependencies
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly branchesService = inject(BranchesService);
  private readonly breadcrumbs = inject(BreadcrumbService);
  private readonly language = inject(LanguageService);

  // Page State
  private branchId: number | null = null;

  protected readonly isEditMode = signal(false);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly saving = this.branchesService.saving;
  protected readonly dayKey = dayKey;

  protected readonly titleKey = computed(() =>
    this.isEditMode() ? "BRANCHES.FORM.EDIT_TITLE" : "BRANCHES.FORM.CREATE_TITLE",
  );
  protected readonly subtitleKey = computed(() =>
    this.isEditMode() ? "BRANCHES.FORM.EDIT_SUBTITLE" : "BRANCHES.FORM.CREATE_SUBTITLE",
  );

  // Form
  protected readonly form = createBranchForm(this.fb);

  protected get workingHours(): FormArray<FormGroup> {
    return this.form.controls["workingHours"] as FormArray<FormGroup>;
  }

  constructor() {
    this.initializePage();
  }

  private initializePage(): void {
    const id = this.route.snapshot.paramMap.get("id");

    if (!id) return;

    const branchId = Number(id);

    if (!Number.isInteger(branchId) || branchId <= 0) {
      this.router.navigate([LIST_ROUTE]);
      return;
    }

    this.branchId = branchId;
    this.isEditMode.set(true);
    this.loadBranch();
  }

  protected loadBranch(): void {
    if (this.branchId === null) return;

    this.loading.set(true);
    this.failed.set(false);

    this.branchesService.getBranch(this.branchId).subscribe((branch) => {
      this.loading.set(false);

      if (!branch) {
        this.failed.set(true);
        return;
      }

      applyBranchToForm(this.form, branch);
      this.setBreadcrumbs(branch);
    });
  }

  /** The route's static breadcrumb says "Edit Branch"; put the branch name in the trail. */
  private setBreadcrumbs(branch: BranchDetails): void {
    this.breadcrumbs.setBreadcrumbs([
      { label: "LAYOUT.NAV.BRANCHES", route: LIST_ROUTE },
      {
        label: this.language.currentLang() === "ar" ? branch.nameAr : branch.nameEn,
        route: `${LIST_ROUTE}/${branch.id}`,
      },
      { label: "BRANCHES.FORM.EDIT_TITLE" },
    ]);
  }

  // Template helpers
  /** Translation key of the first error on a field once it was touched, else ''. */
  protected error(path: string): string {
    const control = this.form.get(path);

    if (!control?.touched || !control.errors) return "";

    const map = FIELD_ERRORS[path] ?? {};
    const key = Object.keys(control.errors).find((k) => map[k]);

    return key ? map[key] : "";
  }

  /** Error of one working day — shown once both times were visited (or on submit). */
  protected dayError(index: number): string {
    const day = this.workingHours.at(index);
    const times = day.get("openTime")?.touched && day.get("closeTime")?.touched;

    if (!times || !day.errors) return "";

    const key = Object.keys(day.errors).find((k) => DAY_ERRORS[k]);

    return key ? DAY_ERRORS[key] : "";
  }

  protected bookingTypesError(): boolean {
    const group = this.form.get("bookingTypes");

    return !!group?.touched && group.hasError("atLeastOneRequired");
  }

  protected isOpen(index: number): boolean {
    return !!this.workingHours.at(index).get("isOpen")?.value;
  }

  /** Closing a day clears its times — the API rejects times on a closed day. */
  protected setOpen(index: number, open: boolean): void {
    const day = this.workingHours.at(index);

    day.patchValue(open ? { isOpen: true } : { isOpen: false, openTime: null, closeTime: null });
    day.markAsDirty();
  }

  // Actions
  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.saving()) return;

    const payload = buildBranchPayload(this.form.getRawValue() as BranchFormValue);

    if (this.isEditMode()) {
      if (this.branchId === null) return;

      const id = this.branchId;
      this.branchesService.updateBranch(id, payload).subscribe((ok) => {
        if (ok) this.router.navigate([LIST_ROUTE, id]);
      });
      return;
    }

    this.branchesService.createBranch(payload).subscribe((id) => {
      if (id !== null) this.router.navigate([LIST_ROUTE, id]);
    });
  }

  protected cancel(): void {
    this.router.navigate(
      this.isEditMode() && this.branchId !== null ? [LIST_ROUTE, this.branchId] : [LIST_ROUTE],
    );
  }
}
