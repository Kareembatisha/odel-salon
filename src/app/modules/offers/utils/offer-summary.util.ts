import { PaginationMeta } from "@shared/model/api_response.model";
import { OffersSummary } from "../model/offer.model";
import { OfferTab } from "./offer-status.util";

export const EMPTY_OFFERS_SUMMARY: OffersSummary = { all: 0, active: 0, scheduled: 0, endedOrFull: 0 };

/**
 * Reads the tab counts from `GET /offers` → `meta.additionalData` (whole branch, ignores
 * search / statuses). Anything missing or not a finite number becomes 0.
 */
export function readOffersSummary(meta: PaginationMeta | null | undefined): OffersSummary {
  const data = meta?.additionalData;
  if (!data) return { ...EMPTY_OFFERS_SUMMARY };

  const count = (key: keyof OffersSummary): number => {
    const value = data[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };

  return {
    all: count("all"),
    active: count("active"),
    scheduled: count("scheduled"),
    endedOrFull: count("endedOrFull"),
  };
}

/** The count shown on a tab (`OfferTab` and `OffersSummary` share their key names). */
export function tabCount(summary: OffersSummary, tab: OfferTab): number {
  return summary[tab];
}
