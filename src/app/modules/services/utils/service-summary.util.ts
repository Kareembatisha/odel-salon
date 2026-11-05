import { PaginationMeta } from "@shared/model/api_response.model";
import { ServicesSummary } from "../model/service.model";

/** Zeroed summary — shown before the first response and when the API omits it. */
export const EMPTY_SERVICES_SUMMARY: ServicesSummary = {
  total: 0,
  active: 0,
  homeAvailable: 0,
  unpriced: 0,
};

/**
 * Reads the four summary-card counts from `GET /services` → `meta.additionalData`.
 *
 * `additionalData` is typed loosely, so every field is validated: anything missing or
 * not a finite number becomes 0 instead of rendering `undefined` / `NaN` in a card.
 */
export function readServicesSummary(
  meta: PaginationMeta | null | undefined,
): ServicesSummary {
  const data = meta?.additionalData;
  if (!data) return { ...EMPTY_SERVICES_SUMMARY };

  const count = (key: keyof ServicesSummary): number => {
    const value = data[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };

  return {
    total: count("total"),
    active: count("active"),
    homeAvailable: count("homeAvailable"),
    unpriced: count("unpriced"),
  };
}
