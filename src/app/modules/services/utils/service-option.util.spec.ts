import { describe, expect, it } from 'vitest';
import { ServiceListItem, ServiceOption } from '../model/service.model';
import { savingPercent, savingsAmount, servicesTotals, toServiceOptions } from './service-option.util';

const svc = (id: number, over: Partial<ServiceOption> = {}): ServiceOption => ({
  id, nameAr: `خدمة ${id}`, nameEn: `Service ${id}`, durationMinutes: 30,
  regularPrice: 100, vipPrice: 150, isHomeAvailable: false, homePrice: null, ...over,
});

describe('toServiceOptions', () => {
  const row = (id: number, pricing: Partial<ServiceListItem['pricing']> = {}): ServiceListItem => ({
    id, nameAr: `خدمة ${id}`, nameEn: `Service ${id}`,
    pricing: { isPriced: true, isActive: true, durationMinutes: 30, regularPrice: 100, vipPrice: 150, isHomeAvailable: false, homePrice: null, ...pricing },
  });

  it('keeps only active services, flattened and sorted by id', () => {
    const options = toServiceOptions([row(3), row(1, { isActive: false }), row(2, { isHomeAvailable: true, homePrice: 250 })]);
    expect(options.map((o) => o.id)).toEqual([2, 3]);
    expect(options[0]).toMatchObject({ isHomeAvailable: true, homePrice: 250, durationMinutes: 30, regularPrice: 100, vipPrice: 150 });
  });

  it('has no home price when home visits are off, even if the row still carries one', () => {
    expect(toServiceOptions([row(1, { isHomeAvailable: false, homePrice: 999 })])[0].homePrice).toBeNull();
  });

  it('treats missing numbers as 0', () => {
    expect(toServiceOptions([row(1, { durationMinutes: null, regularPrice: null, vipPrice: null })])[0]).toMatchObject({ durationMinutes: 0, regularPrice: 0, vipPrice: 0 });
  });
});

describe('servicesTotals', () => {
  it('sums prices and duration per booking type', () => {
    const t = servicesTotals([svc(1, { durationMinutes: 30, regularPrice: 120, vipPrice: 200 }), svc(2, { durationMinutes: 15, regularPrice: 60, vipPrice: 100 })]);
    expect(t).toMatchObject({ regular: 180, vip: 300, durationMinutes: 45 });
  });

  it('has a home total only when EVERY service is available for home visits', () => {
    const home = (id: number) => svc(id, { isHomeAvailable: true, homePrice: 200 });
    expect(servicesTotals([home(1), home(2)]).home).toBe(400);
    expect(servicesTotals([home(1), svc(2)]).home).toBeNull();
  });

  it('is all zeros / no home for an empty selection', () => {
    expect(servicesTotals([])).toEqual({ regular: 0, vip: 0, home: null, durationMinutes: 0 });
  });
});

describe('savingsAmount', () => {
  it('is original minus price', () => {
    expect(savingsAmount(230, 210)).toBe(20);
  });

  it('is 0 when the price is not lower, or a side is missing (in branch only)', () => {
    expect(savingsAmount(200, 200)).toBe(0);
    expect(savingsAmount(200, 250)).toBe(0);
    expect(savingsAmount(null, 100)).toBe(0);
    expect(savingsAmount(720, null)).toBe(0);
  });

  it('rounds away float noise', () => {
    expect(savingsAmount(0.3, 0.1 + 0.1)).toBe(0.1);
  });
});

describe('savingPercent', () => {
  it('is the whole percent cheaper than the original (320 → 250 is "Save 22%")', () => {
    expect(savingPercent(320, 250)).toBe(22);
    expect(savingPercent(200, 150)).toBe(25);
  });

  it('is 0 when the price is not lower, the original is 0, or a side is missing', () => {
    expect(savingPercent(200, 200)).toBe(0);
    expect(savingPercent(200, 250)).toBe(0);
    expect(savingPercent(0, 0)).toBe(0);
    expect(savingPercent(null, 100)).toBe(0);
    expect(savingPercent(100, undefined)).toBe(0);
  });
});
