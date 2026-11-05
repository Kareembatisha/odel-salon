/**
 * service.model.ts — data contracts for the Services (Menu & Pricing) feature.
 * Mirrors API Contract — Services (GET/POST/PUT/PATCH/DELETE /services …).
 *
 * A service is ONE record with a price table per branch: the same haircut can last
 * 30 min and cost 120 EGP in one branch and cost 110 EGP in another. All prices are EGP.
 */

// ============================================================
// Read models
// ============================================================

/**
 * `pricing` of one service in the branch the list was requested for.
 * When `isPriced` is false the service has no prices in this branch yet (e.g. the
 * branch was added after the service) and every other value is null / false.
 */
export interface ServicePricing {
  isPriced: boolean;
  durationMinutes: number | null;
  regularPrice: number | null;
  vipPrice: number | null;
  isHomeAvailable: boolean;
  homePrice: number | null;
  isActive: boolean;
}

/** GET /services → data[] (the price table of ONE branch). */
export interface ServiceListItem {
  id: number;
  nameAr: string;
  nameEn: string;
  pricing: ServicePricing;
}

/**
 * GET /services → meta.additionalData — the four summary cards.
 * Counts cover the WHOLE branch and ignore search / isActive / isHomeAvailable.
 * `homeAvailable` = ACTIVE services available for home visits.
 */
export interface ServicesSummary {
  total: number;
  active: number;
  homeAvailable: number;
  unpriced: number;
}

/** GET /services query. `branchId` is required (404 if the branch doesn't exist). */
export interface ServicesQuery {
  branchId: number;
  /** Defaults to 1. */
  pageNumber: number;
  /** Defaults to 20, max 100. */
  pageSize: number;
  /** Matches the Arabic or English name. */
  search?: string;
  /** true = active only, false = inactive only, undefined = all. */
  isActive?: boolean;
  /** true = home-available only, false = in-branch only, undefined = all. */
  isHomeAvailable?: boolean;
}

/** One branch of GET /services/{id} → `branches`. Lists EVERY branch, priced or not. */
export interface ServiceBranchPricing {
  branchId: number;
  branchNameAr: string;
  branchNameEn: string;
  /** Which booking types the branch currently offers (highlights the prices in use). */
  branchAllowsRegular: boolean;
  branchAllowsVip: boolean;
  branchAllowsHome: boolean;
  isPriced: boolean;
  durationMinutes: number | null;
  regularPrice: number | null;
  vipPrice: number | null;
  isHomeAvailable: boolean;
  homePrice: number | null;
  isActive: boolean;
}

/** GET /services/{id}. `createdAt` / `updatedAt` are UTC ISO strings. */
export interface ServiceDetails {
  id: number;
  nameAr: string;
  nameEn: string;
  createdAt: string;
  updatedAt: string | null;
  branches: ServiceBranchPricing[];
}

// ============================================================
// Write models
// ============================================================

/**
 * One branch of the POST / PUT body. `regularPrice` and `vipPrice` are ALWAYS required
 * (even if the branch doesn't offer VIP yet); `homePrice` is required when
 * `isHomeAvailable` is true and must be `null` for "in branch only".
 */
export interface ServiceBranchPayload {
  branchId: number;
  durationMinutes: number;
  regularPrice: number;
  vipPrice: number;
  isHomeAvailable: boolean;
  homePrice: number | null;
  isActive: boolean;
}

/**
 * Shared body of POST /services and PUT /services/{id}.
 * `branches` MUST contain every existing branch exactly once.
 */
export interface ServicePayload {
  nameAr: string;
  nameEn: string;
  branches: ServiceBranchPayload[];
}

/** DELETE /services body — bulk delete, all-or-nothing. */
export interface DeleteServicesRequest {
  ids: number[];
}

/**
 * PATCH /services/{id}/branches/status body.
 * `isActive` is the TARGET state for every listed branch (not a toggle).
 * The row switch in the table sends a single branch id.
 */
export interface SetServiceStatusRequest {
  branchIds: number[];
  isActive: boolean;
}

/** POST /services/copy-prices body — "Copy prices from another branch". */
export interface CopyPricesRequest {
  sourceBranchId: number;
  targetBranchId: number;
}

/** POST /services/adjust-prices body — "Change prices by %". */
export interface AdjustPricesRequest {
  branchId: number;
  /** -90 … 500, not 0 (10 = +10%, -15 = 15% off). */
  percentage: number;
  /** Empty = every service priced in the branch. */
  serviceIds: number[];
}

// ============================================================
// Limits (API contract)
// ============================================================

export const SERVICE_NAME_MAX_LENGTH = 100;
export const SERVICE_DURATION_MIN = 5;
export const SERVICE_DURATION_MAX = 480;
export const SERVICE_DURATION_STEP = 5;
export const SERVICE_PRICE_MAX = 100_000;
export const SERVICE_PERCENTAGE_MIN = -90;
export const SERVICE_PERCENTAGE_MAX = 500;
/** Largest page the API accepts. */
export const SERVICES_MAX_PAGE_SIZE = 100;
