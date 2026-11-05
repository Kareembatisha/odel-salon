import { AbstractControl, ValidationErrors, ValidatorFn } from "@angular/forms";

import { isValidDuration, isValidPrice } from "./service-price.util";

/** Number typed into a text field → `NaN` when empty or not a number (never 0 for ""). */
function toNumber(value: unknown): number {
  const text = String(value ?? "").trim();
  return text === "" ? NaN : Number(text);
}

/** Duration: required, 5…480 in steps of 5. Errors: `required` | `duration`. */
export function durationValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (String(control.value ?? "").trim() === "") return { required: true };
    return isValidDuration(toNumber(control.value)) ? null : { duration: true };
  };
}

/** Price: required, > 0, ≤ 100,000, at most 2 decimals. Errors: `required` | `price`. */
export function priceValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (String(control.value ?? "").trim() === "") return { required: true };
    return isValidPrice(toNumber(control.value)) ? null : { price: true };
  };
}

/**
 * Home price: only checked while the sibling `isHomeAvailable` control is on (the API wants
 * `null` otherwise). Re-validate it whenever that switch changes.
 */
export function homePriceValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.parent?.get("isHomeAvailable")?.value) return null;
    return priceValidator()(control);
  };
}
