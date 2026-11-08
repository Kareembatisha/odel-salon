import { Observable } from "rxjs";

import { ApiResponse } from "@shared/model/api_response.model";
import {
  CreateUserRequest,
  DeleteUsersRequest,
  UpdateUserRequest,
  UserDetails,
  UserListItem,
  UsersQuery,
} from "../model/user.model";

/** Contract shared by the HTTP and mock repositories (pure data access). */
export interface IUserRepository {
  /** GET /users */
  getUsers(query: UsersQuery): Observable<ApiResponse<UserListItem[]>>;
  /** GET /users/{id} */
  getUser(id: number): Observable<ApiResponse<UserDetails>>;
  /** POST /users */
  createUser(payload: CreateUserRequest): Observable<ApiResponse<null>>;
  /** PUT /users/{id} */
  updateUser(id: number, payload: UpdateUserRequest): Observable<ApiResponse<null>>;
  /** PATCH /users/{id}/toggle-status */
  toggleStatus(id: number): Observable<ApiResponse<null>>;
  /** DELETE /users (body: { ids }) */
  deleteUsers(payload: DeleteUsersRequest): Observable<ApiResponse<null>>;
}
