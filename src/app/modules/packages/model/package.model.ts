/**
 * package.model.ts — data contracts for the Packages feature.
 * Mirrors API Contract — Packages (GET/POST/PUT/PATCH/DELETE /packages).
 *
 * A package bundles at least two services of ONE branch at a discounted price per booking
 * type (regular / VIP / home). Packages never move between branches. All prices are EGP.
 */

// ============================================================
// Read models
// ============================================================

/** One service inside a package (names only — prices come from the branch's price table). */
export interface PackageServiceRef {
  serviceId: number;
  nameAr: string;
  nameEn: string;
}

/**
 * GET /packages → data[]
 *
 * `original*Price` is the CURRENT total of the services' prices in this branch ("before
 * discount"); saving = original − package price. `originalHomePrice` is null when any
 * service isn't available for home visits. `homePrice` null means "In branch only".
 * `durationMinutes` is the sum of the services' durations — the booking buffer is NOT included.
 */
export interface PackageListItem {
  id: number;
  branchId: number;
  nameAr: string;
  nameEn: string;
  regularPrice: number;
  vipPrice: number;
  homePrice: number | null;
  isActive: boolean;
  services: PackageServiceRef[];
  originalRegularPrice: number;
  originalVipPrice: number;
  originalHomePrice: number | null;
  durationMinutes: number;
}

/** GET /packages query. `branchId` is required (404 if the branch doesn't exist). */
export interface PackagesQuery {
  branchId: number;
  /** Defaults to 1. */
  pageNumber: number;
  /** Defaults to 20, max 100. */
  pageSize: number;
  /** Matches the Arabic or English name. */
  search?: string;
  /** true = active only, false = inactive only, undefined = all. */
  isActive?: boolean;
}

/**
 * GET /packages → meta.additionalData — the summary cards.
 * Counts cover the WHOLE branch and ignore search / isActive.
 */
export interface PackagesSummary {
  total: number;
  active: number;
}

/** GET /packages/{id}. `createdAt` / `updatedAt` are UTC ISO strings. */
export interface PackageDetails extends PackageListItem {
  branchNameAr: string;
  branchNameEn: string;
  createdAt: string;
  updatedAt: string | null;
}

/**
 * A service the package form can pick: one ACTIVE service priced in the package's branch,
 * flattened from `GET /services` (the prices feed the "Before discount" box).
 * `homePrice` is null when the service isn't available for home visits.
 */
export interface PackageServiceOption {
  id: number;
  nameAr: string;
  nameEn: string;
  durationMinutes: number;
  regularPrice: number;
  vipPrice: number;
  isHomeAvailable: boolean;
  homePrice: number | null;
}

// ============================================================
// Write models
// ============================================================

/** POST /packages body. New packages are always created active. */
export interface CreatePackagePayload {
  /** Required; can't be changed later. */
  branchId: number;
  /** Required, max 100, unique inside the branch. */
  nameAr: string;
  nameEn: string;
  /** At least 2 different services, each ACTIVE in the branch. */
  serviceIds: number[];
  /** > 0, ≤ 100,000, ≤ 2 decimals, and LOWER than the services' total in the branch. */
  regularPrice: number;
  vipPrice: number;
  /** null = in branch only. Allowed only when every selected service is home-available. */
  homePrice: number | null;
}

/** PUT /packages/{id} body — same rules as create, without `branchId`. Status is not part of it. */
export type UpdatePackagePayload = Omit<CreatePackagePayload, "branchId">;

/** DELETE /packages body — bulk delete, all-or-nothing, `ids` must not be empty. */
export interface DeletePackagesRequest {
  ids: number[];
}

// ============================================================
// Limits (API contract)
// ============================================================

export const PACKAGE_NAME_MAX_LENGTH = 100;
export const PACKAGE_MIN_SERVICES = 2;
export const PACKAGE_PRICE_MAX = 100_000;
