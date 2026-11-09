import { InjectionToken } from "@angular/core";
import { Observable } from "rxjs";

import { ApiResponse } from "@shared/model/api_response.model";
import {
  CreateUserPayload,
  DeleteUsersRequest,
  UpdateUserPayload,
  UserDetails,
  UserListItem,
  UsersQuery,
} from "../model/user.model";

/** Contract shared by the HTTP and mock repositories (pure data access). */
export interface IUserRepository {
  /** GET /users */
  getUsers(query: UsersQuery): Observable<ApiResponse<UserListItem[]>>;
  /** GET /users/{id} */
  getUserById(id: number): Observable<ApiResponse<UserDetails>>;
  /** POST /users */
  createUser(payload: CreateUserPayload): Observable<ApiResponse<null>>;
  /** PUT /users/{id} */
  updateUser(id: number, payload: UpdateUserPayload): Observable<ApiResponse<null>>;
  /** PATCH /users/{id}/toggle-status */
  toggleUserStatus(id: number): Observable<ApiResponse<null>>;
  /** DELETE /users (body: { ids }) */
  deleteUsers(payload: DeleteUsersRequest): Observable<ApiResponse<null>>;
}

/** DI token: `app.providers*.ts` decides whether the API or the mock implementation backs it. */
export const USER_REPOSITORY = new InjectionToken<IUserRepository>("USER_REPOSITORY");
