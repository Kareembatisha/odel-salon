import {
  SERVICE_DURATION_MAX,
  SERVICE_DURATION_MIN,
  SERVICE_DURATION_STEP,
  SERVICE_PERCENTAGE_MAX,
  SERVICE_PERCENTAGE_MIN,
  SERVICE_PRICE_MAX,
} from "../model/service.model";

/** Placeholder shown where a branch has no price / duration yet. */
export const NO_VALUE = "—";

/**
 * "EGP 120" / "EGP 99.50" — whole pounds without decimals, otherwise 2 decimals.
 * `null` (unpriced, or no home price) renders as an em dash.
 */
export function formatPrice(
  value: number | null | undefined,
  lang: string,
  currency: string,
): string {
  if (value === null || value === undefined) return NO_VALUE;
  const number = new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${currency} ${number}`;
}

/** "30 min" / "1 h 30 min" — pass the translated unit labels. */
export function formatDuration(
  minutes: number | null | undefined,
  units: { h: string; min: string },
): string {
  if (minutes === null || minutes === undefined) return NO_VALUE;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} ${units.min}`;
  return m === 0 ? `${h} ${units.h}` : `${h} ${units.h} ${m} ${units.min}`;
}

/** Valid duration: 5…480 in steps of 5. */
export function isValidDuration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= SERVICE_DURATION_MIN &&
    value <= SERVICE_DURATION_MAX &&
    value % SERVICE_DURATION_STEP === 0
  );
}

/** Valid price: > 0, ≤ 100,000, at most 2 decimals. */
export function isValidPrice(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= SERVICE_PRICE_MAX &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
  );
}

/** Valid "change prices by %": -90…500 and not 0. */
export function isValidPercentage(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value !== 0 &&
    value >= SERVICE_PERCENTAGE_MIN &&
    value <= SERVICE_PERCENTAGE_MAX
  );
}

/**
 * New price after "Change prices by %": rounded to the nearest whole pound and never
 * below 1 (the backend rejects results above 100,000 — see {@link exceedsMaxPrice}).
 * Multiplies before dividing so 10 × +15% is exactly 11.5 → 12, not 11.499…
 */
export function applyPercentage(price: number, percentage: number): number {
  const raw = (price * (100 + percentage)) / 100;
  return Math.max(1, Math.round(raw + 1e-9));
}

/** True when {@link applyPercentage} would push the price over the 100,000 limit. */
export function exceedsMaxPrice(price: number, percentage: number): boolean {
  return applyPercentage(price, percentage) > SERVICE_PRICE_MAX;
}
