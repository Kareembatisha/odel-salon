import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationService } from '@core/services/notification.service';
import { ApiResponse } from '@shared/model/api_response.model';
import {
  ChairDetails,
  ChairListItem,
  ChairType,
  ChairsQuery,
  CreateChairPayload,
  UpdateChairPayload,
} from '../model/chair.model';
import { CHAIR_REPOSITORY } from '../repository/chair.repository';
import { ChairsService } from './chairs.service';

function chair(id: number, type = ChairType.Regular): ChairListItem {
  return { id, branchId: 3, branchNameAr: 'مدينة نصر', branchNameEn: 'Nasr City', name: `C${id}`, type, isActive: true };
}

function response(items: ChairListItem[], totalCount = items.length, currentPage = 1, additionalData: Record<string, unknown> | null = null): ApiResponse<ChairListItem[]> {
  return {
    status: true, statusCode: 200, message: 'ok', errors: null, data: items,
    meta: { currentPage, pageSize: 12, totalPages: Math.max(1, Math.ceil(totalCount / 12)), totalCount, hasPreviousPage: currentPage > 1, hasNextPage: false, additionalData },
  };
}

function ok<T>(data: T): ApiResponse<T> {
  return { status: true, statusCode: 200, message: 'ok', errors: null, meta: null, data };
}

const CREATE: CreateChairPayload = { branchId: 3, name: 'R4', type: ChairType.Regular };
const UPDATE: UpdateChairPayload = { name: 'R4', type: ChairType.Vip };
const DETAILS: ChairDetails = { ...chair(12, ChairType.Vip), createdAt: '2026-11-02T14:20:11Z', updatedAt: null };

/** Repository double: list calls return a Subject the test resolves by hand; the rest answer from `next`. */
class FakeRepository {
  calls: ChairsQuery[] = [];
  next: () => Observable<ApiResponse<unknown>> = () => of(ok(null));
  byId = vi.fn((_id: number) => this.next() as Observable<ApiResponse<ChairDetails>>);
  create = vi.fn((_p: CreateChairPayload) => this.next() as Observable<ApiResponse<number>>);
  update = vi.fn((_id: number, _p: UpdateChairPayload) => this.next() as Observable<ApiResponse<null>>);
  toggle = vi.fn((_id: number) => this.next() as Observable<ApiResponse<null>>);
  remove = vi.fn((_p: { ids: number[] }) => this.next() as Observable<ApiResponse<null>>);
  getChairById(id: number) { return this.byId(id); }
  createChair(p: CreateChairPayload) { return this.create(p); }
  updateChair(id: number, p: UpdateChairPayload) { return this.update(id, p); }
  toggleChairStatus(id: number) { return this.toggle(id); }
  deleteChairs(p: { ids: number[] }) { return this.remove(p); }
  pending: Array<Subject<ApiResponse<ChairListItem[]>>> = [];
  getChairs(q: ChairsQuery): Observable<ApiResponse<ChairListItem[]>> {
    this.calls.push(q);
    const s = new Subject<ApiResponse<ChairListItem[]>>();
    this.pending.push(s);
    return s;
  }
  get last() { return this.pending[this.pending.length - 1]; }
}

