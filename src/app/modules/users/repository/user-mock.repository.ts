import { Injectable, inject } from "@angular/core";
import { Observable, delay, of, throwError } from "rxjs";

import { MockDb, MockUser } from "@core/mock/mock-db";
import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import {
  CreateUserRequest,
  DeleteUsersRequest,
  UpdateUserRequest,
  UserDetails,
  UserListItem,
  UsersQuery,
} from "../model/user.model";
import { IUserRepository } from "./user.repository";

const MOCK_DELAY_MS = 450;

@Injectable({ providedIn: "root" })
export class UserMockRepository implements IUserRepository {
  private readonly db = inject(MockDb);
  private readonly notify = inject(NotificationService);

  getUsers(q: UsersQuery): Observable<ApiResponse<UserListItem[]>> {
    const term = (q.search ?? "").toLowerCase();
    const all = this.db.users.filter(
      (u) =>
        (q.roleId === undefined || u.roleId === q.roleId) &&
        (q.status === undefined || u.status === q.status) &&
        (!term || u.fullName.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)),
    );
    const start = (q.pageNumber - 1) * q.pageSize;
    const totalPages = Math.max(1, Math.ceil(all.length / q.pageSize));
    return this.reply(
      all.slice(start, start + q.pageSize).map((u) => this.toListItem(u)),
      {
        currentPage: q.pageNumber,
        pageSize: q.pageSize,
        totalPages,
        totalCount: all.length,
        hasPreviousPage: q.pageNumber > 1,
        hasNextPage: q.pageNumber < totalPages,
        additionalData: null,
      },
    );
  }

  getUser(id: number): Observable<ApiResponse<UserDetails>> {
    const u = this.db.users.find((x) => x.id === id);
    if (!u) return this.fail("User not found");
    return this.reply<UserDetails>({
      id: u.id,
      imageUrl: u.imageUrl,
      fullName: u.fullName,
      role: this.db.roleName(u.roleId),
      email: u.email,
      countryCode: u.countryCode,
      phoneNumber: u.phoneNumber,
    });
  }

  createUser(p: CreateUserRequest): Observable<ApiResponse<null>> {
    if (this.emailTaken(p.email)) return this.fail("A user with this email already exists");
    if (!this.db.roles.some((r) => r.id === p.roleId)) return this.fail("Role not found");
    this.db.users.unshift({
      id: this.db.nextUserId++,
      fullName: p.fullName.trim(),
      email: p.email.trim(),
      countryCode: p.countryCode,
      phoneNumber: p.phoneNumber.trim(),
      roleId: p.roleId,
      status: true,
      imageUrl: null,
    });
    return this.reply(null, null, "User created successfully", 201);
  }

  updateUser(id: number, p: UpdateUserRequest): Observable<ApiResponse<null>> {
    const u = this.db.users.find((x) => x.id === id);
    if (!u) return this.fail("User not found");
    if (this.emailTaken(p.email, id)) return this.fail("A user with this email already exists");
    Object.assign(u, {
      fullName: p.fullName.trim(),
      email: p.email.trim(),
      countryCode: p.countryCode,
      phoneNumber: p.phoneNumber.trim(),
      roleId: p.roleId,
    });
    return this.reply(null, null, "User updated successfully");
  }

  toggleStatus(id: number): Observable<ApiResponse<null>> {
    const u = this.db.users.find((x) => x.id === id);
    if (!u) return this.fail("User not found");
    u.status = !u.status;
    return this.reply(null, null, "User status updated successfully");
  }

  deleteUsers(p: DeleteUsersRequest): Observable<ApiResponse<null>> {
    this.db.users = this.db.users.filter((u) => !p.ids.includes(u.id));
    return this.reply(null, null, "Users deleted successfully");
  }

  private toListItem(u: MockUser): UserListItem {
    return {
      id: u.id,
      imageUrl: u.imageUrl,
      fullName: u.fullName,
      email: u.email,
      role: this.db.roleName(u.roleId),
      status: u.status,
    };
  }

  private emailTaken(email: string, exceptId?: number): boolean {
    return this.db.users.some(
      (u) => u.id !== exceptId && u.email.toLowerCase() === email.trim().toLowerCase(),
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
