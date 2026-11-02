/**
 * user.model.ts — data contracts for the Users feature.
 * Mirrors API Contract — Users (GET/POST/PUT/DELETE /users, PATCH /users/{id}/toggle-status).
 */

/** GET /users → data[] */
export interface UserListItem {
  id: number;
  imageUrl: string | null;
  fullName: string;
  email: string;
  /** Role NAME (not id). */
  role: string;
  /** true = active. */
  status: boolean;
}

/**
 * GET /users/{id} → data.
 * Note: the role comes back as a NAME only; the edit form maps it to a role id
 * through the roles list (see UserFormComponent).
 */
export interface UserDetails {
  id: number;
  imageUrl: string | null;
  fullName: string;
  role: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
}

/** GET /users query. All optional; the backend defaults to page 1, size 10. */
export interface UsersQuery {
  roleId?: number;
  /** true = active only, false = inactive only, undefined = all. */
  status?: boolean;
  search?: string;
  pageNumber: number;
  pageSize: number;
}

/** POST /users — all fields required. */
export interface CreateUserRequest {
  fullName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  password: string;
  passwordConfirmation: string;
  roleId: number;
}

/** PUT /users/{id} — the password pair is sent only to change the password. */
export interface UpdateUserRequest {
  fullName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  roleId: number;
  newPassword?: string;
  newPasswordConfirmation?: string;
}

/** DELETE /users (ids go in the request body) */
export interface DeleteUsersRequest {
  ids: number[];
}
