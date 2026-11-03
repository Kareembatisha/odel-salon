import { Injectable, inject } from '@angular/core';
import { Observable, delay, of } from 'rxjs';

import { MockDb } from '@core/mock/mock-db';
import { ApiResponse } from '@shared/model/api_response.model';
import { BranchListItem, BranchesQuery } from '../model/branch.model';
import { IBranchRepository } from './branch.repository';

const MOCK_DELAY_MS = 450;

@Injectable({ providedIn: 'root' })
export class BranchMockRepository implements IBranchRepository {
  private readonly db = inject(MockDb);

  /** Same rules as the backend: `search` matches nameAr / nameEn / address / phone, newest first. */
  getBranches(q: BranchesQuery): Observable<ApiResponse<BranchListItem[]>> {
    const term = (q.search ?? '').trim().toLowerCase();
    const all = this.db.branches
      .filter(
        (b) =>
          (q.isVisible === undefined || b.isVisible === q.isVisible) &&
          (!term ||
            b.nameAr.toLowerCase().includes(term) ||
            b.nameEn.toLowerCase().includes(term) ||
            b.address.toLowerCase().includes(term) ||
            b.phone.includes(term)),
      )
      .sort((a, b) => b.id - a.id);

    const start = (q.pageNumber - 1) * q.pageSize;
    const totalPages = Math.max(1, Math.ceil(all.length / q.pageSize));
    return of<ApiResponse<BranchListItem[]>>({
      status: true,
      statusCode: 200,
      message: 'Operation completed successfully',
      errors: null,
      meta: {
        currentPage: q.pageNumber,
        pageSize: q.pageSize,
        totalPages,
        totalCount: all.length,
        hasPreviousPage: q.pageNumber > 1,
        hasNextPage: q.pageNumber < totalPages,
        additionalData: null,
      },
      data: all.slice(start, start + q.pageSize).map((b) => ({ ...b })),
    }).pipe(delay(MOCK_DELAY_MS));
  }
}
