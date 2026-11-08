import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { environment } from "@env/environment";
import { ApiResponse } from "@shared/model/api_response.model";
import {
  CreateUserRequest,
  DeleteUsersRequest,
  UpdateUserRequest,
  UserDetails,
  UserListItem,
  UsersQuery,
} from "../model/user.model";
import { buildUsersParams } from "../utils/user-query";
import { IUserRepository } from "./user.repository";

@Injectable({ providedIn: "root" })
export class UserApiRepository implements IUserRepository {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/users`;

  getUsers(query: UsersQuery): Observable<ApiResponse<UserListItem[]>> {
    return this.http.get<ApiResponse<UserListItem[]>>(this.url, {
      params: buildUsersParams(query),
    });
  }

  getUser(id: number): Observable<ApiResponse<UserDetails>> {
    return this.http.get<ApiResponse<UserDetails>>(`${this.url}/${id}`);
  }

  createUser(payload: CreateUserRequest): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(this.url, payload);
  }

  updateUser(id: number, payload: UpdateUserRequest): Observable<ApiResponse<null>> {
    return this.http.put<ApiResponse<null>>(`${this.url}/${id}`, payload);
  }

  /** No request body: the backend flips active ↔ inactive. */
  toggleStatus(id: number): Observable<ApiResponse<null>> {
    return this.http.patch<ApiResponse<null>>(`${this.url}/${id}/toggle-status`, null);
  }

  /** DELETE with a JSON body — HttpClient needs it passed through `options.body`. */
  deleteUsers(payload: DeleteUsersRequest): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(this.url, { body: payload });
  }
}
