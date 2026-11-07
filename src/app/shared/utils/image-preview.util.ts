/**
 * A temporary browser URL to preview a chosen file, or `null` where the browser can't make one.
 * Release it with {@link revokePreviewUrl} when it is replaced or the form closes.
 */
export function createPreviewUrl(file: File): string | null {
  return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
}

export function revokePreviewUrl(url: string | null): void {
  if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
}
