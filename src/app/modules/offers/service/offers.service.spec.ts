import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationService } from '@core/services/notification.service';
import { BranchesService } from '@modules/branches/service/branches.service';
import { ApiResponse } from '@shared/model/api_response.model';
import { OfferListItem, OfferStatus, OffersQuery } from '../model/offer.model';
import { OFFER_REPOSITORY } from '../repository/offer.repository';
import { OffersService } from './offers.service';

function offer(id: number, status = OfferStatus.Active): OfferListItem {
  return {
    id, branchId: 3, nameAr: `عرض ${id}`, nameEn: `Offer ${id}`, imageUrl: null,
    regularPrice: 200, vipPrice: 300, homePrice: null, startDate: '2026-11-01', endDate: null,
    maxBookings: null, bookingsCount: 0, status, stoppedAt: status === OfferStatus.Stopped ? '2026-11-02T10:00:00Z' : null,
    services: [], originalRegularPrice: 260, originalVipPrice: 390, originalHomePrice: null, savingPercent: 23,
  };
}

function page(items: OfferListItem[], currentPage = 1): ApiResponse<OfferListItem[]> {
  return {
    status: true, statusCode: 200, message: 'ok', errors: null, data: items,
    meta: {
      currentPage, pageSize: 12, totalPages: 3, totalCount: 30, hasPreviousPage: currentPage > 1, hasNextPage: true,
      additionalData: { all: 30, active: 12, scheduled: 8, endedOrFull: 10 },
    },
  };
}

function ok<T>(data: T, status = true): ApiResponse<T> {
  return { status, statusCode: status ? 200 : 404, message: 'msg', errors: null, meta: null, data };
}

const NEW_OFFER = {
  branchId: 3, nameAr: 'أ', nameEn: 'A', serviceIds: [1, 2], regularPrice: 1, vipPrice: 1, homePrice: null,
  startDate: '2026-11-07', endDate: null, maxBookings: null,
};
const EDIT_OFFER = { ...NEW_OFFER, removeImage: false };

class FakeRepository {
  calls: OffersQuery[] = [];
  pending: Array<Subject<ApiResponse<OfferListItem[]>>> = [];
  create = vi.fn((): Observable<ApiResponse<number>> => of(ok(9)));
  update = vi.fn((): Observable<ApiResponse<null>> => of(ok(null)));
  toggle = vi.fn((): Observable<ApiResponse<null>> => of(ok(null)));
  remove = vi.fn((): Observable<ApiResponse<null>> => of(ok(null)));
  byId = vi.fn((): Observable<ApiResponse<unknown>> => of(ok({ id: 1 })));

  getOffers(q: OffersQuery) {
    this.calls.push(q);
    const s = new Subject<ApiResponse<OfferListItem[]>>();
    this.pending.push(s);
    return s;
  }
  getOfferById() { return this.byId(); }
  createOffer() { return this.create(); }
  updateOffer() { return this.update(); }
  toggleOfferStatus() { return this.toggle(); }
  deleteOffers() { return this.remove(); }
  get last() { return this.pending[this.pending.length - 1]; }
  respond(res: ApiResponse<OfferListItem[]>) {
    this.last.next(res);
    this.last.complete();
  }
}

const BRANCHES = [
  { id: 5, nameAr: 'القاهرة الجديدة', nameEn: 'New Cairo' },
  { id: 3, nameAr: 'مدينة نصر', nameEn: 'Nasr City' },
];

