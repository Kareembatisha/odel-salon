import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MockChair, MockDb } from '@core/mock/mock-db';
import { NotificationService } from '@core/services/notification.service';
import { ChairType } from '../model/chair.model';
import { ChairMockRepository } from './chair-mock.repository';

const REGULAR = ChairType.Regular;
const VIP = ChairType.Vip;

describe('ChairMockRepository', () => {
  let repo: ChairMockRepository;
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
  async function failure(obs: Observable<unknown>): Promise<{ status: number; message: string }> {
    try {
      await settle(obs);
    } catch (e) {
      return e as { status: number; message: string };
    }
    throw new Error('expected the call to fail');
  }

  /**
   * Replaces the chairs of branch 1 (Zamalek) with exactly `chairs` and sets how the branch is
   * configured, so each rule is tested against a small, known situation instead of the seed.
   */
  function arrange(
    chairs: Array<[name: string, type: ChairType, isActive: boolean]>,
    branch: { isVisible?: boolean; allowsRegular?: boolean; allowsVip?: boolean } = {},
  ): MockChair[] {
    Object.assign(db.branches.find((b) => b.id === 1)!, { isVisible: true, allowsRegular: true, allowsVip: true, ...branch });
    db.chairs = db.chairs.filter((c) => c.branchId !== 1);

    const made = chairs.map(([name, type, isActive]) => ({
      id: db.nextChairId++, branchId: 1, branchNameAr: 'الزمالك', branchNameEn: 'Zamalek',
      name, type, isActive, createdAt: '2026-11-02T14:20:11Z', updatedAt: null,
    }));
    db.chairs.push(...made);
    return made;
  }

  const byName = (name: string) => db.chairs.find((c) => c.branchId === 1 && c.name === name)!;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      CHAIRS: { ERRORS: {
        NOT_FOUND: 'not found',
        LAST_ACTIVE_VIP: '{{name}} is the last active VIP chair',
        LAST_ACTIVE_REGULAR: '{{name}} is the last active Regular chair',
      } },
    });
    translate.use('en');
    repo = TestBed.inject(ChairMockRepository);
    db = TestBed.inject(MockDb);
    warning = vi.spyOn(TestBed.inject(NotificationService), 'warning');
  });

  afterEach(() => vi.useRealTimers());

  describe('seed', () => {
    it('has exactly the chairs each branch reports (so Branches and Chairs agree)', () => {
      for (const b of db.branches) {
        const own = db.chairs.filter((c) => c.branchId === b.id);
        expect(own.filter((c) => c.type === REGULAR)).toHaveLength(b.regularChairsCount);
        expect(own.filter((c) => c.type === VIP)).toHaveLength(b.vipChairsCount);
      }
    });

    it('hands out ids that never collide with a new chair', () => {
      expect(db.nextChairId).toBe(Math.max(...db.chairs.map((c) => c.id)) + 1);
    });
  });

  describe('getChairs', () => {
    beforeEach(() => arrange([['V2', VIP, true], ['R10', REGULAR, true], ['R2', REGULAR, false], ['V1', VIP, true]]));

    it('filters by branch, type, status and name', async () => {
      const q = { pageNumber: 1, pageSize: 50, branchId: 1 };

      expect((await settle(repo.getChairs(q))).data).toHaveLength(4);
      expect((await settle(repo.getChairs({ ...q, type: REGULAR }))).data!.map((c) => c.name)).toEqual(['R2', 'R10']);
      expect((await settle(repo.getChairs({ ...q, isActive: false }))).data!.map((c) => c.name)).toEqual(['R2']);
      expect((await settle(repo.getChairs({ ...q, search: 'v' }))).data!.map((c) => c.name)).toEqual(['V1', 'V2']);
    });

    it('sorts by branch, then type (Regular first), then name with numbers in order', async () => {
      const res = await settle(repo.getChairs({ pageNumber: 1, pageSize: 50, branchId: 1 }));
      expect(res.data!.map((c) => c.name)).toEqual(['R2', 'R10', 'V1', 'V2']);
    });

    it('paginates and reports the meta', async () => {
      const res = await settle(repo.getChairs({ pageNumber: 2, pageSize: 3, branchId: 1 }));
      expect(res.data!.map((c) => c.name)).toEqual(['V2']);
      expect(res.meta).toMatchObject({ currentPage: 2, pageSize: 3, totalPages: 2, totalCount: 4, hasPreviousPage: true, hasNextPage: false });
    });

    it('summarises the whole branch and ignores the type / status / search filters', async () => {
      const filtered = await settle(repo.getChairs({ pageNumber: 1, pageSize: 50, branchId: 1, type: VIP, isActive: true, search: 'zzz' }));
      expect(filtered.data).toHaveLength(0);
      expect(filtered.meta!.additionalData).toEqual({ regularActive: 1, vipActive: 2, inactive: 1 });
    });

    it('summarises every branch when no branch is selected', async () => {
      const res = await settle(repo.getChairs({ pageNumber: 1, pageSize: 10 }));
      const total = db.chairs.length;
      const d = res.meta!.additionalData as { regularActive: number; vipActive: number; inactive: number };
      expect(d.regularActive + d.vipActive + d.inactive).toBe(total);
    });
  });

  describe('getChairById', () => {
    it('returns the details with the audit dates', async () => {
      const [c] = arrange([['V1', VIP, true]]);
      const res = await settle(repo.getChairById(c.id));
      expect(res.data).toMatchObject({ id: c.id, name: 'V1', type: VIP, createdAt: '2026-11-02T14:20:11Z', updatedAt: null });
    });

    it('answers a status:false 404 body for an unknown id', async () => {
      const res = await settle(repo.getChairById(99999));
      expect(res).toMatchObject({ status: false, statusCode: 404, data: null });
    });
  });

  describe('createChair', () => {
    beforeEach(() => arrange([['R1', REGULAR, true], ['V1', VIP, true]]));

    it('creates an active chair, answers 201 with the id and updates the branch totals', async () => {
      const res = await settle(repo.createChair({ branchId: 1, name: '  R2  ', type: REGULAR }));

      expect(res).toMatchObject({ status: true, statusCode: 201, message: 'Chair Created Successfully' });
      const created = db.chairs.find((c) => c.id === res.data)!;
      expect(created).toMatchObject({ name: 'R2', isActive: true, branchNameEn: 'Zamalek', updatedAt: null });
      expect(db.branches.find((b) => b.id === 1)!.regularChairsCount).toBe(2);
    });

    it('rejects a name already used in the branch, ignoring case', async () => {
      const e = await failure(repo.createChair({ branchId: 1, name: 'r1', type: REGULAR }));
      expect(e.status).toBe(400);
      expect(warning).toHaveBeenCalledWith('VALIDATION_FIELDS.Name', 'CHAIRS.ERRORS.NAME_TAKEN');
    });

    it('allows the same name in another branch', async () => {
      arrange([['Q9', REGULAR, true]]); // a name that exists in branch 1 only (every seeded branch already has R1)
      expect(db.chairs.some((c) => c.branchId === 2 && c.name === 'Q9')).toBe(false);

      const res = await settle(repo.createChair({ branchId: 2, name: 'Q9', type: REGULAR }));
      expect(res.statusCode).toBe(201);
    });

    it('rejects an empty name and one longer than 50 characters', async () => {
      expect((await failure(repo.createChair({ branchId: 1, name: '   ', type: REGULAR }))).status).toBe(400);
      expect(warning).toHaveBeenLastCalledWith('VALIDATION_FIELDS.Name', 'CHAIRS.ERRORS.NAME_REQUIRED');

      expect((await failure(repo.createChair({ branchId: 1, name: 'x'.repeat(51), type: REGULAR }))).status).toBe(400);
      expect(warning).toHaveBeenLastCalledWith('VALIDATION_FIELDS.Name', 'CHAIRS.ERRORS.NAME_TOO_LONG');

      expect((await settle(repo.createChair({ branchId: 1, name: 'x'.repeat(50), type: REGULAR }))).statusCode).toBe(201);
    });

    it('rejects an unknown branch', async () => {
      const e = await failure(repo.createChair({ branchId: 9999, name: 'R5', type: REGULAR }));
      expect(e.status).toBe(400);
      expect(warning).toHaveBeenCalledWith('VALIDATION_FIELDS.BranchId', 'CHAIRS.ERRORS.BRANCH_NOT_FOUND');
    });
  });

  describe('updateChair', () => {
    it('renames and changes type, stamps updatedAt and keeps branch totals in sync', async () => {
      arrange([['R1', REGULAR, true], ['R2', REGULAR, true], ['V1', VIP, true]]);

      await settle(repo.updateChair(byName('R2').id, { name: 'V2', type: VIP }));

      expect(byName('V2')).toMatchObject({ type: VIP });
      expect(byName('V2').updatedAt).not.toBeNull();
      const branch = db.branches.find((b) => b.id === 1)!;
      expect([branch.regularChairsCount, branch.vipChairsCount]).toEqual([1, 2]);
    });

    it('lets a chair keep its own name', async () => {
      arrange([['R1', REGULAR, true], ['R2', REGULAR, true]]);
      expect((await settle(repo.updateChair(byName('R1').id, { name: 'R1', type: REGULAR }))).statusCode).toBe(200);
    });

    it('rejects a name taken by another chair of the branch', async () => {
      arrange([['R1', REGULAR, true], ['R2', REGULAR, true]]);
      const e = await failure(repo.updateChair(byName('R2').id, { name: 'R1', type: REGULAR }));
      expect(e.status).toBe(400);
    });

    it('answers 404 for an unknown chair', async () => {
      expect((await failure(repo.updateChair(99999, { name: 'R1', type: REGULAR }))).status).toBe(404);
    });

    it('409: cannot change the type of the last active VIP chair of a visible branch offering VIP', async () => {
      arrange([['R1', REGULAR, true], ['V1', VIP, true]]);

      const e = await failure(repo.updateChair(byName('V1').id, { name: 'V1', type: REGULAR }));

      expect(e.status).toBe(409);
      expect(e.message).toBe('V1 is the last active VIP chair');
      expect(byName('V1').type).toBe(VIP);
    });

    it('allows the type change when another active chair of that type remains', async () => {
      arrange([['V1', VIP, true], ['V2', VIP, true]]);
      expect((await settle(repo.updateChair(byName('V1').id, { name: 'V1', type: REGULAR }))).statusCode).toBe(200);
    });

    it('a rename alone is never blocked, even for the last active chair', async () => {
      arrange([['V1', VIP, true]]);
      expect((await settle(repo.updateChair(byName('V1').id, { name: 'VIP-A', type: VIP }))).statusCode).toBe(200);
    });
  });

  describe('toggleChairStatus', () => {
    it('flips isActive both ways', async () => {
      arrange([['R1', REGULAR, true], ['R2', REGULAR, true]]);
      const id = byName('R2').id;

      await settle(repo.toggleChairStatus(id));
      expect(byName('R2').isActive).toBe(false);

      await settle(repo.toggleChairStatus(id));
      expect(byName('R2').isActive).toBe(true);
    });

    it('409: cannot deactivate the last active VIP chair of a visible branch that offers VIP', async () => {
      arrange([['R1', REGULAR, true], ['V1', VIP, true], ['V2', VIP, false]]);

      const e = await failure(repo.toggleChairStatus(byName('V1').id));

      expect(e.status).toBe(409);
      expect(e.message).toBe('V1 is the last active VIP chair');
      expect(byName('V1').isActive).toBe(true);
    });

    it('409 names Regular for the last active Regular chair', async () => {
      arrange([['R1', REGULAR, true], ['V1', VIP, true]]);
      expect((await failure(repo.toggleChairStatus(byName('R1').id))).message).toBe('R1 is the last active Regular chair');
    });

    it('activating is never blocked', async () => {
      arrange([['V1', VIP, false]]);
      await settle(repo.toggleChairStatus(byName('V1').id));
      expect(byName('V1').isActive).toBe(true);
    });

    it('is not restricted in a hidden branch', async () => {
      arrange([['V1', VIP, true]], { isVisible: false });
      await settle(repo.toggleChairStatus(byName('V1').id));
      expect(byName('V1').isActive).toBe(false);
    });

    it('is not restricted when the branch does not offer that type', async () => {
      arrange([['V1', VIP, true]], { allowsVip: false });
      await settle(repo.toggleChairStatus(byName('V1').id));
      expect(byName('V1').isActive).toBe(false);
    });

    it('answers 404 for an unknown chair', async () => {
      expect((await failure(repo.toggleChairStatus(99999))).status).toBe(404);
    });
  });

  describe('deleteChairs', () => {
    it('deletes the chairs permanently and updates the branch totals', async () => {
      arrange([['R1', REGULAR, true], ['R2', REGULAR, true], ['V1', VIP, true]]);

      const res = await settle(repo.deleteChairs({ ids: [byName('R2').id] }));

      expect(res).toMatchObject({ statusCode: 200, message: 'Chair Deleted Successfully' });
      expect(db.chairs.some((c) => c.branchId === 1 && c.name === 'R2')).toBe(false);
      expect(db.branches.find((b) => b.id === 1)!.regularChairsCount).toBe(1);
    });

    it('400 when ids is empty', async () => {
      expect((await failure(repo.deleteChairs({ ids: [] }))).status).toBe(400);
    });

    it('is all-or-nothing: one unknown id (404) deletes nothing', async () => {
      arrange([['R1', REGULAR, true], ['R2', REGULAR, true]]);
      const before = db.chairs.length;

      const e = await failure(repo.deleteChairs({ ids: [byName('R1').id, 99999] }));

      expect(e.status).toBe(404);
      expect(db.chairs).toHaveLength(before);
    });

    it('409 when the last active chair of an offered type is in the request, and nothing is deleted', async () => {
      arrange([['R1', REGULAR, true], ['R2', REGULAR, true], ['V1', VIP, true]]);
      const before = db.chairs.length;

      const e = await failure(repo.deleteChairs({ ids: [byName('R2').id, byName('V1').id] }));

      expect(e.status).toBe(409);
      expect(e.message).toBe('V1 is the last active VIP chair');
      expect(db.chairs).toHaveLength(before);
    });

    it('checks the WHOLE request: deleting every remaining active chair of a type at once is blocked', async () => {
      arrange([['R1', REGULAR, true], ['R2', REGULAR, true], ['V1', VIP, true]]);

      const e = await failure(repo.deleteChairs({ ids: [byName('R1').id, byName('R2').id] }));

      expect(e.status).toBe(409);
      expect(e.message).toBe('R1 is the last active Regular chair'); // names the first blocking chair
    });

    it('allows deleting some chairs of a type while one stays active', async () => {
      arrange([['R1', REGULAR, true], ['R2', REGULAR, true], ['R3', REGULAR, true], ['V1', VIP, true]]);
      expect((await settle(repo.deleteChairs({ ids: [byName('R1').id, byName('R2').id] }))).statusCode).toBe(200);
    });

    it('lets inactive chairs go — they never count as the last active one', async () => {
      arrange([['V1', VIP, true], ['V2', VIP, false]]);
      expect((await settle(repo.deleteChairs({ ids: [byName('V2').id] }))).statusCode).toBe(200);
    });

    it('does not restrict a hidden branch', async () => {
      arrange([['V1', VIP, true]], { isVisible: false });
      expect((await settle(repo.deleteChairs({ ids: [byName('V1').id] }))).statusCode).toBe(200);
    });
  });
});
