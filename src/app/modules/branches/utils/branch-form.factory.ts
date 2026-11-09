import { FormArray, FormBuilder, FormGroup, Validators } from "@angular/forms";

import { BranchDayOfWeek } from "@modules/branches/model/branch.model";

import { maxTrimmedLength, notBlank } from "@shared/validators/text.validators";
import {
  atLeastOneBookingTypeValidator,
  optionalUrlValidator,
  workingHourValidator,
} from "./branch-form.validators";

// Working days
export const BRANCH_DAYS = [
  BranchDayOfWeek.Saturday,
  BranchDayOfWeek.Sunday,
  BranchDayOfWeek.Monday,
  BranchDayOfWeek.Tuesday,
  BranchDayOfWeek.Wednesday,
  BranchDayOfWeek.Thursday,
  BranchDayOfWeek.Friday,
];

// Create one working day
export function createWorkingHourGroup(fb: FormBuilder, day: BranchDayOfWeek): FormGroup {
  return fb.group(
    {
      dayOfWeek: [day],
      isOpen: [false],
      openTime: fb.control<string | null>(null),
      closeTime: fb.control<string | null>(null),
    },
    {
      validators: [workingHourValidator()],
    },
  );
}

// Create working hours FormArray
export function createWorkingHours(fb: FormBuilder): FormArray<FormGroup> {
  return fb.array(BRANCH_DAYS.map((day) => createWorkingHourGroup(fb, day)));
}

// Create complete branch form
export function createBranchForm(fb: FormBuilder): FormGroup {
  return fb.group({
    // Basic Information
    basicInfo: fb.group({
      nameAr: ["", [notBlank, maxTrimmedLength(100)]],

      nameEn: ["", [notBlank, maxTrimmedLength(100)]],

      address: ["", [notBlank, maxTrimmedLength(250)]],

      phone: ["", [Validators.required, Validators.pattern(/^\+201[0125][0-9]{8}$/)]],

      mapUrl: ["", [optionalUrlValidator()]],
    }),

    // Booking Types
    bookingTypes: fb.group(
      {
        allowsRegular: [false],
        allowsVip: [false],
        allowsHome: [false],
      },
      {
        validators: [atLeastOneBookingTypeValidator()],
      },
    ),

    // Working Hours
    workingHours: createWorkingHours(fb),
  });
}
