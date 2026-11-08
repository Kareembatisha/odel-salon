/**
 * return-url.util.ts
 *
 * Centralized, defense-in-depth validation for the `returnUrl` query param
 * used by authGuard/guestGuard/Login to send users back to the internal
 * route they originally requested.
 *
 * `returnUrl` is attacker-controllable (anyone can craft a login link with
 * an arbitrary query string), so it must NEVER be trusted as-is. This file
 * is the single place that decides whether a candidate string is a safe,
 * same-origin, internal application route.
 */

/** Top-level route segments that authGuard actually protects (see app.routes.ts). */
const KNOWN_INTERNAL_SECTIONS = ["main"] as const;

/** Where we send the user when returnUrl is missing/invalid/unsafe. */
export const DEFAULT_REDIRECT = "/main";

/**
 * Returns true only for a same-document, internal application path such as
 * `/main/bookings/123` or `/main/bookings?status=pending`.
 *
 * Deliberately rejects (open-redirect surface):
 *   - absolute URLs with a scheme:      https://evil.com, javascript:..., data:...
 *   - protocol-relative URLs:           //evil.com
 *   - backslash tricks some browsers normalize to `//`: /\evil.com, \\evil.com
 *   - anything that isn't a single leading "/" followed by a normal path
 *   - unknown top-level sections (routes authGuard doesn't actually own)
 *
 * `URL` parsing (rather than substring/regex checks on the raw string) is
 * used deliberately: browsers apply the same normalization when *following*
 * a link, so validating against a URL-parsed result matches what will
 * actually happen at navigation time instead of being fooled by encoding
 * tricks (`%2F`, mixed slashes, etc.) that a naive `startsWith('/')` check
 * would miss.
 */
export function isSafeReturnUrl(candidate: string | null | undefined): boolean {
  if (!candidate) return false;

  // Reject anything containing whitespace/control chars up front — some of
  // these can be used to smuggle a scheme past naive parsers (e.g.
  // "java\tscript:").
  if (/[\s\u0000-\u001f]/.test(candidate)) return false;

  // Must start with exactly one "/" and not two ("//x" is protocol-relative,
  // i.e. same scheme, different host) and not a backslash (some browsers
  // treat leading "\" the same as "/", which can also be abused to build a
  // protocol-relative URL: "/\evil.com" -> "//evil.com").
  if (!candidate.startsWith("/")) return false;
  if (candidate.startsWith("//")) return false;
  if (candidate.startsWith("/\\")) return false;
  if (candidate.includes("\\")) return false;

  // Resolve against a fixed, known-safe base so relative segments (`..`)
  // can't escape into a scheme/host component, then confirm the resolved
  // URL is still same-origin-shaped (no scheme other than the base's).
  let resolved: URL;
  try {
    resolved = new URL(candidate, "https://internal.invalid");
  } catch {
    return false;
  }

  if (resolved.origin !== "https://internal.invalid") return false;
  if (resolved.protocol !== "https:") return false;

  const path = resolved.pathname;
  const [, section] = path.split("/");
  if (
    !section ||
    !KNOWN_INTERNAL_SECTIONS.includes(section as (typeof KNOWN_INTERNAL_SECTIONS)[number])
  ) {
    return false;
  }

  return true;
}

/**
 * Returns `candidate` (path + search + hash, no origin) when it passes
 * `isSafeReturnUrl`, otherwise `DEFAULT_REDIRECT`.
 */
export function sanitizeReturnUrl(candidate: string | null | undefined): string {
  if (!isSafeReturnUrl(candidate)) return DEFAULT_REDIRECT;
  const resolved = new URL(candidate as string, "https://internal.invalid");
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
