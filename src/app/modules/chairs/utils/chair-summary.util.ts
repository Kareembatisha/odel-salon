import { PaginationMeta } from "@shared/model/api_response.model";
import { ChairsSummary } from "../model/chair.model";

/** Zeroed summary — shown before the first response and when the API omits it. */
export const EMPTY_CHAIRS_SUMMARY: ChairsSummary = {
  regularActive: 0,
  vipActive: 0,
  inactive: 0,
};

/**
 * Reads the three summary-card counts from `GET /chairs` → `meta.additionalData`.
 *
 * `additionalData` is typed loosely (`Record<string, unknown>`), so every field is
 * validated: anything missing or not a finite number becomes 0 instead of rendering
 * `undefined` / `NaN` in a stat card.
 */
export function readChairsSummary(
  meta: PaginationMeta | null | undefined,
): ChairsSummary {
  const data = meta?.additionalData;
  if (!data) return { ...EMPTY_CHAIRS_SUMMARY };

  const count = (key: keyof ChairsSummary): number => {
    const value = data[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };

  return {
    regularActive: count("regularActive"),
    vipActive: count("vipActive"),
    inactive: count("inactive"),
  };
}
