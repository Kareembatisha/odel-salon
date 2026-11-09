import { FormArray, FormBuilder, FormGroup } from "@angular/forms";

import { maxTrimmedLength, notBlank } from "@shared/validators/text.validators";
import { SERVICE_NAME_MAX_LENGTH } from "../model/service.model";
import { durationValidator, homePriceValidator, priceValidator } from "./service-form.validators";

/**
 * One branch's price row. Numbers are held as strings because the text field is a string
 * ControlValueAccessor; {@link buildServicePayload} converts them.
 */
export function createBranchPricingGroup(fb: FormBuilder, branchId: number): FormGroup {
  return fb.group({
    branchId: [branchId],
    durationMinutes: ["", [durationValidator()]],
    regularPrice: ["", [priceValidator()]],
    vipPrice: ["", [priceValidator()]],
    isHomeAvailable: [false],
    homePrice: ["", [homePriceValidator()]],
    isActive: [true],
  });
}

/** Complete create / edit service form: names + one price group per branch. */
export function createServiceForm(fb: FormBuilder): FormGroup {
  return fb.group({
    nameAr: ["", [notBlank, maxTrimmedLength(SERVICE_NAME_MAX_LENGTH)]],
    nameEn: ["", [notBlank, maxTrimmedLength(SERVICE_NAME_MAX_LENGTH)]],
    branches: fb.array<FormGroup>([]),
  });
}

/** The `branches` array of {@link createServiceForm}. */
export function branchesArray(form: FormGroup): FormArray<FormGroup> {
  return form.controls["branches"] as FormArray<FormGroup>;
}
