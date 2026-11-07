import { OFFER_IMAGE_MAX_BYTES, OFFER_IMAGE_TYPES } from "../model/offer.model";

/** Why a banner was refused client-side (the backend answers `400 Invalid image` otherwise). */
export type OfferImageError = "type" | "size";

/**
 * Checks a chosen banner against the contract: JPG / PNG / WebP, up to 5 MB.
 * Returns `null` when it is fine. 1200 × 675 (16:9) is only recommended, not enforced.
 */
export function validateOfferImage(file: File): OfferImageError | null {
  if (!OFFER_IMAGE_TYPES.includes(file.type)) return "type";
  if (file.size > OFFER_IMAGE_MAX_BYTES) return "size";
  return null;
}
