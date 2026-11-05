import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationService } from '@core/services/notification.service';
import { ApiResponse } from '@shared/model/api_response.model';
import {
  BarberDetails,
  BarberListItem,
  BarbersQuery,
  CreateBarberPayload,
  UpdateBarberPayload,
} from '../model/barber.model';
import { BARBER_REPOSITORY } from '../repository/barber.repository';
import { BarbersService } from './barbers.service';

function barber(id: number, isActive = true): BarberListItem {
  return { id, branchId: 3, branchNameAr: 'مدينة نصر', branchNameEn: 'Nasr City', fullName: `Barber ${id}`, phone: `+2010000000${id}`.slice(0, 13), imageUrl: null, isActive };
}

function response(items: BarberListItem[], totalCount = items.length, currentPage = 1): ApiResponse<BarberListItem[]> {
  return {
    status: true, statusCode: 200, message: 'ok', errors: null, data: items,
    meta: { currentPage, pageSize: 10, totalPages: Math.max(1, Math.ceil(totalCount / 10)), totalCount, hasPreviousPage: currentPage > 1, hasNextPage: false, additionalData: null },
  };
}

function ok<T>(data: T): ApiResponse<T> {
  return { status: true, statusCode: 200, message: 'ok', errors: null, meta: null, data };
}

const CREATE: CreateBarberPayload = { branchId: 3, fullName: 'Karim Mostafa', phone: '+201001234567' };
const UPDATE: UpdateBarberPayload = { ...CREATE, removeImage: false };
const DETAILS: BarberDetails = { ...barber(7), createdAt: '2026-11-02T15:02:40Z', updatedAt: null };

/** Repository double: list calls return a Subject the test resolves by hand; the rest answer from `next`. */
class FakeRepository {
  calls: BarbersQuery[] = [];
  next: () => Observable<ApiResponse<unknown>> = () => of(ok(null));
  byId = vi.fn((_id: number) => this.next() as Observable<ApiResponse<BarberDetails>>);
  create = vi.fn((_p: CreateBarberPayload) => this.next() as Observable<ApiResponse<number>>);
  update = vi.fn((_id: number, _p: UpdateBarberPayload) => this.next() as Observable<ApiResponse<null>>);
  toggle = vi.fn((_id: number) => this.next() as Observable<ApiResponse<null>>);
  remove = vi.fn((_p: { ids: number[] }) => this.next() as Observable<ApiResponse<null>>);
  getBarberById(id: number) { return this.byId(id); }
  createBarber(p: CreateBarberPayload) { return this.create(p); }
  updateBarber(id: number, p: UpdateBarberPayload) { return this.update(id, p); }
  toggleBarberStatus(id: number) { return this.toggle(id); }
  deleteBarbers(p: { ids: number[] }) { return this.remove(p); }
  pending: Array<Subject<ApiResponse<BarberListItem[]>>> = [];
  getBarbers(q: BarbersQuery): Observable<ApiResponse<BarberListItem[]>> {
    this.calls.push(q);
    const s = new Subject<ApiResponse<BarberListItem[]>>();
    this.pending.push(s);
    return s;
  }
  get last() { return this.pending[this.pending.length - 1]; }
}

