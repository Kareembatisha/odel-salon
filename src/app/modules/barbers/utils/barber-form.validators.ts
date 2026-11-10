import { AbstractControl, ValidationErrors } from "@angular/forms";

import { isValidEgyptianMobile, normalizeEgyptianPhone } from "./barber-phone.util";

/**
 * Accepts any common way of writing an Egyptian mobile (`01001234567`, `+20 100 123 4567`, `0100-123-4567`…) —
 * the form normalises it to `+201XXXXXXXXX` on submit. Empty is left to `required`.
 */
export function egyptianMobile(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? "").trim();
  if (!value) return null;
  // Separators are fine (spaces, dashes, dots, brackets, a leading +); letters or other symbols
  // would be silently stripped by the normaliser, so reject them instead of storing a
  // different number from the one typed.
  if (/[^\d\s+\-().]/.test(value)) return { phone: true };
  return isValidEgyptianMobile(normalizeEgyptianPhone(value)) ? null : { phone: true };
}
