/**
 * offer.model.ts — data contracts for the Offers feature.
 * Mirrors API Contract — Offers (GET/POST/PUT/PATCH/DELETE /offers).
 *
 * An offer bundles at least one service of ONE branch at a discounted price per booking type
 * (regular / VIP / home), for a date range, with an optional banner and booking cap.
 * Offers never move between branches. All prices are EGP; all dates are `yyyy-MM-dd` (Cairo).
 */

// ============================================================
// Status
// ============================================================

/**
 * Calculated by the backend from the dates (Cairo time) and the stop button.
 * `LimitReached` never appears until the bookings module exists.
 */
export enum OfferStatus {
  Active = 0,
  Scheduled = 1,
  Ended = 2,
  LimitReached = 3,
  Stopped = 4,
}

// ============================================================
// Read models
// ============================================================

/** One service inside an offer (names only — prices come from the branch's price table). */
export interface OfferServiceRef {
  serviceId: number;
  nameAr: string;
  nameEn: string;
}

/**
 * GET /offers → data[] (sorted by newest start date first).
 *
 * `original*Price` is the CURRENT total of the services' prices in this branch ("was" price);
 * `savingPercent` is the "Save 22%" badge (based on the Regular price). `originalHomePrice` is
 * null when any service isn't available for home visits; `homePrice` null = "In branch only".
 * `endDate` null = "No end"; `maxBookings` null = "No limit"; `imageUrl` null = no banner.
 * `bookingsCount` is always 0 until the bookings module is ready.
 */
export interface OfferListItem {
  id: number;
  branchId: number;
  nameAr: string;
  nameEn: string;
  imageUrl: string | null;
  regularPrice: number;
  vipPrice: number;
  homePrice: number | null;
  startDate: string;
  endDate: string | null;
  maxBookings: number | null;
  bookingsCount: number;
  status: OfferStatus;
  /** UTC ISO string, set while the offer is stopped. */
  stoppedAt: string | null;
  services: OfferServiceRef[];
  originalRegularPrice: number;
  originalVipPrice: number;
  originalHomePrice: number | null;
  savingPercent: number;
}

/** GET /offers query. `branchId` is required (404 if the branch doesn't exist). */
export interface OffersQuery {
  branchId: number;
  /** Defaults to 1. */
  pageNumber: number;
  /** Defaults to 20, max 100. */
  pageSize: number;
  /** Matches the Arabic or English name. */
  search?: string;
  /** Sent as a repeated `statuses` key; empty / undefined = every status. */
  statuses?: OfferStatus[];
}

/**
 * GET /offers → meta.additionalData — the tab counts.
 * Counts cover the WHOLE branch and ignore search / statuses.
 */
export interface OffersSummary {
  all: number;
  active: number;
  scheduled: number;
  endedOrFull: number;
}

/** GET /offers/{id}. `createdAt` / `updatedAt` are UTC ISO strings. */
export interface OfferDetails extends OfferListItem {
  branchNameAr: string;
  branchNameEn: string;
  /** Sum of the services' durations in the branch (the booking buffer is not included). */
  durationMinutes: number;
  createdAt: string;
  updatedAt: string | null;
}

// ============================================================
// Write models
// ============================================================

/** POST /offers (multipart/form-data). New offers start active (or scheduled, by their dates). */
export interface CreateOfferPayload {
  /** Required; can't be changed later. */
  branchId: number;
  /** Required, max 100. Names may repeat (e.g. a yearly offer). */
  nameAr: string;
  nameEn: string;
  /** At least 1 service, no duplicates, each ACTIVE in the branch. */
  serviceIds: number[];
  /** > 0, ≤ 100,000, ≤ 2 decimals, and LOWER than the services' total in the branch. */
  regularPrice: number;
  vipPrice: number;
  /** null = in branch only. Allowed only when every selected service is home-available. */
  homePrice: number | null;
  /** Required `yyyy-MM-dd`; today or later (Cairo date) when creating. */
  startDate: string;
  /** Optional `yyyy-MM-dd`, on or after `startDate`; null = no end. */
  endDate: string | null;
  /** Optional, 1 to 100,000; null = no limit. */
  maxBookings: number | null;
  /** Optional banner: JPG / PNG / WebP up to 5 MB (1200 × 675, 16:9 recommended). */
  image?: File | null;
}

/**
 * PUT /offers/{id} (multipart/form-data) — same fields and rules as create, without `branchId`.
 * `startDate` may be in the past (so a running offer can be edited).
 * Banner: `image` replaces it · `removeImage` (with no image) removes it · neither keeps it.
 * Stop / resume is not part of it (see toggle status).
 */
export interface UpdateOfferPayload extends Omit<CreateOfferPayload, "branchId"> {
  removeImage: boolean;
}

/** DELETE /offers body — bulk delete, all-or-nothing, `ids` must not be empty. */
export interface DeleteOffersRequest {
  ids: number[];
}

// ============================================================
// Limits (API contract)
// ============================================================

export const OFFER_NAME_MAX_LENGTH = 100;
export const OFFER_MIN_SERVICES = 1;
export const OFFER_PRICE_MAX = 100_000;
export const OFFER_MAX_BOOKINGS_MAX = 100_000;

/** Banner size limit: 5 MB. */
export const OFFER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Accepted banner MIME types (JPG / PNG / WebP). */
export const OFFER_IMAGE_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

/** `accept` attribute for the banner file input. */
export const OFFER_IMAGE_ACCEPT = OFFER_IMAGE_TYPES.join(",");
