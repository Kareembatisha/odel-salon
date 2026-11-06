import { describe, expect, it } from 'vitest';
import { PackageServiceOption } from '../model/package.model';
import { packageSavings, servicesTotals } from './package-price.util';

const svc = (id: number, over: Partial<PackageServiceOption> = {}): PackageServiceOption => ({
  id, nameAr: `خدمة ${id}`, nameEn: `Service ${id}`, durationMinutes: 30,
  regularPrice: 100, vipPrice: 150, isHomeAvailable: false, homePrice: null, ...over,
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

describe('packageSavings', () => {
  it('is original minus package price', () => {
    expect(packageSavings(230, 210)).toBe(20);
  });

  it('is 0 when the package is not cheaper, or a side is missing (in branch only)', () => {
    expect(packageSavings(200, 200)).toBe(0);
    expect(packageSavings(200, 250)).toBe(0);
    expect(packageSavings(null, 100)).toBe(0);
    expect(packageSavings(720, null)).toBe(0);
  });

  it('rounds away float noise', () => {
    expect(packageSavings(0.3, 0.1 + 0.1)).toBe(0.1);
  });
});
