/**
 * barber.model.ts — data contracts for the Barbers feature.
 * Mirrors API Contract — Barbers (GET/POST/PUT/PATCH/DELETE /barbers).
 */

/**
 * GET /barbers → data[]
 *
 * Branch names come denormalised so the table needs no second request.
 * `createdAt` / `updatedAt` are NOT in the list response (details only).
 */
export interface BarberListItem {
  id: number;
  branchId: number;
  branchNameAr: string;
  branchNameEn: string;
  fullName: string;
  /** Egyptian mobile, `+201XXXXXXXXX`. Admin only — never shown to customers. */
  phone: string;
  /** Full URL, or null when the barber has no photo (show the initials instead). */
  imageUrl: string | null;
  /** Suspended barbers (false) are hidden from the app and not bookable. */
  isActive: boolean;
}

/** GET /barbers/{id}. `createdAt` / `updatedAt` are UTC ISO strings. */
export interface BarberDetails extends BarberListItem {
  createdAt: string;
  updatedAt: string | null;
}

/** GET /barbers query. All optional on the backend (defaults: page 1, size 20, max 100). */
export interface BarbersQuery {
  pageNumber: number;
  pageSize: number;
  /** Filters one branch. */
  branchId?: number;
  /** true = active only, false = suspended only, undefined = all. */
  isActive?: boolean;
  /** Matches the full name or the phone. */
  search?: string;
}

/**
 * POST /barbers — sent as `multipart/form-data` (see `buildCreateBarberFormData`).
 * New barbers are always created active.
 */
export interface CreateBarberPayload {
  branchId: number;
  /** Required, max 100. */
  fullName: string;
  /** Required, `+201XXXXXXXXX`, unique across all barbers. */
  phone: string;
  /** Optional photo: JPG / PNG / WEBP up to 5 MB. */
  image?: File | null;
}

/**
 * PUT /barbers/{id} — sent as `multipart/form-data` (see `buildUpdateBarberFormData`).
 *
 * Photo rules: `image` replaces it · `removeImage` (with no image) removes it ·
 * neither keeps the current photo. Changing `branchId` transfers the barber.
 */
export interface UpdateBarberPayload extends CreateBarberPayload {
  removeImage: boolean;
}

/** DELETE /barbers body — bulk delete, all-or-nothing, `ids` must not be empty. */
export interface DeleteBarbersRequest {
  ids: number[];
}

/**
 * A branch as the barber screens need it (filter dropdown, form select).
 * `BranchListItem` from GET /branches satisfies this shape, so the list is reused as-is.
 */
export interface BarberBranchOption {
  id: number;
  nameAr: string;
  nameEn: string;
}

// ============================================================
// Constants (API contract limits)
// ============================================================

/** Max length of a barber's full name. */
export const BARBER_NAME_MAX_LENGTH = 100;

/** Largest page the API accepts. */
export const BARBERS_MAX_PAGE_SIZE = 100;

/** Photo size limit: 5 MB. */
export const BARBER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Accepted photo MIME types (JPG / PNG / WEBP). */
export const BARBER_IMAGE_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

/** `accept` attribute for the photo file input. */
export const BARBER_IMAGE_ACCEPT = BARBER_IMAGE_TYPES.join(',');

/** Egyptian mobile in the format the API stores: `+201` + 9 digits. */
export const BARBER_PHONE_PATTERN = /^\+201\d{9}$/;
