import { HttpParams } from '@angular/common/http';

import { BranchesQuery } from '../model/branch.model';

/**
 * Builds GET /branches query params with the camelCase names from the API contract
 * (pageNumber, pageSize, search, isVisible). Unset filters are omitted — and
 * `isVisible=false` (hidden only) IS sent, since false is a real filter.
 */
export function buildBranchesParams(q: BranchesQuery): HttpParams {
  let params = new HttpParams().set('pageNumber', q.pageNumber).set('pageSize', q.pageSize);
  if (q.search) params = params.set('search', q.search);
  if (q.isVisible !== undefined) params = params.set('isVisible', q.isVisible);
  return params;
}
