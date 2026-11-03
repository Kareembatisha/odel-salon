/**
 * branch.model.ts — data contracts for the Branches feature.
 * Mirrors API Contract — Branches (GET /branches). Phase 1 covers the list only.
 */

/**
 * GET /branches → data[]
 *
 * The three *Count fields are TOTALS for the branch card: they include suspended
 * barbers and inactive chairs. They are not "active" counts and must not be used
 * to decide whether a branch is ready to be shown in the app.
 * Working hours, map URL and timestamps are NOT in the list response (details only).
 */
export interface BranchListItem {
  id: number;
  nameAr: string;
  nameEn: string;
  address: string;
  phone: string;
  allowsRegular: boolean;
  allowsVip: boolean;
  allowsHome: boolean;
  /** true = shown in the app, false = hidden. */
  isVisible: boolean;
  barbersCount: number;
  regularChairsCount: number;
  vipChairsCount: number;
}

/** GET /branches query. All optional on the backend (defaults: page 1, size 20, max 100). */
export interface BranchesQuery {
  pageNumber: number;
  pageSize: number;
  /** Matches nameAr, nameEn, address or phone. */
  search?: string;
  /** true = shown only, false = hidden only, undefined = all. */
  isVisible?: boolean;
}
