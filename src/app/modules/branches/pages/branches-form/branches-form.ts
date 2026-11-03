import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

import { FormArray, FormBuilder, ReactiveFormsModule } from "@angular/forms";

import { ActivatedRoute, Router } from "@angular/router";

import { finalize, map } from "rxjs";

import {
  BranchDayOfWeek,
  BranchDetails,
  BranchPayload,
  BranchWorkingHour,
} from "@modules/branches/model/branch.model";
import { BranchesService } from "@modules/branches/service/branches.service";
import { createBranchForm } from "@modules/branches/utils/branch-form.factory";
import { TranslateModule } from "@ngx-translate/core";

@Component({
  selector: "odl-branches-form",
  imports: [ReactiveFormsModule, TranslateModule],
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

  // Page State
  private branchId: number | null = null;

  protected readonly isEditMode = signal(false);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly dayNames = BranchDayOfWeek;
  // Form
  protected readonly form = createBranchForm(this.fb);

  protected get workingHours(): FormArray {
    return this.form.controls["workingHours"] as FormArray;
  }

  // Initialization
  constructor() {
    this.initializePage();
  }

  private initializePage(): void {
    const id = this.route.snapshot.paramMap.get("id");

    if (!id) {
      this.isEditMode.set(false);
      return;
    }

    const branchId = Number(id);

    if (!Number.isInteger(branchId) || branchId <= 0) {
      this.router.navigate(["/branches"]);
      return;
    }

    this.branchId = branchId;
    this.isEditMode.set(true);

    this.loadBranch();
  }

  // Load Branch
  private loadBranch(): void {
    if (this.branchId === null) return;

    this.loading.set(true);

    this.branchesService
      .getBranchById(this.branchId)
      .pipe(
        takeUntilDestroyed(),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (response) => {
          const branch = response.data;

          if (!branch) {
            this.router.navigate(["/branches"]);
            return;
          }

          this.form.patchValue({
            basicInfo: {
              nameAr: branch.nameAr,
              nameEn: branch.nameEn,
              address: branch.address,
              phone: branch.phone,
              mapUrl: branch.mapUrl ?? "",
            },

            bookingTypes: {
              allowsRegular: branch.allowsRegular,
              allowsVip: branch.allowsVip,
              allowsHome: branch.allowsHome,
            },
          });

          this.patchWorkingHours(branch.workingHours);
        },

        error: () => {
          this.router.navigate(["/branches"]);
        },
      });
  }

  // Working Hours
  private formatTime(time: string | null): string | null {
    return time ? time.substring(0, 5) : null;
  }

  private patchWorkingHours(workingHours: BranchDetails["workingHours"]): void {
    workingHours.forEach((day) => {
      const dayGroup = this.workingHours.controls.find(
        (control) => control.get("dayOfWeek")?.value === day.dayOfWeek,
      );

      if (!dayGroup) return;

      dayGroup.patchValue({
        isOpen: day.isOpen,
        openTime: this.formatTime(day.openTime),
        closeTime: this.formatTime(day.closeTime),
      });
    });
  }

  // Payload
  private toApiTime(time: string | null): string | null {
    return time ? `${time}:00` : null;
  }

  private buildPayload(): BranchPayload {
    const formValue = this.form.getRawValue();

    return {
      nameAr: formValue.basicInfo.nameAr.trim(),
      nameEn: formValue.basicInfo.nameEn.trim(),
      address: formValue.basicInfo.address.trim(),
      phone: formValue.basicInfo.phone.trim(),
      mapUrl: formValue.basicInfo.mapUrl.trim() || null,

      allowsRegular: formValue.bookingTypes.allowsRegular,
      allowsVip: formValue.bookingTypes.allowsVip,
      allowsHome: formValue.bookingTypes.allowsHome,

      workingHours: formValue.workingHours.map((day: BranchWorkingHour) => ({
        dayOfWeek: day.dayOfWeek,
        isOpen: day.isOpen,
        openTime: day.isOpen ? this.toApiTime(day.openTime) : null,
        closeTime: day.isOpen ? this.toApiTime(day.closeTime) : null,
      })),
    };
  }

  // Submit
  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.saving()) return;

    if (this.isEditMode() && this.branchId === null) return;

    const payload = this.buildPayload();

    this.saving.set(true);

    const request$ = this.isEditMode()
      ? this.branchesService
          .updateBranch(this.branchId!, payload)
          .pipe(map(() => undefined))
      : this.branchesService.createBranch(payload).pipe(map(() => undefined));

    request$.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.router.navigate(["/branches"]);
      },

      error: (error: unknown) => {
        console.error("Failed to save branch:", error);
      },
    });
  }
}
