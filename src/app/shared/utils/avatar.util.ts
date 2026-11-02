// avatar.util.ts
//
// Initials + a stable per-name color, for showing a person as a colored
// "AB" avatar chip when there's no profile image. The exact same
// `initialsFor()` body (split on spaces, take first letter of the first
// two words) was copy-pasted verbatim into company-management,
// product-management, supplier-management, supplier-details,
// company-details, user-management, and the header, and equivalent
// (slightly different hash/palette) versions existed in roles-permissions
// and profile-view. This is the one shared version.

/**
 * Fixed palette cycled by a stable hash of the person's name, so the same
 * name always gets the same color across the app.
 */
export const AVATAR_COLORS = [
  "#0F6B3E",
  "#2255D6",
  "#8A4B26",
  "#189E8B",
  "#D8483A",
  "#5B5FE0",
  "#2FA85A",
  "#D6317E",
  "#B45309",
  "#7C3AED",
  "#0369A1",
  "#BE123C",
];

/** "Kareem Hassan" -> "KH" — first letter of the first two words, uppercased. */
export function initialsFor(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Stable per-name color from the shared palette, for the initials avatar's background. */
export function avatarColorFor(seed: string): string {
  const hash = Array.from(seed).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
