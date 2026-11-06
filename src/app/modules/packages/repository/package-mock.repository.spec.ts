import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MockDb } from '@core/mock/mock-db';
import { NotificationService } from '@core/services/notification.service';
import { CreatePackagePayload } from '../model/package.model';
import { PackageMockRepository } from './package-mock.repository';

const BRANCH = 1;

describe('PackageMockRepository', () => {
  let repo: PackageMockRepository;
  let db: MockDb;
  let warning: ReturnType<typeof vi.spyOn>;

  /** Resolves a mock response past its simulated latency. */
  async function settle<T>(obs: Observable<T>): Promise<T> {
    const result = firstValueFrom(obs);
    result.catch(() => undefined); // avoid an unhandled rejection while timers advance
    await vi.advanceTimersByTimeAsync(1000);
    return result;
  }

  /** The error a rejected mock call fails with. */
  async function failure(obs: Observable<unknown>): Promise<{ status: number }> {
    try {
      await settle(obs);
    } catch (e) {
      return e as { status: number };
    }
    throw new Error('expected the call to fail');
  }

  const row = (serviceId: number, branchId = BRANCH) =>
    db.services.find((s) => s.id === serviceId)!.prices.find((p) => p.branchId === branchId)!;
  const total = (ids: number[], pick: 'regularPrice' | 'vipPrice') => ids.reduce((sum, id) => sum + row(id)[pick], 0);

  /** Haircut + Beard trim + Hair wash — all priced and active in branch 1. */
  const IDS = [1, 2, 3];
  const valid = (over: Partial<CreatePackagePayload> = {}): CreatePackagePayload => ({
    branchId: BRANCH,
    nameAr: 'باقة جديدة',
    nameEn: 'Brand New',
    serviceIds: IDS,
    regularPrice: total(IDS, 'regularPrice') - 10,
    vipPrice: total(IDS, 'vipPrice') - 10,
    homePrice: null,
    ...over,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', { PACKAGES: { ERRORS: { NOT_FOUND: 'not found', BRANCH_NOT_FOUND: 'no branch' } } });
    translate.use('en');
    repo = TestBed.inject(PackageMockRepository);
    db = TestBed.inject(MockDb);
    warning = vi.spyOn(TestBed.inject(NotificationService), 'warning');
  });

  afterEach(() => vi.useRealTimers());

  describe('seed', () => {
    it('only holds packages the backend would accept', () => {
      expect(db.packages.length).toBeGreaterThan(0);
      for (const p of db.packages) {
        const rows = p.serviceIds.map((id) => row(id, p.branchId));
        expect(p.serviceIds.length).toBeGreaterThanOrEqual(2);
        expect(rows.every((r) => r?.isActive)).toBe(true);
        expect(p.regularPrice).toBeLessThan(rows.reduce((s, r) => s + r.regularPrice, 0));
        expect(p.vipPrice).toBeLessThan(rows.reduce((s, r) => s + r.vipPrice, 0));
        if (p.homePrice !== null) expect(rows.every((r) => r.isHomeAvailable)).toBe(true);
      }
    });

    it('keeps names unique inside each branch and ids unique overall', () => {
      expect(new Set(db.packages.map((p) => p.id)).size).toBe(db.packages.length);
      expect(new Set(db.packages.map((p) => `${p.branchId}:${p.nameEn.toLowerCase()}`)).size).toBe(db.packages.length);
      expect(db.nextPackageId).toBe(Math.max(...db.packages.map((p) => p.id)) + 1);
    });
  });

  describe('getPackages', () => {
    it('lists one branch only, with derived services, "before discount" totals and duration', async () => {
      const res = await settle(repo.getPackages({ branchId: BRANCH, pageNumber: 1, pageSize: 100 }));
      const own = db.packages.filter((p) => p.branchId === BRANCH);

      expect(res.data).toHaveLength(own.length);
      const classic = res.data!.find((p) => p.nameEn === 'Classic Groom')!;
      expect(classic.services.map((s) => s.serviceId)).toEqual([1, 2, 3]);
      expect(classic.originalRegularPrice).toBe(total(IDS, 'regularPrice'));
      expect(classic.originalVipPrice).toBe(total(IDS, 'vipPrice'));
      expect(classic.originalHomePrice).toBeNull(); // beard trim has no home visit
      expect(classic.durationMinutes).toBe(IDS.reduce((s, id) => s + row(id).durationMinutes, 0));
    });

    it('searches the Arabic or English name and filters by status', async () => {
      const q = { branchId: BRANCH, pageNumber: 1, pageSize: 100 };
      expect((await settle(repo.getPackages({ ...q, search: 'groom' }))).data!.length).toBeGreaterThan(0);
      expect((await settle(repo.getPackages({ ...q, search: 'الجنتلمان' }))).data!.map((p) => p.nameEn)).toEqual(['Gentleman']);

      const inactive = (await settle(repo.getPackages({ ...q, isActive: false }))).data!;
      expect(inactive.length).toBeGreaterThan(0);
      expect(inactive.every((p) => !p.isActive)).toBe(true);
    });

    it('counts the whole branch in additionalData, ignoring search and status', async () => {
      const own = db.packages.filter((p) => p.branchId === BRANCH);
      const res = await settle(repo.getPackages({ branchId: BRANCH, pageNumber: 1, pageSize: 100, search: 'zzz', isActive: false }));

      expect(res.data).toEqual([]);
      expect(res.meta?.additionalData).toEqual({ total: own.length, active: own.filter((p) => p.isActive).length });
    });

    it('pages the results', async () => {
      const res = await settle(repo.getPackages({ branchId: BRANCH, pageNumber: 2, pageSize: 2 }));
      expect(res.data).toHaveLength(2);
      expect(res.meta).toMatchObject({ currentPage: 2, hasPreviousPage: true });
    });

    it('404s for an unknown branch', async () => {
      expect((await failure(repo.getPackages({ branchId: 999, pageNumber: 1, pageSize: 20 }))).status).toBe(404);
    });
  });

  describe('getPackageById', () => {
    it('adds the branch name and timestamps', async () => {
      const id = db.packages.find((p) => p.branchId === BRANCH)!.id;
      const res = await settle(repo.getPackageById(id));
      expect(res.data).toMatchObject({ id, branchId: BRANCH, branchNameEn: db.branches.find((b) => b.id === BRANCH)!.nameEn, updatedAt: null });
    });

    it('answers a status:false 404 body for an unknown id', async () => {
      expect(await settle(repo.getPackageById(9999))).toMatchObject({ status: false, statusCode: 404 });
    });
  });

  describe('createPackage', () => {
    it('creates an active package (201) that shows up in the list', async () => {
      const res = await settle(repo.createPackage(valid()));
      expect(res).toMatchObject({ status: true, statusCode: 201 });

      const created = (await settle(repo.getPackageById(res.data!))).data!;
      expect(created.isActive).toBe(true);
      expect(created.nameEn).toBe('Brand New');
    });

    it('treats a repeated service id as one service (needs 2 DIFFERENT services)', async () => {
      expect((await failure(repo.createPackage(valid({ serviceIds: [1, 1] })))).status).toBe(400);
      expect(warning).toHaveBeenCalledWith('VALIDATION_FIELDS.ServiceIds', 'PACKAGES.ERRORS.SERVICES_MIN');
    });

    it('rejects a service that is inactive or unpriced in the branch', async () => {
      row(3).isActive = false;
      await failure(repo.createPackage(valid()));
      expect(warning).toHaveBeenCalledWith('VALIDATION_FIELDS.ServiceIds', 'PACKAGES.ERRORS.SERVICE_INACTIVE');
    });

    it('rejects a name already used in the branch (either language, case-insensitive)', async () => {
      await failure(repo.createPackage(valid({ nameEn: 'classic groom' })));
      expect(warning).toHaveBeenCalledWith('VALIDATION_FIELDS.NameEn', 'PACKAGES.ERRORS.NAME_TAKEN');
    });

    it('allows the same name in another branch', async () => {
      await settle(repo.createPackage(valid()));

      const other = IDS.map((id) => row(id, 2)); // branch 2 has its own price table
      const res = await settle(repo.createPackage(valid({
        branchId: 2,
        regularPrice: other.reduce((sum, r) => sum + r.regularPrice, 0) - 10,
        vipPrice: other.reduce((sum, r) => sum + r.vipPrice, 0) - 10,
      })));
      expect(res.status).toBe(true);
    });

    it('requires names and caps them at 100 characters', async () => {
      await failure(repo.createPackage(valid({ nameAr: '  ' })));
      expect(warning).toHaveBeenLastCalledWith('VALIDATION_FIELDS.NameAr', 'PACKAGES.ERRORS.NAME_REQUIRED');
      await failure(repo.createPackage(valid({ nameEn: 'x'.repeat(101) })));
      expect(warning).toHaveBeenLastCalledWith('VALIDATION_FIELDS.NameEn', 'PACKAGES.ERRORS.NAME_TOO_LONG');
    });

    it('requires every price to be LOWER than the services total (error key = the price field)', async () => {
      await failure(repo.createPackage(valid({ regularPrice: total(IDS, 'regularPrice') })));
      expect(warning).toHaveBeenLastCalledWith('VALIDATION_FIELDS.RegularPrice', 'PACKAGES.ERRORS.PRICE_TOO_HIGH');
      await failure(repo.createPackage(valid({ vipPrice: total(IDS, 'vipPrice') + 1 })));
      expect(warning).toHaveBeenLastCalledWith('VALIDATION_FIELDS.VipPrice', 'PACKAGES.ERRORS.PRICE_TOO_HIGH');
    });

    it('rejects prices that are not > 0, above 100,000 or have more than 2 decimals', async () => {
      for (const regularPrice of [0, -5, 100_001, 10.123]) {
        await failure(repo.createPackage(valid({ regularPrice })));
        expect(warning).toHaveBeenLastCalledWith('VALIDATION_FIELDS.RegularPrice', 'PACKAGES.ERRORS.PRICE_INVALID');
      }
      expect((await settle(repo.createPackage(valid({ regularPrice: 99.99 })))).status).toBe(true);
    });

    it('allows a home price only when every service is available for home visits', async () => {
      await failure(repo.createPackage(valid({ homePrice: 100 }))); // beard trim has no home visit
      expect(warning).toHaveBeenLastCalledWith('VALIDATION_FIELDS.HomePrice', 'PACKAGES.ERRORS.HOME_UNAVAILABLE');

      for (const id of IDS) Object.assign(row(id), { isHomeAvailable: true, homePrice: 100 });
      expect((await settle(repo.createPackage(valid({ homePrice: 250 })))).status).toBe(true);
      await failure(repo.createPackage(valid({ nameEn: 'Other', nameAr: 'أخرى', homePrice: 300 }))); // total is 300
    });

    it('rejects an unknown branch', async () => {
      await failure(repo.createPackage(valid({ branchId: 999 })));
      expect(warning).toHaveBeenCalledWith('VALIDATION_FIELDS.BranchId', 'PACKAGES.ERRORS.BRANCH_NOT_FOUND');
    });
  });

  describe('updatePackage', () => {
    /** Update body: a valid payload without `branchId` (built per test — it needs the seeded db). */
    const body = () => {
      const { branchId: _branchId, ...rest } = valid();
      return rest;
    };

    it('updates the package, keeps its branch and status, and allows keeping its own name', async () => {
      const target = db.packages.find((p) => p.branchId === BRANCH && p.nameEn === 'Classic Groom')!;
      const res = await settle(repo.updatePackage(target.id, { ...body(), nameEn: 'Classic Groom', nameAr: target.nameAr }));

      expect(res.statusCode).toBe(200);
      expect(target).toMatchObject({ branchId: BRANCH, isActive: true, regularPrice: body().regularPrice });
      expect(target.updatedAt).not.toBeNull();
    });

    it('still rejects another package\'s name', async () => {
      const target = db.packages.find((p) => p.branchId === BRANCH && p.nameEn === 'Gentleman')!;
      await failure(repo.updatePackage(target.id, { ...body(), nameEn: 'Classic Groom' }));
      expect(warning).toHaveBeenCalledWith('VALIDATION_FIELDS.NameEn', 'PACKAGES.ERRORS.NAME_TAKEN');
    });

    it('404s for an unknown id', async () => {
      expect((await failure(repo.updatePackage(9999, body()))).status).toBe(404);
    });
  });

  describe('togglePackageStatus', () => {
    it('flips the status both ways', async () => {
      const target = db.packages.find((p) => p.branchId === BRANCH && p.isActive)!;
      await settle(repo.togglePackageStatus(target.id));
      expect(target.isActive).toBe(false);
      await settle(repo.togglePackageStatus(target.id));
      expect(target.isActive).toBe(true);
    });

    it('refuses to re-activate when a service is no longer active in the branch', async () => {
      const target = db.packages.find((p) => p.branchId === BRANCH && !p.isActive)!;
      row(target.serviceIds[0]).isActive = false;

      expect((await failure(repo.togglePackageStatus(target.id))).status).toBe(400);
      expect(warning).toHaveBeenCalledWith('VALIDATION_FIELDS.ServiceIds', 'PACKAGES.ERRORS.SERVICE_INACTIVE');
      expect(target.isActive).toBe(false);
    });

    it('refuses to re-activate a package with a home price when a service lost home visits', async () => {
      const target = db.packages.find((p) => p.branchId === BRANCH && !p.isActive)!;
      target.homePrice = 100;
      row(target.serviceIds[0]).isHomeAvailable = false;

      await failure(repo.togglePackageStatus(target.id));
      expect(warning).toHaveBeenCalledWith('VALIDATION_FIELDS.HomePrice', 'PACKAGES.ERRORS.HOME_UNAVAILABLE');
    });

    it('always lets an active package be deactivated, even if a service went inactive', async () => {
      const target = db.packages.find((p) => p.branchId === BRANCH && p.isActive)!;
      row(target.serviceIds[0]).isActive = false;
      await settle(repo.togglePackageStatus(target.id));
      expect(target.isActive).toBe(false);
    });

    it('404s for an unknown id', async () => {
      expect((await failure(repo.togglePackageStatus(9999))).status).toBe(404);
    });
  });

  describe('deletePackages', () => {
    it('deletes several at once', async () => {
      const ids = db.packages.filter((p) => p.branchId === BRANCH).slice(0, 2).map((p) => p.id);
      await settle(repo.deletePackages({ ids }));
      expect(db.packages.some((p) => ids.includes(p.id))).toBe(false);
    });

    it('is all-or-nothing: one unknown id deletes nothing', async () => {
      const before = db.packages.length;
      const existing = db.packages[0].id;

      expect((await failure(repo.deletePackages({ ids: [existing, 9999] }))).status).toBe(404);
      expect(db.packages).toHaveLength(before);
    });

    it('rejects an empty list', async () => {
      expect((await failure(repo.deletePackages({ ids: [] }))).status).toBe(400);
    });
  });
});
