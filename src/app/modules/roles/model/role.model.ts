/**
 * role.model.ts — data contracts for the Roles feature.
 * Mirrors API Contract — Roles (GET/POST/PUT/DELETE /roles, PUT /roles/{id}/permissions).
 */

/** GET /roles → data[] (`permissions` is [] unless IncludePermissions=true). */
export interface RoleListItem {
  id: number;
  name: string;
  countUsers: number;
  permissions: string[];
}

export interface PermissionItem {
  /** Action label, e.g. "View". */
  name: string;
  /** Wire value, e.g. "User.View" — what Update Role Permissions expects. */
  value: string;
  isEnabled: boolean;
}

/** Permissions grouped by module (e.g. "User", "Role"). */
export interface PermissionModule {
  module: string;
  permissions: PermissionItem[];
}

/** GET /roles/{id} → data */
export interface RoleDetails {
  id: number;
  name: string;
  countUsers: number;
  permissions: PermissionModule[];
}

/** GET /roles query. All optional; the backend defaults to page 1, size 10. */
export interface RolesQuery {
  search?: string;
  includePermissions?: boolean;
  pageNumber: number;
  pageSize: number;
}

/** POST /roles and PUT /roles/{id} */
export interface RoleNameRequest {
  name: string;
}

/** PUT /roles/{id}/permissions — the FULL list the role should have (replaces the old one). */
export interface UpdateRolePermissionsRequest {
  permissions: string[];
}

/** DELETE /roles (ids go in the request body) */
export interface DeleteRolesRequest {
  ids: number[];
}