describe('BarbersService', () => {
  let repo: FakeRepository;
  let service: BarbersService;
  let success: ReturnType<typeof vi.spyOn>;

  /** Load page 1 and answer it, so later mutations have rows to work with. */
  function seed(items: BarberListItem[], totalCount = items.length, currentPage = 1): void {
    service.load();
    repo.last.next(response(items, totalCount, currentPage));
    repo.last.complete();
  }

  beforeEach(() => {
    repo = new FakeRepository();
    TestBed.configureTestingModule({ providers: [{ provide: BARBER_REPOSITORY, useValue: repo }] });
    service = TestBed.inject(BarbersService);
    success = vi.spyOn(TestBed.inject(NotificationService), 'success');
  });

  it('loads page 1 with the default page size and maps data + pagination meta', () => {
    service.load();
    expect(service.loading()).toBe(true);
    expect(repo.calls[0]).toEqual({ pageNumber: 1, pageSize: 10 });

    repo.last.next(response([barber(2), barber(1)], 14));
    repo.last.complete();

    expect(service.loading()).toBe(false);
    expect(service.hasError()).toBe(false);
    expect(service.barbers().map((b) => b.id)).toEqual([2, 1]);
    expect(service.meta()?.totalCount).toBe(14);
    expect(service.totalCount()).toBe(14);
  });

  it('totalCount is 0 before the first response', () => {
    expect(service.totalCount()).toBe(0);
  });

  it('flags a failed load, clears loading and keeps the previous rows', () => {
    seed([barber(1)]);
    service.load();
    repo.last.error(new Error('boom'));

    expect(service.hasError()).toBe(true);
    expect(service.loading()).toBe(false);
    expect(service.barbers().map((b) => b.id)).toEqual([1]);
  });

  it('a filter change goes back to page 1 and keeps the other filters', () => {
    service.setPage(3);
    service.setFilters({ branchId: 3 });
    service.setFilters({ search: 'karim' });

    expect(repo.calls[repo.calls.length - 1]).toEqual({ pageNumber: 1, pageSize: 10, branchId: 3, search: 'karim' });
  });

  it('keeps isActive=false as a filter, and clears one with undefined', () => {
    service.setFilters({ isActive: false, branchId: 3 });
    expect(service.query()).toMatchObject({ isActive: false, branchId: 3 });

    service.setFilters({ branchId: undefined });
    expect(service.query().branchId).toBeUndefined();
    expect(service.query().isActive).toBe(false);
  });

  it('setPage reloads the requested page', () => {
    service.setPage(2);
    expect(repo.calls[0]).toMatchObject({ pageNumber: 2 });
  });

  it('a stale response can neither overwrite fresh rows nor clear the loading flag', () => {
    service.load();
    const stale = repo.last;
    service.setFilters({ search: 'k' });
    const fresh = repo.last;

    fresh.next(response([barber(9)]));
    stale.next(response([barber(1)]));
    stale.complete();

    expect(service.barbers().map((b) => b.id)).toEqual([9]);
    expect(service.loading()).toBe(true);

    fresh.complete();
    expect(service.loading()).toBe(false);
  });

  describe('getBarber', () => {
    it('returns the details', () => {
      repo.next = () => of(ok(DETAILS));
      let result: BarberDetails | null = null;
      service.getBarber(7).subscribe((d) => (result = d));
      expect(result).toEqual(DETAILS);
    });

    it('returns null for a status:false body', () => {
      repo.next = () => of({ ...ok(null), status: false, statusCode: 404 });
      let result: BarberDetails | null = DETAILS;
      service.getBarber(99).subscribe((d) => (result = d));
      expect(result).toBeNull();
    });

    it('returns null when the request errors', () => {
      repo.next = () => throwError(() => new Error('404'));
      let result: BarberDetails | null = DETAILS;
      service.getBarber(99).subscribe((d) => (result = d));
      expect(result).toBeNull();
    });
  });

  describe('mutations', () => {
    beforeEach(() => seed([barber(1), barber(2, false)]));

    it('createBarber returns the new id, toasts and reloads the list', () => {
      repo.next = () => of(ok(14));
      const before = repo.calls.length;
      let id: number | null = null;
      service.createBarber(CREATE).subscribe((v) => (id = v));

      expect(id).toBe(14);
      expect(repo.create).toHaveBeenCalledWith(CREATE);
      expect(success).toHaveBeenCalledWith('BARBERS.CREATED');
      expect(repo.calls.length).toBe(before + 1);
    });

    it('createBarber resolves to null on failure, without a toast or reload', () => {
      repo.next = () => throwError(() => new Error('400'));
      const before = repo.calls.length;
      let id: number | null = 0;
      service.createBarber(CREATE).subscribe((v) => (id = v));

      expect(id).toBeNull();
      expect(success).not.toHaveBeenCalled();
      expect(repo.calls.length).toBe(before);
      expect(service.saving()).toBe(false);
    });

    it('updateBarber sends id + payload, toasts and reloads', () => {
      const before = repo.calls.length;
      let result: boolean | null = null;
      service.updateBarber(1, UPDATE).subscribe((v) => (result = v));

      expect(result).toBe(true);
      expect(repo.update).toHaveBeenCalledWith(1, UPDATE);
      expect(success).toHaveBeenCalledWith('BARBERS.UPDATED');
      expect(repo.calls.length).toBe(before + 1);
    });

    it('a 409 on transfer resolves to false and leaves the list alone', () => {
      repo.next = () => throwError(() => Object.assign(new Error('409'), { status: 409 }));
      const before = repo.calls.length;
      let result: boolean | null = null;
      service.updateBarber(1, { ...UPDATE, branchId: 5 }).subscribe((v) => (result = v));

      expect(result).toBe(false);
      expect(success).not.toHaveBeenCalled();
      expect(repo.calls.length).toBe(before);
    });

    it('toggleStatus says "suspended" for an active barber and reloads', () => {
      const before = repo.calls.length;
      service.toggleStatus(1).subscribe();

      expect(repo.toggle).toHaveBeenCalledWith(1);
      expect(success).toHaveBeenCalledWith('BARBERS.SUSPENDED');
      expect(repo.calls.length).toBe(before + 1);
    });

    it('toggleStatus says "activated" for a suspended barber', () => {
      service.toggleStatus(2).subscribe();
      expect(success).toHaveBeenCalledWith('BARBERS.ACTIVATED');
    });

    it('toggleStatus falls back to a neutral message for a row that is not on screen', () => {
      service.toggleStatus(999).subscribe();
      expect(success).toHaveBeenCalledWith('BARBERS.STATUS_UPDATED');
    });

    it('a 409 on suspend resolves to false and leaves the list alone', () => {
      repo.next = () => throwError(() => Object.assign(new Error('409'), { status: 409 }));
      const before = repo.calls.length;
      let result: boolean | null = null;
      service.toggleStatus(1).subscribe((v) => (result = v));

      expect(result).toBe(false);
      expect(success).not.toHaveBeenCalled();
      expect(repo.calls.length).toBe(before);
    });

    it('a status:false body counts as a failure', () => {
      repo.next = () => of({ ...ok(null), status: false, statusCode: 404 });
      let result: boolean | null = null;
      service.updateBarber(1, UPDATE).subscribe((v) => (result = v));

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
    it('sends { ids }, toasts the singular message for one barber and reloads', () => {
      seed([barber(1), barber(2)]);
      const before = repo.calls.length;
      service.remove([1]).subscribe();

      expect(repo.remove).toHaveBeenCalledWith({ ids: [1] });
      expect(success).toHaveBeenCalledWith('BARBERS.DELETED');
      expect(repo.calls.length).toBe(before + 1);
    });

    it('bulk delete sends every id and toasts the plural message', () => {
      seed([barber(1), barber(2), barber(3)]);
      service.remove([1, 2]).subscribe();

      expect(repo.remove).toHaveBeenCalledWith({ ids: [1, 2] });
      expect(success).toHaveBeenCalledWith('BARBERS.DELETED_MANY');
    });

    it('steps back a page when the delete empties the current page', () => {
      seed([barber(11)], 11, 2);
      service.setPage(2);
      repo.last.next(response([barber(11)], 11, 2));
      repo.last.complete();

      service.remove([11]).subscribe();
      expect(repo.calls[repo.calls.length - 1].pageNumber).toBe(1);
    });

    it('stays on the page when rows remain', () => {
      service.setPage(2);
      repo.last.next(response([barber(11), barber(12)], 12, 2));
      repo.last.complete();

      service.remove([11]).subscribe();
      expect(repo.calls[repo.calls.length - 1].pageNumber).toBe(2);
    });

    it('a blocked delete (409) resolves to false and does not reload or toast', () => {
      seed([barber(1)]);
      repo.next = () => throwError(() => Object.assign(new Error('409'), { status: 409 }));
      const before = repo.calls.length;
      let result: boolean | null = null;
      service.remove([1]).subscribe((v) => (result = v));

      expect(result).toBe(false);
      expect(success).not.toHaveBeenCalled();
      expect(repo.calls.length).toBe(before);
    });
  });
});
