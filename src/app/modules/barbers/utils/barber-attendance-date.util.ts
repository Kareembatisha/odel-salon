import { isValidDate } from "../../offers/utils/offer-dates.util";

/**
 * The attendance sheet's date (`yyyy-MM-dd`, Cairo calendar day) as a long, localized line,
 * e.g. "Thursday, November 12, 2026". The string is read as a pure calendar date (formatted in
 * UTC) so the browser's time zone can never shift the day. An unreadable value is returned
 * unchanged rather than shown as "Invalid Date".
 */
export function formatAttendanceDate(date: string, lang: string): string {
  if (!isValidDate(date)) return date;
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-US", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
