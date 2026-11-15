import { isValidDate } from "../../offers/utils/offer-dates.util";

/**
 * Booking times are SALON-LOCAL (Cairo) strings without an offset: `2026-11-13T19:00:00`.
 * They are never passed to `new Date(string)` (that would read them in the browser's time zone and
 * shift them). They are split into parts and formatted as pure calendar values (in UTC), so the
 * browser's time zone can't move the day or the hour. Strings of this shape compare correctly with
 * `<` / `>`.
 */
const CAIRO_TIME_ZONE = "Africa/Cairo";

const cairoClock = new Intl.DateTimeFormat("en-US", {
  timeZone: CAIRO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const START_AT = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

/** The current Cairo wall-clock time as `yyyy-MM-ddTHH:mm:ss` (not the browser's local time). */
export function cairoNow(now: Date = new Date()): string {
  const parts = cairoClock.formatToParts(now);
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}

export interface BookingStartParts {
  /** `yyyy-MM-dd` */
  date: string;
  hour: number;
  minute: number;
}

/** Splits a `startAt`; null when it isn't a real Cairo wall-clock time. */
export function parseStartAt(startAt: string): BookingStartParts | null {
  const m = START_AT.exec(startAt);
  if (!m || !isValidDate(m[1])) return null;
  const hour = Number(m[2]);
  const minute = Number(m[3]);
  if (hour > 23 || minute > 59) return null;
  return { date: m[1], hour, minute };
}

function utcDate(p: BookingStartParts): Date {
  const [y, mo, d] = p.date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, p.hour, p.minute));
}

const locale = (lang: string): string => (lang === "ar" ? "ar-EG" : "en-US");

/** "Nov 13, 2026" / "١٣ نوفمبر ٢٠٢٦". An unreadable value is returned unchanged. */
export function formatBookingDate(startAt: string, lang: string): string {
  const p = parseStartAt(startAt);
  if (!p) return startAt;
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(utcDate(p));
}

/** "Friday, November 13, 2026" / "الجمعة، ١٣ نوفمبر ٢٠٢٦". An unreadable value is returned unchanged. */
export function formatBookingDateLong(startAt: string, lang: string): string {
  const p = parseStartAt(startAt);
  if (!p) return startAt;
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(utcDate(p));
}

/** "7:00 PM" / "٧:٠٠ م". An unreadable value is returned unchanged. */
export function formatBookingTime(startAt: string, lang: string): string {
  const p = parseStartAt(startAt);
  if (!p) return startAt;
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(utcDate(p));
}

/** The calendar day of a `startAt` (`yyyy-MM-dd`), or null when unreadable. */
export function bookingDay(startAt: string): string | null {
  return parseStartAt(startAt)?.date ?? null;
}

/** Whether the booking's start time has passed in Cairo (a booking can only be ended after it). */
export function isBookingStarted(startAt: string, now: Date = new Date()): boolean {
  const p = parseStartAt(startAt);
  if (!p) return false;
  const hh = String(p.hour).padStart(2, "0");
  const mm = String(p.minute).padStart(2, "0");
  return `${p.date}T${hh}:${mm}:00` <= cairoNow(now);
}

/**
 * `startAt` of a booking `minutesFromNow` away from `now`, as a Cairo wall-clock string at the
 * minute (mock data and tests). Negative = earlier.
 */
export function cairoStartAt(minutesFromNow: number, now: Date = new Date()): string {
  return `${cairoNow(new Date(now.getTime() + minutesFromNow * 60_000)).slice(0, 16)}:00`;
}

/**
 * `startAt` moved by `minutes` (negative = earlier), still a Cairo wall-clock string
 * (`yyyy-MM-ddTHH:mm:00`). Pure calendar arithmetic — no time zone, no DST — which is what the
 * "booking end = start + services' duration" rule needs. Null when `startAt` is unreadable.
 */
export function addMinutesToStartAt(startAt: string, minutes: number): string | null {
  const p = parseStartAt(startAt);
  if (!p) return null;
  const [y, mo, d] = p.date.split("-").map(Number);
  const moved = new Date(Date.UTC(y, mo - 1, d, p.hour, p.minute + minutes));
  return `${moved.toISOString().slice(0, 16)}:00`;
}
