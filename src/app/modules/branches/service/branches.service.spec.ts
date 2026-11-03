import { TestBed } from '@angular/core/testing';
import { Observable, Subject } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { ApiResponse } from '@shared/model/api_response.model';
import { BranchListItem, BranchesQuery } from '../model/branch.model';
import { BranchApiRepository } from '../repository/branch-api.repository';
import { BranchMockRepository } from '../repository/branch-mock.repository';
import { BranchesService } from './branches.service';

function branch(id: number): BranchListItem {
  return {
    id, nameAr: `فرع ${id}`, nameEn: `Branch ${id}`, address: 'Somewhere', phone: '+201001102194',
    allowsRegular: true, allowsVip: false, allowsHome: false, isVisible: true,
    barbersCount: 1, regularChairsCount: 1, vipChairsCount: 0,
  };
}

function response(items: BranchListItem[], totalCount = items.length, currentPage = 1): ApiResponse<BranchListItem[]> {
  return {
    status: true, statusCode: 200, message: 'ok', errors: null, data: items,
    meta: { currentPage, pageSize: 12, totalPages: Math.max(1, Math.ceil(totalCount / 12)), totalCount, hasPreviousPage: currentPage > 1, hasNextPage: false, additionalData: null },
  };
}

/** Repository double: every call returns a Subject the test resolves by hand. */
class FakeRepository {
  calls: BranchesQuery[] = [];
  pending: Array<Subject<ApiResponse<BranchListItem[]>>> = [];
  getBranches(q: BranchesQuery): Observable<ApiResponse<BranchListItem[]>> {
    this.calls.push(q);
    const s = new Subject<ApiResponse<BranchListItem[]>>();
    this.pending.push(s);
    return s;
  }
  get last() { return this.pending[this.pending.length - 1]; }
}

describe('BranchesService', () => {
  let repo: FakeRepository;
  let service: BranchesService;

  beforeEach(() => {
    repo = new FakeRepository();
    // The service picks mock vs API from the build environment — cover both so the spec doesn't depend on it.
    TestBed.configureTestingModule({
      providers: [
        { provide: BranchMockRepository, useValue: repo },
        { provide: BranchApiRepository, useValue: repo },
      ],
    });
    service = TestBed.inject(BranchesService);
  });

  it('loads page 1 with the default page size and maps data + pagination meta', () => {
    service.load();
    expect(service.loading()).toBe(true);
    expect(repo.calls[0]).toEqual({ pageNumber: 1, pageSize: 12 });

    repo.last.next(response([branch(2), branch(1)], 14));
    repo.last.complete();

    expect(service.loading()).toBe(false);
    expect(service.hasError()).toBe(false);
    expect(service.branches().map((b) => b.id)).toEqual([2, 1]);
    expect(service.meta()?.totalCount).toBe(14);
  });

  it('flags a failed load and clears the loading state', () => {
    service.load();
    repo.last.error(new Error('boom'));

    expect(service.hasError()).toBe(true);
    expect(service.loading()).toBe(false);
  });

  it('clears the error when a retry starts', () => {
    service.load();
    repo.last.error(new Error('boom'));
    service.load();

    expect(service.hasError()).toBe(false);
    expect(service.loading()).toBe(true);
  });

  it('goes back to page 1 whenever a filter changes, and keeps the other filters', () => {
    service.setPage(3);
    expect(repo.calls[0].pageNumber).toBe(3);

    service.setFilters({ search: 'nasr' });
    expect(repo.calls[1]).toEqual({ pageNumber: 1, pageSize: 12, search: 'nasr' });

    service.setFilters({ isVisible: false });
    expect(repo.calls[2]).toEqual({ pageNumber: 1, pageSize: 12, search: 'nasr', isVisible: false });

    service.setPage(2);
    expect(repo.calls[3]).toEqual({ pageNumber: 2, pageSize: 12, search: 'nasr', isVisible: false });
  });

  it('ignores a slow response that was superseded by a newer request', () => {
    service.setFilters({ search: 'a' });
    const stale = repo.last;
    service.setFilters({ search: 'ab' });
    const fresh = repo.last;

    fresh.next(response([branch(7)]));
    fresh.complete();
    stale.next(response([branch(99)]));
    stale.complete();

    expect(service.branches().map((b) => b.id)).toEqual([7]);
    expect(service.loading()).toBe(false);
  });
});
