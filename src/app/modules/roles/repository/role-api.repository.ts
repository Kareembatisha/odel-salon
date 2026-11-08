import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { environment } from "@env/environment";
import { ApiResponse } from "@shared/model/api_response.model";
import {
  DeleteRolesRequest,
  RoleDetails,
  RoleListItem,
  RoleNameRequest,
  RolesQuery,
  UpdateRolePermissionsRequest,
} from "../model/role.model";
import { buildRolesParams } from "../utils/role-query";
import { IRoleRepository } from "./role.repository";

@Injectable({ providedIn: "root" })
export class RoleApiRepository implements IRoleRepository {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/roles`;

  getRoles(query: RolesQuery): Observable<ApiResponse<RoleListItem[]>> {
    return this.http.get<ApiResponse<RoleListItem[]>>(this.url, {
      params: buildRolesParams(query),
    });
  }

  getRole(id: number): Observable<ApiResponse<RoleDetails>> {
    return this.http.get<ApiResponse<RoleDetails>>(`${this.url}/${id}`);
  }

  createRole(payload: RoleNameRequest): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(this.url, payload);
  }

  updateRole(id: number, payload: RoleNameRequest): Observable<ApiResponse<null>> {
    return this.http.put<ApiResponse<null>>(`${this.url}/${id}`, payload);
  }

  updatePermissions(
    id: number,
    payload: UpdateRolePermissionsRequest,
  ): Observable<ApiResponse<null>> {
    return this.http.put<ApiResponse<null>>(`${this.url}/${id}/permissions`, payload);
  }

  /** DELETE with a JSON body — HttpClient needs it passed through `options.body`. */
  deleteRoles(payload: DeleteRolesRequest): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(this.url, { body: payload });
  }
}
