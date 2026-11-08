import { OfferStatus } from "../model/offer.model";
import { cairoToday } from "./offer-dates.util";

/** What decides an offer's status. */
export interface OfferStatusInput {
  startDate: string;
  endDate: string | null;
  maxBookings: number | null;
  bookingsCount: number;
  stoppedAt: string | null;
}

/**
 * Status as the backend calculates it, from the dates (Cairo time) and the stop button:
 * Stopped (explicit action, always wins) → Ended (end date passed) → LimitReached (full) →
 * Scheduled (starts later) → Active. Only the mock backend needs this — the real API sends `status`.
 */
export function deriveOfferStatus(
  offer: OfferStatusInput,
  today: string = cairoToday(),
): OfferStatus {
  if (offer.stoppedAt !== null) return OfferStatus.Stopped;
  if (offer.endDate !== null && offer.endDate < today) return OfferStatus.Ended;
  if (offer.maxBookings !== null && offer.bookingsCount >= offer.maxBookings)
    return OfferStatus.LimitReached;
  if (offer.startDate > today) return OfferStatus.Scheduled;
  return OfferStatus.Active;
}

/** The list tabs. "Ended or full" groups Ended, LimitReached and Stopped. */
export type OfferTab = "all" | "active" | "scheduled" | "endedOrFull";

export const OFFER_TABS: readonly OfferTab[] = ["all", "active", "scheduled", "endedOrFull"];

/** The `statuses` query for a tab; `undefined` (no filter) for "All". */
export function statusesForTab(tab: OfferTab): OfferStatus[] | undefined {
  switch (tab) {
    case "active":
      return [OfferStatus.Active];
    case "scheduled":
      return [OfferStatus.Scheduled];
    case "endedOrFull":
      return [OfferStatus.Ended, OfferStatus.LimitReached, OfferStatus.Stopped];
    default:
      return undefined;
  }
}
