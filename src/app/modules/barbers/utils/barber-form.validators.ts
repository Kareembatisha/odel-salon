import { AbstractControl, ValidationErrors } from "@angular/forms";

import { isValidEgyptianMobile, normalizeEgyptianPhone } from "./barber-phone.util";

/** Rejects whitespace-only text (`Validators.required` accepts "   "). */
export function notBlank(control: AbstractControl): ValidationErrors | null {
  return String(control.value ?? "").trim() ? null : { required: true };
}

/**
 * Accepts any common way of writing an Egyptian mobile (`01001234567`, `+20 100 123 4567`…) —
 * the form normalises it to `+201XXXXXXXXX` on submit. Empty is left to `required`.
 */
export function egyptianMobile(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? "").trim();
  if (!value) return null;
  return isValidEgyptianMobile(normalizeEgyptianPhone(value)) ? null : { phone: true };
}
