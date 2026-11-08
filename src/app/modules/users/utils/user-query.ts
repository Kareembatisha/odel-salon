import { HttpParams } from "@angular/common/http";

import { UsersQuery } from "../model/user.model";

/**
 * Builds GET /users query params with the PascalCase names the backend binds.
 * Unset filters are omitted — and `Status=false` (inactive only) IS sent, since false is a real filter.
 */
export function buildUsersParams(q: UsersQuery): HttpParams {
  let params = new HttpParams().set("PageNumber", q.pageNumber).set("PageSize", q.pageSize);
  if (q.roleId !== undefined) params = params.set("RoleId", q.roleId);
  if (q.status !== undefined) params = params.set("Status", q.status);
  if (q.search) params = params.set("Search", q.search);
  return params;
}
