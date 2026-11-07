/**
 * Offer dates are plain `yyyy-MM-dd` strings in CAIRO time (the backend's clock for "today",
 * status and the "starts today or later" rule). Strings of this shape compare correctly with
 * `<` / `>`, so nothing here needs `Date` arithmetic except building the strings.
 */
const CAIRO_TIME_ZONE = "Africa/Cairo";

const cairoFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: CAIRO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in Cairo as `yyyy-MM-dd` (not the browser's local date). */
export function cairoToday(now: Date = new Date()): string {
  const parts = cairoFormat.formatToParts(now);
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** `date` moved by `days` (negative = earlier), as `yyyy-MM-dd`. Calendar arithmetic, no time zones. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** A real calendar date written as `yyyy-MM-dd` ("2026-02-30" is not one). */
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * `yyyy-MM-dd` as a short, localized date (e.g. "Nov 7, 2026"). The string is read as a pure
 * calendar date (formatted in UTC) so the browser's time zone can never shift the day.
 * An unreadable value is returned unchanged rather than shown as "Invalid Date".
 */
export function formatOfferDate(date: string, lang: string): string {
  if (!isValidDate(date)) return date;
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * The card's date line: "Oct 16, 2026 – Oct 31, 2026", or "Oct 16, 2026 – No end" when the
 * offer has no end date. `noEndLabel` is the translated "No end" (the caller owns i18n).
 */
export function formatOfferDateRange(
  startDate: string,
  endDate: string | null,
  lang: string,
  noEndLabel: string,
): string {
  const end = endDate === null ? noEndLabel : formatOfferDate(endDate, lang);
  return `${formatOfferDate(startDate, lang)} – ${end}`;
}
