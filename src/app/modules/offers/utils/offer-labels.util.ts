import { StatusBadgeVariant } from "@shared/components/status-badge/status-badge.component";
import { OfferListItem, OfferStatus } from "../model/offer.model";

/** i18n key of a status label (`OFFERS.STATUS.*`). */
const STATUS_KEYS: Record<OfferStatus, string> = {
  [OfferStatus.Active]: "OFFERS.STATUS.ACTIVE",
  [OfferStatus.Scheduled]: "OFFERS.STATUS.SCHEDULED",
  [OfferStatus.Ended]: "OFFERS.STATUS.ENDED",
  [OfferStatus.LimitReached]: "OFFERS.STATUS.LIMIT_REACHED",
  [OfferStatus.Stopped]: "OFFERS.STATUS.STOPPED",
};

const STATUS_VARIANTS: Record<OfferStatus, StatusBadgeVariant> = {
  [OfferStatus.Active]: "success",
  [OfferStatus.Scheduled]: "info",
  [OfferStatus.Ended]: "neutral",
  [OfferStatus.LimitReached]: "warning",
  [OfferStatus.Stopped]: "danger",
};

/** Translation key for a status badge. An unknown status (newer backend) falls back to Ended's. */
export function offerStatusKey(status: OfferStatus): string {
  return STATUS_KEYS[status] ?? STATUS_KEYS[OfferStatus.Ended];
}

/** Badge colour for a status. Text is always shown too, so colour is never the only signal. */
export function offerStatusVariant(status: OfferStatus): StatusBadgeVariant {
  return STATUS_VARIANTS[status] ?? "neutral";
}

/** Stopped offers can be resumed; every other status can be stopped (except Ended, see below). */
export function isOfferStopped(offer: Pick<OfferListItem, "status">): boolean {
  return offer.status === OfferStatus.Stopped;
}

/**
 * Whether the card shows the Stop / Resume button. The contract doesn't say; it is hidden on
 * Ended offers (nothing left to stop) and kept on Stopped ones (so they can be resumed).
 */
export function canToggleOffer(offer: Pick<OfferListItem, "status">): boolean {
  return offer.status !== OfferStatus.Ended;
}

/** The bookings line parts: "0 / 50", or "0 · No limit" when `maxBookings` is null. */
export function offerBookingsText(
  offer: Pick<OfferListItem, "bookingsCount" | "maxBookings">,
  noLimitLabel: string,
): string {
  return offer.maxBookings === null
    ? `${offer.bookingsCount} · ${noLimitLabel}`
    : `${offer.bookingsCount} / ${offer.maxBookings}`;
}