describe('ChairsService', () => {
  let repo: FakeRepository;
  let service: ChairsService;
  let success: ReturnType<typeof vi.spyOn>;

  /** Load page 1 and answer it, so later mutations have rows to work with. */
  function seed(items: ChairListItem[], totalCount = items.length, currentPage = 1): void {
    service.load();
    repo.last.next(response(items, totalCount, currentPage));
    repo.last.complete();
  }

  beforeEach(() => {
    repo = new FakeRepository();
    TestBed.configureTestingModule({ providers: [{ provide: CHAIR_REPOSITORY, useValue: repo }] });
    service = TestBed.inject(ChairsService);
    success = vi.spyOn(TestBed.inject(NotificationService), 'success');
  });

  it('loads page 1 with the default page size and maps data + pagination meta', () => {
    service.load();
    expect(service.loading()).toBe(true);
    expect(repo.calls[0]).toEqual({ pageNumber: 1, pageSize: 12 });

    repo.last.next(response([chair(2), chair(1)], 14));
    repo.last.complete();

    expect(service.loading()).toBe(false);
    expect(service.hasError()).toBe(false);
    expect(service.chairs().map((c) => c.id)).toEqual([2, 1]);
    expect(service.meta()?.totalCount).toBe(14);
  });

  it('exposes the summary cards from meta.additionalData, zeros before the first load', () => {
    expect(service.summary()).toEqual({ regularActive: 0, vipActive: 0, inactive: 0 });

    service.load();
    repo.last.next(response([chair(1)], 1, 1, { regularActive: 3, vipActive: 2, inactive: 1 }));
    repo.last.complete();

    expect(service.summary()).toEqual({ regularActive: 3, vipActive: 2, inactive: 1 });
  });

  it('flags a failed load, clears loading and keeps the previous rows', () => {
    seed([chair(1)]);
    service.load();
    repo.last.error(new Error('boom'));

    expect(service.hasError()).toBe(true);
    expect(service.loading()).toBe(false);
    expect(service.chairs().map((c) => c.id)).toEqual([1]);
  });

  it('a filter change goes back to page 1 and keeps the other filters', () => {
    service.setPage(3);
    service.setFilters({ branchId: 3 });
    service.setFilters({ type: ChairType.Regular });

    expect(repo.calls[repo.calls.length - 1]).toEqual({ pageNumber: 1, pageSize: 12, branchId: 3, type: ChairType.Regular });
  });

  it('keeps type=0 and isActive=false as filters, and clears one with undefined', () => {
    service.setFilters({ type: ChairType.Regular, isActive: false });
    expect(service.query()).toMatchObject({ type: 0, isActive: false });

    service.setFilters({ type: undefined });
    expect(service.query().type).toBeUndefined();
    expect(service.query().isActive).toBe(false);
  });

  it('setPage reloads the requested page', () => {
    service.setPage(2);
    expect(repo.calls[0]).toMatchObject({ pageNumber: 2 });
  });

  it('a stale response can neither overwrite fresh rows nor clear the loading flag', () => {
    service.load();
    const stale = repo.last;
    service.setFilters({ search: 'V' });
    const fresh = repo.last;

    fresh.next(response([chair(9)]));
    stale.next(response([chair(1)]));
    stale.complete();

    expect(service.chairs().map((c) => c.id)).toEqual([9]);
    expect(service.loading()).toBe(true);

    fresh.complete();
    expect(service.loading()).toBe(false);
  });

  describe('getChair', () => {
    it('returns the details', () => {
      repo.next = () => of(ok(DETAILS));
      let result: ChairDetails | null = null;
      service.getChair(12).subscribe((d) => (result = d));
      expect(result).toEqual(DETAILS);
    });

    it('returns null for a status:false body', () => {
      repo.next = () => of({ ...ok(null), status: false, statusCode: 404 });
      let result: ChairDetails | null = DETAILS;
      service.getChair(99).subscribe((d) => (result = d));
      expect(result).toBeNull();
    });

    it('returns null when the request errors', () => {
      repo.next = () => throwError(() => new Error('404'));
      let result: ChairDetails | null = DETAILS;
      service.getChair(99).subscribe((d) => (result = d));
      expect(result).toBeNull();
    });
  });

  describe('mutations', () => {
    beforeEach(() => seed([chair(1)]));

    it('createChair returns the new id, toasts and reloads the list', () => {
      repo.next = () => of(ok(14));
      const before = repo.calls.length;
      let id: number | null = null;
      service.createChair(CREATE).subscribe((v) => (id = v));

      expect(id).toBe(14);
      expect(repo.create).toHaveBeenCalledWith(CREATE);
      expect(success).toHaveBeenCalledWith('CHAIRS.CREATED');
      expect(repo.calls.length).toBe(before + 1);
    });

    it('createChair resolves to null on failure, without a toast or reload', () => {
      repo.next = () => throwError(() => new Error('400'));
      const before = repo.calls.length;
      let id: number | null = 0;
      service.createChair(CREATE).subscribe((v) => (id = v));

      expect(id).toBeNull();
      expect(success).not.toHaveBeenCalled();
      expect(repo.calls.length).toBe(before);
      expect(service.saving()).toBe(false);
    });

    it('updateChair sends id + payload, toasts and reloads', () => {
      const before = repo.calls.length;
      let result: boolean | null = null;
      service.updateChair(1, UPDATE).subscribe((v) => (result = v));

      expect(result).toBe(true);
      expect(repo.update).toHaveBeenCalledWith(1, UPDATE);
      expect(success).toHaveBeenCalledWith('CHAIRS.UPDATED');
      expect(repo.calls.length).toBe(before + 1);
    });

    it('toggleStatus toasts and reloads so the summary cards refresh', () => {
      const before = repo.calls.length;
      service.toggleStatus(1).subscribe();

      expect(repo.toggle).toHaveBeenCalledWith(1);
      expect(success).toHaveBeenCalledWith('CHAIRS.STATUS_UPDATED');
      expect(repo.calls.length).toBe(before + 1);
    });

    it('a 409 on toggle resolves to false and leaves the list alone', () => {
      repo.next = () => throwError(() => Object.assign(new Error('409'), { status: 409 }));
      const before = repo.calls.length;
      let result: boolean | null = null;
      service.toggleStatus(1).subscribe((v) => (result = v));

      expect(result).toBe(false);
      expect(repo.calls.length).toBe(before);
    });

    it('a status:false body counts as a failure', () => {
      repo.next = () => of({ ...ok(null), status: false, statusCode: 404 });
      let result: boolean | null = null;
      service.updateChair(1, UPDATE).subscribe((v) => (result = v));

      expect(result).toBe(false);
      expect(success).not.toHaveBeenCalled();
    });

    it('raises the saving flag while a mutation is in flight', () => {
      const gate = new Subject<ApiResponse<null>>();
      repo.next = () => gate;
      service.toggleStatus(1).subscribe();
      expect(service.saving()).toBe(true);

      gate.next(ok(null));
      gate.complete();
      expect(service.saving()).toBe(false);
    });
  });

  describe('remove', () => {
    it('sends { ids }, toasts and reloads', () => {
      seed([chair(1), chair(2)]);
      const before = repo.calls.length;
      service.remove([1, 2]).subscribe();

      expect(repo.remove).toHaveBeenCalledWith({ ids: [1, 2] });
      expect(success).toHaveBeenCalledWith('CHAIRS.DELETED');
      expect(repo.calls.length).toBe(before + 1);
    });

    it('steps back a page when the delete empties the current page', () => {
      seed([chair(11)], 11, 2);
      service.setPage(2);
      repo.last.next(response([chair(11)], 11, 2));
      repo.last.complete();

      service.remove([11]).subscribe();
      expect(repo.calls[repo.calls.length - 1].pageNumber).toBe(1);
    });

    it('stays on the page when rows remain', () => {
      service.setPage(2);
      repo.last.next(response([chair(11), chair(12)], 12, 2));
      repo.last.complete();

      service.remove([11]).subscribe();
      expect(repo.calls[repo.calls.length - 1].pageNumber).toBe(2);
    });

    it('a blocked delete (409) resolves to false and does not reload', () => {
      seed([chair(1)]);
      repo.next = () => throwError(() => Object.assign(new Error('409'), { status: 409 }));
      const before = repo.calls.length;
      let result: boolean | null = null;
      service.remove([1]).subscribe((v) => (result = v));

      expect(result).toBe(false);
      expect(repo.calls.length).toBe(before);
    });
  });
});
