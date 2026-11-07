import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationService } from '@core/services/notification.service';
import { BranchesService } from '@modules/branches/service/branches.service';
import { ApiResponse } from '@shared/model/api_response.model';
import { ServiceListItem, ServicesQuery } from '../model/service.model';
import { SERVICE_REPOSITORY } from '../repository/service.repository';
import { ServicesService } from './services.service';

function item(id: number): ServiceListItem {
  return {
    id, nameAr: `خدمة ${id}`, nameEn: `Service ${id}`,
    pricing: { isPriced: true, durationMinutes: 30, regularPrice: 100, vipPrice: 150, isHomeAvailable: false, homePrice: null, isActive: true },
  };
}

function page(items: ServiceListItem[], currentPage = 1): ApiResponse<ServiceListItem[]> {
  return {
    status: true, statusCode: 200, message: 'ok', errors: null, data: items,
    meta: { currentPage, pageSize: 20, totalPages: 3, totalCount: 50, hasPreviousPage: currentPage > 1, hasNextPage: true, additionalData: { total: 50, active: 40, homeAvailable: 5, unpriced: 2 } },
  };
}

function ok<T>(data: T): ApiResponse<T> {
  return { status: true, statusCode: 200, message: 'ok', errors: null, meta: null, data };
}

class FakeRepository {
  calls: ServicesQuery[] = [];
  pending: Array<Subject<ApiResponse<ServiceListItem[]>>> = [];
  setStatus = vi.fn((_id: number, _p: { branchIds: number[]; isActive: boolean }) => of(ok(null)));
  getServices(q: ServicesQuery): Observable<ApiResponse<ServiceListItem[]>> {
    this.calls.push(q);
    const s = new Subject<ApiResponse<ServiceListItem[]>>();
    this.pending.push(s);
    return s;
  }
  setStatusInBranches(id: number, p: { branchIds: number[]; isActive: boolean }) { return this.setStatus(id, p); }
  get last() { return this.pending[this.pending.length - 1]; }
}

const BRANCHES = [
  { id: 3, nameAr: 'مدينة نصر', nameEn: 'Nasr City' },
  { id: 5, nameAr: 'القاهرة الجديدة', nameEn: 'New Cairo' },
];

describe('ServicesService', () => {
  let repo: FakeRepository;
  let service: ServicesService;

  beforeEach(() => {
    repo = new FakeRepository();
    TestBed.configureTestingModule({
      providers: [
        { provide: SERVICE_REPOSITORY, useValue: repo },
        { provide: BranchesService, useValue: { loadOptions: () => of(BRANCHES) } },
        { provide: NotificationService, useValue: { success: vi.fn(), warning: vi.fn() } },
      ],
    });
    service = TestBed.inject(ServicesService);
  });

  it('selects the FIRST branch by default and loads its table', () => {
    service.initialize();
    expect(service.branchId()).toBe(3);
    expect(repo.calls[0]).toMatchObject({ branchId: 3, pageNumber: 1, pageSize: 20 });
    repo.last.next(page([item(1)]));
    expect(service.services()).toHaveLength(1);
    expect(service.summary()).toEqual({ total: 50, active: 40, homeAvailable: 5, unpriced: 2 });
  });

  it('switching branch restarts at page 1 and clears the old rows immediately', () => {
    service.initialize();
    repo.last.next(page([item(1)]));
    service.setPage(2);
    service.selectBranch(5);
    expect(service.services()).toEqual([]);
    expect(repo.calls.at(-1)).toMatchObject({ branchId: 5, pageNumber: 1 });
  });

  it('the row switch sends a single-branch status request and reloads', () => {
    service.initialize();
    repo.last.next(page([item(1)]));
    const before = repo.calls.length;
    let result: boolean | undefined;
    service.setStatusInBranch(1, 3, false).subscribe((r) => (result = r));
    expect(repo.setStatus).toHaveBeenCalledWith(1, { branchIds: [3], isActive: false });
    expect(result).toBe(true);
    expect(repo.calls.length).toBe(before + 1);
  });

  describe('loadServiceOptions', () => {
    it('returns the ACTIVE priced services as flat options, oldest first', () => {
      let options: unknown[] = [];
      service.loadServiceOptions(3).subscribe((v) => (options = v));

      const inactive = item(1);
      inactive.pricing.isActive = false;
      const unpriced = item(4);
      unpriced.pricing.isPriced = false;
      const home = item(2);
      Object.assign(home.pricing, { isHomeAvailable: true, homePrice: 250, durationMinutes: 45 });

      repo.last.next(ok([item(3), inactive, home, unpriced]));

      expect(repo.calls.at(-1)).toMatchObject({ branchId: 3, pageNumber: 1, pageSize: 100 });
      expect(options).toEqual([
        { id: 2, nameAr: 'خدمة 2', nameEn: 'Service 2', durationMinutes: 45, regularPrice: 100, vipPrice: 150, isHomeAvailable: true, homePrice: 250 },
        { id: 3, nameAr: 'خدمة 3', nameEn: 'Service 3', durationMinutes: 30, regularPrice: 100, vipPrice: 150, isHomeAvailable: false, homePrice: null },
      ]);
    });
  });
});
