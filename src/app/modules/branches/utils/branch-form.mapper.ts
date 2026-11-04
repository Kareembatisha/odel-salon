import { FormArray, FormGroup } from "@angular/forms";

import {
  BranchDayOfWeek,
  BranchDetails,
  BranchPayload,
} from "../model/branch.model";

// ============================================================
// Branch form ⇄ API mapping
// ============================================================

/** Shape of `form.getRawValue()` for the form built by `createBranchForm`. */
export interface BranchFormValue {
  basicInfo: {
    nameAr: string;
    nameEn: string;
    address: string;
    phone: string;
    mapUrl: string;
  };
  bookingTypes: {
    allowsRegular: boolean;
    allowsVip: boolean;
    allowsHome: boolean;
  };
  workingHours: Array<{
    dayOfWeek: BranchDayOfWeek;
    isOpen: boolean;
    openTime: string | null;
    closeTime: string | null;
  }>;
}

/** API `HH:mm:ss` → time input `HH:mm`. */
export function toFormTime(time: string | null): string | null {
  return time ? time.substring(0, 5) : null;
}

/** Time input `HH:mm` → API `HH:mm:ss`. */
export function toApiTime(time: string | null): string | null {
  return time ? `${time.substring(0, 5)}:00` : null;
}

/** Trim text, turn an empty map link into `null`, and drop times of closed days. */
export function buildBranchPayload(value: BranchFormValue): BranchPayload {
  const { basicInfo, bookingTypes, workingHours } = value;

  return {
    nameAr: basicInfo.nameAr.trim(),
    nameEn: basicInfo.nameEn.trim(),
    address: basicInfo.address.trim(),
    phone: basicInfo.phone.trim(),
    mapUrl: basicInfo.mapUrl.trim() || null,

    allowsRegular: bookingTypes.allowsRegular,
    allowsVip: bookingTypes.allowsVip,
    allowsHome: bookingTypes.allowsHome,

    workingHours: workingHours.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      isOpen: day.isOpen,
      openTime: day.isOpen ? toApiTime(day.openTime) : null,
      closeTime: day.isOpen ? toApiTime(day.closeTime) : null,
    })),
  };
}

/**
 * Fill the form from a loaded branch. Days are matched by `dayOfWeek`, not
 * position, because the API may return them in any order. Leaves the form pristine.
 */
export function applyBranchToForm(form: FormGroup, branch: BranchDetails): void {
  form.patchValue({
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

  const days = (form.get("workingHours") as FormArray<FormGroup>).controls;

  branch.workingHours.forEach((day) => {
    const group = days.find(
      (control) => control.get("dayOfWeek")?.value === day.dayOfWeek,
    );

    group?.patchValue({
      isOpen: day.isOpen,
      openTime: toFormTime(day.openTime),
      closeTime: toFormTime(day.closeTime),
    });
  });

  form.markAsPristine();
}
