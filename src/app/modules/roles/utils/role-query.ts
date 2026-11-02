import { HttpParams } from '@angular/common/http';

import { RolesQuery } from '../model/role.model';

/** Builds GET /roles query params with the PascalCase names the backend binds; empty filters are omitted. */
export function buildRolesParams(q: RolesQuery): HttpParams {
  let params = new HttpParams().set('PageNumber', q.pageNumber).set('PageSize', q.pageSize);
  if (q.search) params = params.set('Search', q.search);
  if (q.includePermissions) params = params.set('IncludePermissions', true);
  return params;
}
