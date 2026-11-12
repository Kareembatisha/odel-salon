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

/**
 * Day of week enum from API.
 */
export enum BranchDayOfWeek {
  Sunday = 0,
  Monday = 1,
  Tuesday = 2,
  Wednesday = 3,
  Thursday = 4,
  Friday = 5,
  Saturday = 6,
}

/**
 * Working hours for a single day.
 */
export interface BranchWorkingHour {
  dayOfWeek: BranchDayOfWeek;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}

/**
 * GET /branches/{id}
 */
export interface BranchDetails {
  id: number;
  nameAr: string;
  nameEn: string;
  address: string;
  mapUrl: string | null;
  phone: string;
  allowsRegular: boolean;
  allowsVip: boolean;
  allowsHome: boolean;
  isVisible: boolean;
  /** InstaPay account customers pay to; `null` = InstaPay is off for this branch. */
  instaPayAccount: string | null;
  /** Mobile-wallet number (international format); `null` = wallet payments are off. */
  walletNumber: string | null;
  createdAt: string;
  updatedAt: string | null;
  workingHours: BranchWorkingHour[];
}

/**
 * Shared request body for:
 * POST /branches
 * PUT /branches/{id}
 */
export interface BranchPayload {
  nameAr: string;
  nameEn: string;
  address: string;
  mapUrl: string | null;
  phone: string;
  allowsRegular: boolean;
  allowsVip: boolean;
  allowsHome: boolean;
  /** Optional (max 100 chars). `null` turns the method off — the API removes a value you omit. */
  instaPayAccount: string | null;
  /** Optional Egyptian mobile in international format. `null` turns the method off. */
  walletNumber: string | null;
  workingHours: BranchWorkingHour[];
}

/** DELETE /branches body — bulk delete, all-or-nothing. */
export interface DeleteBranchesRequest {
  ids: number[];
}