describe('OffersService', () => {
  let repo: FakeRepository;
  let service: OffersService;
  let success: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    repo = new FakeRepository();
    success = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: OFFER_REPOSITORY, useValue: repo },
        { provide: BranchesService, useValue: { loadOptions: () => of(BRANCHES) } },
        { provide: NotificationService, useValue: { success, warning: vi.fn() } },
      ],
    });
    service = TestBed.inject(OffersService);
  });

  describe('list', () => {
    it('selects the FIRST branch (lowest id), starts on the All tab and loads its offers', () => {
      service.initialize();
      expect(service.branchId()).toBe(3);
      expect(service.tab()).toBe('all');
      expect(repo.calls[0]).toMatchObject({ branchId: 3, pageNumber: 1, pageSize: 12 });
      expect(repo.calls[0].statuses).toBeUndefined();

      repo.respond(page([offer(1)]));
      expect(service.offers()).toHaveLength(1);
      expect(service.summary()).toEqual({ all: 30, active: 12, scheduled: 8, endedOrFull: 10 });
      expect(service.loading()).toBe(false);
    });

    it('keeps the branch between visits but resets tab, search and paging', () => {
      service.initialize();
      service.selectBranch(5);
      service.setTab('scheduled');
      service.setSearch('weekend');
      service.setPage(2);

      service.initialize();

      expect(service.branchId()).toBe(5);
      expect(service.tab()).toBe('all');
      expect(repo.calls.at(-1)).toMatchObject({ branchId: 5, pageNumber: 1 });
      expect(repo.calls.at(-1)!.search).toBeUndefined();
      expect(repo.calls.at(-1)!.statuses).toBeUndefined();
    });

    it.each([
      ['active', [OfferStatus.Active]],
      ['scheduled', [OfferStatus.Scheduled]],
      ['endedOrFull', [OfferStatus.Ended, OfferStatus.LimitReached, OfferStatus.Stopped]],
    ] as const)('the %s tab sends its statuses and restarts at page 1', (tab, statuses) => {
      service.initialize();
      service.setPage(3);
      service.setTab(tab);
      expect(repo.calls.at(-1)).toMatchObject({ statuses, pageNumber: 1 });
    });

    it('sends Active (status 0) as a real filter, and All clears it again', () => {
      service.initialize();
      service.setTab('active');
      expect(repo.calls.at(-1)!.statuses).toEqual([0]);

      service.setTab('all');
      expect(repo.calls.at(-1)!.statuses).toBeUndefined();
    });

    it('selecting the tab already shown does nothing', () => {
      service.initialize();
      const before = repo.calls.length;
      service.setTab('all');
      expect(repo.calls).toHaveLength(before);
    });

    it('the tab counts ignore the tab and search (they come from the response)', () => {
      service.initialize();
      service.setTab('active');
      repo.respond(page([offer(1)]));
      expect(service.summary().all).toBe(30);
      expect(service.summary().endedOrFull).toBe(10);
    });

    it('search is trimmed, restarts at page 1 and keeps the tab; blank clears it', () => {
      service.initialize();
      service.setTab('scheduled');
      service.setPage(2);
      service.setSearch('  weekend ');
      expect(repo.calls.at(-1)).toMatchObject({ search: 'weekend', pageNumber: 1, statuses: [OfferStatus.Scheduled] });

      service.setSearch('   ');
      expect(repo.calls.at(-1)!.search).toBeUndefined();
    });

    it('selectBranch clears the old rows and counts right away and restarts at page 1, keeping the tab', () => {
      service.initialize();
      repo.respond(page([offer(1)]));
      service.setTab('active');
      service.setPage(2);

      service.selectBranch(5);

      expect(service.offers()).toEqual([]);
      expect(service.meta()).toBeNull();
      expect(service.summary()).toEqual({ all: 0, active: 0, scheduled: 0, endedOrFull: 0 });
      expect(repo.calls.at(-1)).toMatchObject({ branchId: 5, pageNumber: 1, statuses: [OfferStatus.Active] });
    });

    it('selecting the branch already on screen does nothing', () => {
      service.initialize();
      const before = repo.calls.length;
      service.selectBranch(3);
      expect(repo.calls).toHaveLength(before);
    });

    it('ignores a stale response when a newer request was issued', () => {
      service.initialize();
      const stale = repo.last;
      service.setSearch('new');

      stale.next(page([offer(1)]));
      expect(service.offers()).toEqual([]);

      repo.respond(page([offer(2)]));
      expect(service.offers().map((o) => o.id)).toEqual([2]);
      expect(service.loading()).toBe(false);
    });

    it('flags an error but keeps the previous rows', () => {
      service.initialize();
      repo.respond(page([offer(1)]));
      service.load();
      repo.last.error(new Error('boom'));

      expect(service.hasError()).toBe(true);
      expect(service.offers()).toHaveLength(1);
      expect(service.loading()).toBe(false);
    });

    it('does not request anything when the salon has no branches', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: OFFER_REPOSITORY, useValue: repo },
          { provide: BranchesService, useValue: { loadOptions: () => of([]) } },
          { provide: NotificationService, useValue: { success, warning: vi.fn() } },
        ],
      });
      const empty = TestBed.inject(OffersService);

      empty.initialize();

      expect(empty.noBranches()).toBe(true);
      expect(empty.branchId()).toBeNull();
      expect(repo.calls).toHaveLength(0);
    });
  });

  describe('mutations', () => {
    beforeEach(() => {
      service.initialize();
      repo.respond(page([offer(1), offer(2, OfferStatus.Stopped)]));
      repo.calls.length = 0;
    });

    it('create → new id, success toast, list reloaded', () => {
      let id: number | null = null;
      service.createOffer(NEW_OFFER).subscribe((v) => (id = v));

      expect(id).toBe(9);
      expect(success).toHaveBeenCalledWith('OFFERS.CREATED');
      expect(repo.calls).toHaveLength(1);
      expect(service.saving()).toBe(false);
    });

    it('a failed create → null, no toast, no reload', () => {
      repo.create.mockReturnValue(throwError(() => new Error('400')));
      let id: number | null = 0;
      service.createOffer(NEW_OFFER).subscribe((v) => (id = v));

      expect(id).toBeNull();
      expect(success).not.toHaveBeenCalled();
      expect(repo.calls).toHaveLength(0);
      expect(service.saving()).toBe(false);
    });

    it('a status:false body counts as a failure', () => {
      repo.update.mockReturnValue(of(ok(null, false)));
      let result: boolean | null = null;
      service.updateOffer(1, EDIT_OFFER).subscribe((v) => (result = v));

      expect(result).toBe(false);
      expect(success).not.toHaveBeenCalled();
      expect(repo.calls).toHaveLength(0);
    });

    it('update → toast and reload', () => {
      service.updateOffer(1, EDIT_OFFER).subscribe();
      expect(success).toHaveBeenCalledWith('OFFERS.UPDATED');
      expect(repo.calls).toHaveLength(1);
    });

    it('stopping a running offer toasts "stopped" and reloads (the counts change)', () => {
      service.toggleStatus(1).subscribe();
      expect(success).toHaveBeenCalledWith('OFFERS.STOPPED');
      expect(repo.calls).toHaveLength(1);
    });

    it('resuming a stopped offer toasts "resumed"', () => {
      service.toggleStatus(2).subscribe();
      expect(success).toHaveBeenCalledWith('OFFERS.RESUMED');
    });

    it('a refused resume (400) → false, no toast, no reload', () => {
      repo.toggle.mockReturnValue(throwError(() => new Error('400')));
      let result: boolean | null = null;
      service.toggleStatus(2).subscribe((v) => (result = v));

      expect(result).toBe(false);
      expect(success).not.toHaveBeenCalled();
      expect(repo.calls).toHaveLength(0);
      expect(service.saving()).toBe(false);
    });

    it('delete steps back one page when it empties the current one', () => {
      service.setPage(2);
      repo.respond(page([offer(7)], 2));
      repo.calls.length = 0;

      service.remove([7]).subscribe();

      expect(success).toHaveBeenCalledWith('OFFERS.DELETED');
      expect(repo.calls.at(-1)).toMatchObject({ pageNumber: 1 });
    });

    it('delete keeps the page when rows remain on it', () => {
      service.setPage(2);
      repo.respond(page([offer(7), offer(8)], 2));
      repo.calls.length = 0;

      service.remove([7]).subscribe();

      expect(repo.calls.at(-1)).toMatchObject({ pageNumber: 2 });
    });
  });

  describe('getOffer', () => {
    it('is null for a status:false body or an error', () => {
      let result: unknown = 'unset';
      repo.byId.mockReturnValue(of(ok(null, false)));
      service.getOffer(1).subscribe((v) => (result = v));
      expect(result).toBeNull();

      repo.byId.mockReturnValue(throwError(() => new Error('404')));
      service.getOffer(1).subscribe((v) => (result = v));
      expect(result).toBeNull();
    });
  });
});
