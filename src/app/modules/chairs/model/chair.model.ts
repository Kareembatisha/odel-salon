/**
 * chair.model.ts — data contracts for the Chairs feature.
 * Mirrors API Contract — Chairs (GET/POST/PUT/PATCH/DELETE /chairs).
 */

/** ChairTypeEnum from the API: 0 = Regular, 1 = Vip. */
export enum ChairType {
  Regular = 0,
  Vip = 1,
}

/**
 * GET /chairs → data[]
 *
 * Branch names come denormalised so the table needs no second request.
 * `createdAt` / `updatedAt` are NOT in the list response (details only).
 */
export interface ChairListItem {
  id: number;
  branchId: number;
  branchNameAr: string;
  branchNameEn: string;
  /** Free text chosen by the user (e.g. R1, V2) — unique inside its branch. */
  name: string;
  type: ChairType;
  /** Inactive chairs are never used for new bookings. */
  isActive: boolean;
}

/** GET /chairs query. All optional on the backend (defaults: page 1, size 20, max 100). */
export interface ChairsQuery {
  pageNumber: number;
  pageSize: number;
  /** Filters one branch (the Chairs screen sends the selected branch). */
  branchId?: number;
  type?: ChairType;
  /** true = active only, false = inactive only, undefined = all. */
  isActive?: boolean;
  /** Matches the chair name. */
  search?: string;
}

/**
 * GET /chairs → meta.additionalData — the three summary cards.
 * Counts cover ALL chairs of `branchId` (or all branches when not sent) and
 * ignore the type / isActive / search filters.
 */
export interface ChairsSummary {
  regularActive: number;
  vipActive: number;
  inactive: number;
}

/** GET /chairs/{id}. `createdAt` / `updatedAt` are UTC ISO strings. */
export interface ChairDetails extends ChairListItem {
  createdAt: string;
  updatedAt: string | null;
}

/** POST /chairs body. New chairs are always created active. */
export interface CreateChairPayload {
  branchId: number;
  /** Required, max 50, unique inside the branch. */
  name: string;
  type: ChairType;
}

/**
 * PUT /chairs/{id} body — rename and "Change type".
 * The branch of a chair cannot be changed, so `branchId` is not sent.
 */
export interface UpdateChairPayload {
  name: string;
  type: ChairType;
}

/** DELETE /chairs body — bulk delete, all-or-nothing, `ids` must not be empty. */
export interface DeleteChairsRequest {
  ids: number[];
}

/**
 * A branch as the chair screens need it (filter dropdown, form select).
 * `BranchListItem` from GET /branches satisfies this shape, so the list is reused as-is.
 */
export interface ChairBranchOption {
  id: number;
  nameAr: string;
  nameEn: string;
}

/** Max length of a chair name (API contract). */
export const CHAIR_NAME_MAX_LENGTH = 50;

/** Largest page the API accepts. */
export const CHAIRS_MAX_PAGE_SIZE = 100;
