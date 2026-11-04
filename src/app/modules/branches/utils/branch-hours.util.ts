import { BranchDayOfWeek, BranchWorkingHour } from "../model/branch.model";
import { BRANCH_DAYS } from "./branch-form.factory";

/** Working hours in the display order of the form (Saturday → Friday), whatever order the API used. */
export function sortWorkingHours(hours: BranchWorkingHour[]): BranchWorkingHour[] {
  const order = (h: BranchWorkingHour) => BRANCH_DAYS.indexOf(h.dayOfWeek);

  return [...hours].sort((a, b) => order(a) - order(b));
}

/** `HH:mm:ss` → `HH:mm`. */
export function shortTime(time: string | null): string {
  return time ? time.substring(0, 5) : "";
}

/** True when an open day closes at or before its opening time, i.e. after midnight. */
export function closesNextDay(hour: BranchWorkingHour): boolean {
  if (!hour.isOpen || !hour.openTime || !hour.closeTime) return false;

  return shortTime(hour.closeTime) <= shortTime(hour.openTime);
}

/** Translation key of a day's name (`BRANCHES.DAYS.Saturday`). */
export function dayKey(day: BranchDayOfWeek): string {
  return `BRANCHES.DAYS.${BranchDayOfWeek[day]}`;
}
