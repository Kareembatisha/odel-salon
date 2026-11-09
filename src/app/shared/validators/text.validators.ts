import { AbstractControl, ValidationErrors, ValidatorFn } from "@angular/forms";

/**
 * Rejects empty and whitespace-only text. `Validators.required` accepts `"   "`, which the
 * forms then trim to an empty string before sending.
 */
export function notBlank(control: AbstractControl): ValidationErrors | null {
  return String(control.value ?? "").trim() ? null : { required: true };
}

/**
 * `maxlength` measured on the **trimmed** text — the value the forms actually submit — so a
 * name that fits once trimmed is not rejected for a stray leading/trailing space.
 * Reports the same `maxlength` error shape as `Validators.maxLength`.
 */
export function maxTrimmedLength(max: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const length = String(control.value ?? "").trim().length;
    return length > max ? { maxlength: { requiredLength: max, actualLength: length } } : null;
  };
}
