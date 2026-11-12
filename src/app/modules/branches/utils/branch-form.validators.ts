import { AbstractControl, ValidationErrors, ValidatorFn } from "@angular/forms";

// Convert HH:mm to minutes
function toMinutes(time: string): number | null {
  const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);

  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
}

/** Egyptian mobile in international format: +20 10/11/12/15 followed by 8 digits. */
export const EGYPT_INTL_MOBILE = /^\+201[0125][0-9]{8}$/;

// Optional mobile-wallet number: empty is fine, otherwise the trimmed text must match.
export function optionalIntlMobileValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? "").trim();

    if (!value) return null;

    return EGYPT_INTL_MOBILE.test(value) ? null : { pattern: true };
  };
}

// Optional URL Validator
export function optionalUrlValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value?.trim();

    if (!value) return null;

    try {
      const url = new URL(value);

      return url.protocol === "http:" || url.protocol === "https:" ? null : { invalidUrl: true };
    } catch {
      return { invalidUrl: true };
    }
  };
}

// At least one booking type
export function atLeastOneBookingTypeValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const { allowsRegular, allowsVip, allowsHome } = control.value;

    return allowsRegular || allowsVip || allowsHome ? null : { atLeastOneRequired: true };
  };
}

// Working hours Validator
export function workingHourValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const { isOpen, openTime, closeTime } = control.value;

    if (!isOpen) {
      return openTime === null && closeTime === null ? null : { closedDayHasTimes: true };
    }

    if (!openTime || !closeTime) {
      return { requiredTimes: true };
    }

    const openMinutes = toMinutes(openTime);
    const closeMinutes = toMinutes(closeTime);

    if (openMinutes === null || closeMinutes === null) {
      return { invalidTime: true };
    }

    if (closeMinutes <= openMinutes) {
      if (closeMinutes > 360) {
        return { invalidOvernightClose: true };
      }

      const duration = closeMinutes + 1440 - openMinutes;

      return duration >= 60 ? null : { minimumDuration: true };
    }

    const duration = closeMinutes - openMinutes;

    return duration >= 60 ? null : { minimumDuration: true };
  };
}
