import { BARBER_IMAGE_MAX_BYTES, BARBER_IMAGE_TYPES } from '../model/barber.model';

/** Why a photo was refused client-side (the backend answers `400 Invalid image` otherwise). */
export type BarberImageError = 'type' | 'size';

/**
 * Checks a chosen photo against the contract: JPG / PNG / WEBP, up to 5 MB.
 * Returns `null` when it is fine. Dimensions are only recommended (600×600+), not enforced.
 */
export function validateBarberImage(file: File): BarberImageError | null {
  if (!BARBER_IMAGE_TYPES.includes(file.type)) return 'type';
  if (file.size > BARBER_IMAGE_MAX_BYTES) return 'size';
  return null;
}

/**
 * A temporary browser URL to preview a chosen file, or `null` where the browser
 * can't make one. Release it with {@link revokePreviewUrl} when it is replaced or the form closes.
 */
export function createPreviewUrl(file: File): string | null {
  return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
}

export function revokePreviewUrl(url: string | null): void {
  if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
}
