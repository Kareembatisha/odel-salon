import { Injectable, inject } from "@angular/core";
import { Observable, delay, of, throwError } from "rxjs";

import { PERMISSION_MODULES } from "@core/auth/permissions";
import { MockDb } from "@core/mock/mock-db";
import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import {
  DeleteRolesRequest,
  PermissionModule,
  RoleDetails,
  RoleListItem,
  RoleNameRequest,
  RolesQuery,
  UpdateRolePermissionsRequest,
} from "../model/role.model";
import { IRoleRepository } from "./role.repository";

const MOCK_DELAY_MS = 450;

@Injectable({ providedIn: "root" })
export class RoleMockRepository implements IRoleRepository {
  private readonly db = inject(MockDb);
  private readonly notify = inject(NotificationService);

  getRoles(q: RolesQuery): Observable<ApiResponse<RoleListItem[]>> {
    const term = (q.search ?? "").toLowerCase();
    const all = this.db.roles.filter((r) => r.name.toLowerCase().includes(term));
    const start = (q.pageNumber - 1) * q.pageSize;
    const items = all.slice(start, start + q.pageSize).map<RoleListItem>((r) => ({
      id: r.id,
      name: r.name,
      countUsers: this.db.users.filter((u) => u.roleId === r.id).length,
      permissions: q.includePermissions ? [...r.permissions] : [],
    }));
    const totalPages = Math.max(1, Math.ceil(all.length / q.pageSize));
    return this.reply(items, {
      currentPage: q.pageNumber,
      pageSize: q.pageSize,
      totalPages,
      totalCount: all.length,
      hasPreviousPage: q.pageNumber > 1,
      hasNextPage: q.pageNumber < totalPages,
      additionalData: null,
    });
  }

  getRole(id: number): Observable<ApiResponse<RoleDetails>> {
    const role = this.db.roles.find((r) => r.id === id);
    if (!role) return this.fail("Role not found");
    // Matrix = the app's permission catalog, with this role's grants switched on.
    const modules: PermissionModule[] = PERMISSION_MODULES.map((m) => ({
      module: m.module,
      permissions: m.actions.map((a) => ({
        name: a,
        value: `${m.module}.${a}`,
        isEnabled: role.permissions.includes(`${m.module}.${a}`),
      })),
    }));
    return this.reply({
      id: role.id,
      name: role.name,
      countUsers: this.db.users.filter((u) => u.roleId === id).length,
      modules,
    });
  }

  createRole(payload: RoleNameRequest): Observable<ApiResponse<null>> {
    if (this.nameTaken(payload.name)) return this.fail("A role with this name already exists");
    this.db.roles.push({ id: this.db.nextRoleId++, name: payload.name.trim(), permissions: [] });
    return this.reply(null, null, "Role created successfully", 201);
  }

  updateRole(id: number, payload: RoleNameRequest): Observable<ApiResponse<null>> {
    const role = this.db.roles.find((r) => r.id === id);
    if (!role) return this.fail("Role not found");
    if (this.nameTaken(payload.name, id)) return this.fail("A role with this name already exists");
    role.name = payload.name.trim();
    return this.reply(null, null, "Role updated successfully");
  }

  updatePermissions(
    id: number,
    payload: UpdateRolePermissionsRequest,
  ): Observable<ApiResponse<null>> {
    const role = this.db.roles.find((r) => r.id === id);
    if (!role) return this.fail("Role not found");
    role.permissions = [...payload.permissions];
    return this.reply(null, null, "Role permissions updated successfully");
  }

  deleteRoles(payload: DeleteRolesRequest): Observable<ApiResponse<null>> {
    const inUse = this.db.roles.find(
      (r) => payload.ids.includes(r.id) && this.db.users.some((u) => u.roleId === r.id),
    );
    if (inUse) return this.fail(`Role "${inUse.name}" still has users assigned`);
    this.db.roles = this.db.roles.filter((r) => !payload.ids.includes(r.id));
    return this.reply(null, null, "Roles deleted successfully");
  }

  private nameTaken(name: string, exceptId?: number): boolean {
    return this.db.roles.some(
      (r) => r.id !== exceptId && r.name.toLowerCase() === name.trim().toLowerCase(),
    );
  }

  private reply<T>(
    data: T,
    meta: ApiResponse<T>["meta"] = null,
    message = "Operation completed successfully",
    statusCode = 200,
  ) {
    return of<ApiResponse<T>>({ status: true, statusCode, message, errors: null, meta, data }).pipe(
      delay(MOCK_DELAY_MS),
    );
  }

  /** Mock repositories skip the HTTP interceptors, so show the error toast the interceptor would. */
  private fail(message: string): Observable<never> {
    this.notify.error(message);
    return throwError(() => new Error(message)).pipe(delay(MOCK_DELAY_MS)) as Observable<never>;
  }
}
