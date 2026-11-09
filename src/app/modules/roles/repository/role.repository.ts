import { InjectionToken } from "@angular/core";
import { Observable } from "rxjs";

import { ApiResponse } from "@shared/model/api_response.model";
import {
  DeleteRolesRequest,
  RoleDetails,
  RoleListItem,
  RoleNameRequest,
  RolesQuery,
  UpdateRolePermissionsRequest,
} from "../model/role.model";

/** Contract shared by the HTTP and mock repositories (pure data access). */
export interface IRoleRepository {
  /** GET /roles */
  getRoles(query: RolesQuery): Observable<ApiResponse<RoleListItem[]>>;
  /** GET /roles/{id} */
  getRoleById(id: number): Observable<ApiResponse<RoleDetails>>;
  /** POST /roles */
  createRole(payload: RoleNameRequest): Observable<ApiResponse<null>>;
  /** PUT /roles/{id} */
  updateRole(id: number, payload: RoleNameRequest): Observable<ApiResponse<null>>;
  /** PUT /roles/{id}/permissions */
  updatePermissions(
    id: number,
    payload: UpdateRolePermissionsRequest,
  ): Observable<ApiResponse<null>>;
  /** DELETE /roles (body: { ids }) */
  deleteRoles(payload: DeleteRolesRequest): Observable<ApiResponse<null>>;
}

/** DI token: `app.providers*.ts` decides whether the API or the mock implementation backs it. */
export const ROLE_REPOSITORY = new InjectionToken<IRoleRepository>("ROLE_REPOSITORY");
