import { describe, expect, it } from 'vitest';
import { addDays, cairoToday, formatOfferDate, formatOfferDateRange, isValidDate } from './offer-dates.util';

describe('cairoToday', () => {
  it('formats the date as yyyy-MM-dd', () => {
    expect(cairoToday(new Date('2026-11-07T10:00:00Z'))).toBe('2026-11-07');
  });

  it('uses Cairo time, not UTC: 22:30 UTC is already tomorrow in Cairo (UTC+2 in winter)', () => {
    expect(cairoToday(new Date('2026-11-07T22:30:00Z'))).toBe('2026-11-08');
  });

  it('follows Cairo daylight saving time (UTC+3 in summer)', () => {
    expect(cairoToday(new Date('2026-07-15T21:30:00Z'))).toBe('2026-07-16');
    expect(cairoToday(new Date('2026-07-15T20:30:00Z'))).toBe('2026-07-15');
  });
});

describe('addDays', () => {
  it('moves forward and backward across month and year ends', () => {
    expect(addDays('2026-11-07', 10)).toBe('2026-11-17');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-11-07', -7)).toBe('2026-10-31');
    expect(addDays('2026-11-07', 0)).toBe('2026-11-07');
  });
});

describe('isValidDate', () => {
  it('accepts real dates', () => {
    expect(isValidDate('2026-11-07')).toBe(true);
    expect(isValidDate('2028-02-29')).toBe(true);
  });

  it('rejects impossible dates and other shapes', () => {
    for (const bad of ['2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '07/11/2026', '2026-1-7', '', 'tomorrow']) {
      expect(isValidDate(bad)).toBe(false);
    }
  });
});

describe('offer date text', () => {
  it('formats a date without any time-zone shift', () => {
    expect(formatOfferDate('2026-10-16', 'en')).toBe('Oct 16, 2026');
    expect(formatOfferDate('2026-01-01', 'en')).toBe('Jan 1, 2026');
  });

  it('localizes to Arabic', () => {
    expect(formatOfferDate('2026-10-16', 'ar')).toMatch(/١٦/);
  });

  it('returns an unreadable value unchanged', () => {
    expect(formatOfferDate('nope', 'en')).toBe('nope');
    expect(formatOfferDate('2026-02-30', 'en')).toBe('2026-02-30');
  });

  it('writes the range, and "No end" for an open one', () => {
    expect(formatOfferDateRange('2026-10-16', '2026-10-31', 'en', 'No end')).toBe('Oct 16, 2026 – Oct 31, 2026');
    expect(formatOfferDateRange('2026-10-16', null, 'en', 'No end')).toBe('Oct 16, 2026 – No end');
  });
});
