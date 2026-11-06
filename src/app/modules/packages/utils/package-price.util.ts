import { PackageServiceOption } from "../model/package.model";

/** What the selected services cost on their own, per booking type ("Before discount"). */
export interface ServicesTotals {
  regular: number;
  vip: number;
  /** null when nothing is selected or any service isn't available for home visits. */
  home: number | null;
  durationMinutes: number;
}

/**
 * Totals of the selected services in the package's branch — the same numbers the API
 * returns as `original*Price` / `durationMinutes` (the booking buffer is not included).
 * Also the upper bound for the package prices: each must be LOWER than its total.
 */
export function servicesTotals(
  services: readonly PackageServiceOption[],
): ServicesTotals {
  const sum = (pick: (s: PackageServiceOption) => number): number =>
    services.reduce((total, s) => total + pick(s), 0);

  const allHome =
    services.length > 0 && services.every((s) => s.isHomeAvailable);

  return {
    regular: sum((s) => s.regularPrice),
    vip: sum((s) => s.vipPrice),
    home: allHome ? sum((s) => s.homePrice ?? 0) : null,
    durationMinutes: sum((s) => s.durationMinutes),
  };
}

/**
 * "Save EGP X": the original total minus the package price, never negative. 0 when either
 * side is missing (e.g. "in branch only" has no home price), so callers show a saving only
 * when it is greater than 0.
 */
export function packageSavings(
  original: number | null | undefined,
  price: number | null | undefined,
): number {
  if (original == null || price == null) return 0;
  // Round to cents so 0.1 + 0.2 style float noise never shows up as "Save 0.30000000000000004".
  return Math.max(0, Math.round((original - price) * 100) / 100);
}
