import { describe, expect, it } from 'vitest';

import { BranchDayOfWeek, BranchWorkingHour } from '../model/branch.model';
import { closesNextDay, dayKey, shortTime, sortWorkingHours } from './branch-hours.util';

const hour = (dayOfWeek: BranchDayOfWeek, isOpen = true, openTime: string | null = '10:00:00', closeTime: string | null = '22:00:00'): BranchWorkingHour =>
  ({ dayOfWeek, isOpen, openTime, closeTime });

describe('sortWorkingHours', () => {
  it('orders Saturday → Friday whatever order the API used, without mutating the input', () => {
    const input = [hour(BranchDayOfWeek.Friday), hour(BranchDayOfWeek.Sunday), hour(BranchDayOfWeek.Saturday), hour(BranchDayOfWeek.Monday)];
    const copy = [...input];

    expect(sortWorkingHours(input).map((h) => h.dayOfWeek)).toEqual([
      BranchDayOfWeek.Saturday, BranchDayOfWeek.Sunday, BranchDayOfWeek.Monday, BranchDayOfWeek.Friday,
    ]);
    expect(input).toEqual(copy);
  });

  it('handles an empty list', () => {
    expect(sortWorkingHours([])).toEqual([]);
  });
});

describe('shortTime', () => {
  it('trims seconds and tolerates null', () => {
    expect(shortTime('10:00:00')).toBe('10:00');
    expect(shortTime('09:05')).toBe('09:05');
    expect(shortTime(null)).toBe('');
  });
});

describe('closesNextDay', () => {
  it('is true when closing is at or before opening', () => {
    expect(closesNextDay(hour(BranchDayOfWeek.Monday, true, '18:00:00', '02:00:00'))).toBe(true);
    expect(closesNextDay(hour(BranchDayOfWeek.Monday, true, '00:00:00', '00:00:00'))).toBe(true);
  });

  it('is false for a normal day', () => {
    expect(closesNextDay(hour(BranchDayOfWeek.Monday))).toBe(false);
  });

  it('is false for a closed day or missing times', () => {
    expect(closesNextDay(hour(BranchDayOfWeek.Monday, false, null, null))).toBe(false);
    expect(closesNextDay(hour(BranchDayOfWeek.Monday, true, '10:00:00', null))).toBe(false);
  });
});

describe('dayKey', () => {
  it('maps every day to its translation key', () => {
    expect(dayKey(BranchDayOfWeek.Saturday)).toBe('BRANCHES.DAYS.Saturday');
    expect(dayKey(BranchDayOfWeek.Sunday)).toBe('BRANCHES.DAYS.Sunday');
    expect(dayKey(BranchDayOfWeek.Friday)).toBe('BRANCHES.DAYS.Friday');
  });
});
