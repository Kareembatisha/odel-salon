import { ServiceListItem, ServiceOption } from "../model/service.model";

/**
 * The services a package / offer can bundle for one branch: every ACTIVE, priced service,
 * flattened, oldest first (ascending id). Anything not priced or not active there is left out —
 * the API refuses it in a bundle anyway.
 */
export function toServiceOptions(rows: readonly ServiceListItem[]): ServiceOption[] {
  return rows
    .filter((row) => row.pricing.isActive)
    .map(
      (row): ServiceOption => ({
        id: row.id,
        nameAr: row.nameAr,
        nameEn: row.nameEn,
        durationMinutes: row.pricing.durationMinutes ?? 0,
        regularPrice: row.pricing.regularPrice ?? 0,
        vipPrice: row.pricing.vipPrice ?? 0,
        isHomeAvailable: row.pricing.isHomeAvailable,
        homePrice: row.pricing.isHomeAvailable ? row.pricing.homePrice : null,
      }),
    )
    .sort((a, b) => a.id - b.id);
}

/** What the selected services cost on their own, per booking type ("Before discount"). */
export interface ServicesTotals {
  regular: number;
  vip: number;
  /** null when nothing is selected or any service isn't available for home visits. */
  home: number | null;
  durationMinutes: number;
}

/**
 * Totals of the selected services in the bundle's branch — the same numbers the API returns as
 * `original*Price` / `durationMinutes` (the booking buffer is not included).
 * Also the upper bound for the bundle prices: each must be LOWER than its total.
 */
export function servicesTotals(services: readonly ServiceOption[]): ServicesTotals {
  const sum = (pick: (s: ServiceOption) => number): number =>
    services.reduce((total, s) => total + pick(s), 0);

  const allHome = services.length > 0 && services.every((s) => s.isHomeAvailable);

  return {
    regular: sum((s) => s.regularPrice),
    vip: sum((s) => s.vipPrice),
    home: allHome ? sum((s) => s.homePrice ?? 0) : null,
    durationMinutes: sum((s) => s.durationMinutes),
  };
}

/**
 * "Save EGP X": the original total minus the bundle price, never negative. 0 when either side
 * is missing (e.g. "in branch only" has no home price), so callers show a saving only when it
 * is greater than 0.
 */
export function savingsAmount(
  original: number | null | undefined,
  price: number | null | undefined,
): number {
  if (original == null || price == null) return 0;
  // Round to cents so 0.1 + 0.2 style float noise never shows up as "Save 0.30000000000000004".
  return Math.max(0, Math.round((original - price) * 100) / 100);
}

/**
 * The "Save 22%" badge: how much cheaper the bundle is than its services apart, as a whole
 * percent (rounded). 0 when the bundle is not cheaper or there is no original to compare with.
 */
export function savingPercent(
  original: number | null | undefined,
  price: number | null | undefined,
): number {
  if (original == null || price == null || original <= 0 || price >= original) return 0;
  return Math.round(((original - price) / original) * 100);
}
