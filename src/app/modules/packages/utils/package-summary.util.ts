import { PaginationMeta } from "@shared/model/api_response.model";
import { PackagesSummary } from "../model/package.model";

/** Zeroed summary — shown before the first response and when the API omits it. */
export const EMPTY_PACKAGES_SUMMARY: PackagesSummary = {
  total: 0,
  active: 0,
};

/**
 * Reads the summary-card counts from `GET /packages` → `meta.additionalData`.
 *
 * `additionalData` is typed loosely, so every field is validated: anything missing or
 * not a finite number becomes 0 instead of rendering `undefined` / `NaN` in a card.
 */
export function readPackagesSummary(meta: PaginationMeta | null | undefined): PackagesSummary {
  const data = meta?.additionalData;
  if (!data) return { ...EMPTY_PACKAGES_SUMMARY };

  const count = (key: keyof PackagesSummary): number => {
    const value = data[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };

  return {
    total: count("total"),
    active: count("active"),
  };
}
