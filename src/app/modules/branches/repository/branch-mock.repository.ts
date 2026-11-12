import { Injectable, inject } from "@angular/core";
import { Observable, delay, of, throwError } from "rxjs";

import { MockDb } from "@core/mock/mock-db";
import { NotificationService } from "@core/services/notification.service";
import { LanguageService } from "@core/services/language.service";
import { TranslateService } from "@ngx-translate/core";
import { ApiResponse } from "@shared/model/api_response.model";
import {
  BranchDetails,
  BranchListItem,
  DeleteBranchesRequest,
  BranchPayload,
  BranchesQuery,
} from "../model/branch.model";
import { IBranchRepository } from "./branch.repository";

// ============================================================
// Constants
// ============================================================

/** Simulated network latency applied to every mock response (ms). */
const MOCK_DELAY_MS = 450;

// ============================================================
// Mock Repository
// ============================================================

/**
 * In-memory implementation of {@link IBranchRepository}.
 *
 * Reads from and writes to the shared {@link MockDb} singleton, so
 * mutations made here are immediately visible to any other mock
 * repository that reads the same collection.
 */
@Injectable({ providedIn: "root" })
export class BranchMockRepository implements IBranchRepository {
  private readonly db = inject(MockDb);
  private readonly notify = inject(NotificationService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  // ----------------------------------------------------------
  // Read Operations
  // ----------------------------------------------------------

  /**
   * List branches with optional visibility filter, free-text search and
   * pagination.
   *
   * Same rules as the backend:
   * - `search` matches `nameAr` / `nameEn` / `address` / `phone`
   *   (case-insensitive, trimmed).
   * - Results are ordered newest first (descending `id`).
   * - `isVisible` is only applied when explicitly provided.
   */
  getBranches(q: BranchesQuery): Observable<ApiResponse<BranchListItem[]>> {
    const term = (q.search ?? "").trim().toLowerCase();
    const all = this.db.branches
      .filter(
        (b) =>
          (q.isVisible === undefined || b.isVisible === q.isVisible) &&
          (!term ||
            b.nameAr.toLowerCase().includes(term) ||
            b.nameEn.toLowerCase().includes(term) ||
            b.address.toLowerCase().includes(term) ||
            b.phone.includes(term)),
      )
      .sort((a, b) => b.id - a.id);

    const start = (q.pageNumber - 1) * q.pageSize;
    const totalPages = Math.max(1, Math.ceil(all.length / q.pageSize));
    return of<ApiResponse<BranchListItem[]>>({
      status: true,
      statusCode: 200,
      message: "Operation completed successfully",
      errors: null,
      meta: {
        currentPage: q.pageNumber,
        pageSize: q.pageSize,
        totalPages,
        totalCount: all.length,
        hasPreviousPage: q.pageNumber > 1,
        hasNextPage: q.pageNumber < totalPages,
        additionalData: null,
      },
      data: all.slice(start, start + q.pageSize).map((b) => ({ ...b })),
    }).pipe(delay(MOCK_DELAY_MS));
  }

  /**
   * Fetch a single branch with its working hours.
   *
   * Responds with a `404` payload (`status: false`) when the id does
   * not exist, mirroring the real API rather than throwing.
   */
  getBranchById(id: number): Observable<ApiResponse<BranchDetails>> {
    const branch = this.db.branches.find((b) => b.id === id);

    if (!branch) {
      return of<ApiResponse<BranchDetails>>({
        status: false,
        statusCode: 404,
        message: "Branch not found",
        errors: null,
        meta: null,
        data: null,
      }).pipe(delay(MOCK_DELAY_MS));
    }

    const data: BranchDetails = {
      id: branch.id,
      nameAr: branch.nameAr,
      nameEn: branch.nameEn,
      address: branch.address,
      mapUrl: branch.mapUrl,
      instaPayAccount: branch.instaPayAccount,
      walletNumber: branch.walletNumber,
      phone: branch.phone,
      allowsRegular: branch.allowsRegular,
      allowsVip: branch.allowsVip,
      allowsHome: branch.allowsHome,
      isVisible: branch.isVisible,
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt,
      workingHours: branch.workingHours.map((hour) => ({ ...hour })),
    };

    return of<ApiResponse<BranchDetails>>({
      status: true,
      statusCode: 200,
      message: "Operation completed successfully",
      errors: null,
      meta: null,
      data,
    }).pipe(delay(MOCK_DELAY_MS));
  }

  // ----------------------------------------------------------
  // Write Operations
  // ----------------------------------------------------------

  /**
   * Create a branch and return its newly allocated id.
   *
   * New branches start hidden (`isVisible: false`) and with all
   * staff/chair counters at zero; those are managed by their own
   * modules, not by the branch form.
   */
  createBranch(payload: BranchPayload): Observable<ApiResponse<number>> {
    const id = this.db.nextBranchId++;

    this.db.branches.push({
      id,
      nameAr: payload.nameAr,
      nameEn: payload.nameEn,
      address: payload.address,
      phone: payload.phone,
      allowsRegular: payload.allowsRegular,
      allowsVip: payload.allowsVip,
      allowsHome: payload.allowsHome,

      // New branches are hidden by default.
      isVisible: false,

      barbersCount: 0,
      regularChairsCount: 0,
      vipChairsCount: 0,

      mapUrl: payload.mapUrl,
      instaPayAccount: payload.instaPayAccount,
      walletNumber: payload.walletNumber,
      workingHours: payload.workingHours.map((hour) => ({ ...hour })),

      createdAt: new Date().toISOString(),
      updatedAt: null,
    });

    return of<ApiResponse<number>>({
      status: true,
      statusCode: 200,
      message: "Operation completed successfully",
      errors: null,
      meta: null,
      data: id,
    }).pipe(delay(MOCK_DELAY_MS));
  }

  /**
   * Update an existing branch in place.
   *
   * Note: `isVisible` is intentionally **not** part of `BranchPayload`
   * — visibility is toggled through its own endpoint, so this method
   * leaves it untouched. Responds with a `404` payload when the id
   * does not exist.
   */
  updateBranch(id: number, payload: BranchPayload): Observable<ApiResponse<null>> {
    const branch = this.db.branches.find((b) => b.id === id);

    if (!branch) {
      return of<ApiResponse<null>>({
        status: false,
        statusCode: 404,
        message: "Branch not found",
        errors: null,
        meta: null,
        data: null,
      }).pipe(delay(MOCK_DELAY_MS));
    }

    Object.assign(branch, {
      nameAr: payload.nameAr,
      nameEn: payload.nameEn,
      address: payload.address,
      mapUrl: payload.mapUrl,
      instaPayAccount: payload.instaPayAccount,
      walletNumber: payload.walletNumber,
      phone: payload.phone,
      allowsRegular: payload.allowsRegular,
      allowsVip: payload.allowsVip,
      allowsHome: payload.allowsHome,
      workingHours: payload.workingHours.map((hour) => ({ ...hour })),
      updatedAt: new Date().toISOString(),
    });

    return of<ApiResponse<null>>({
      status: true,
      statusCode: 200,
      message: "Operation completed successfully",
      errors: null,
      meta: null,
      data: null,
    }).pipe(delay(MOCK_DELAY_MS));
  }

  /**
   * Flip `isVisible`. Hiding is always allowed; showing needs an active
   * barber and a chair for every enabled chair type (the mock only has
   * totals, so it uses those). Failures mirror the real `400`/`404`.
   */
  toggleBranchStatus(id: number): Observable<ApiResponse<null>> {
    const branch = this.db.branches.find((b) => b.id === id);

    if (!branch) return this.fail(this.translate.instant("BRANCHES.ERRORS.NOT_FOUND"), 404);

    if (!branch.isVisible) {
      const errors: Record<string, string> = {};

      if (branch.allowsRegular && branch.regularChairsCount === 0) {
        errors["AllowsRegular"] = "BRANCHES.ERRORS.SHOW_NEEDS_CHAIR";
      }
      if (branch.allowsVip && branch.vipChairsCount === 0) {
        errors["AllowsVip"] = "BRANCHES.ERRORS.SHOW_NEEDS_CHAIR";
      }
      // `barbersCount` is a total (suspended included), so also look for an ACTIVE barber.
      const hasActiveBarber = this.db.barbers.some((b) => b.branchId === branch.id && b.isActive);
      if (branch.barbersCount === 0 || !hasActiveBarber) {
        errors["Barbers"] = "BRANCHES.ERRORS.SHOW_NEEDS_BARBER";
      }

      if (Object.keys(errors).length) {
        // Same shape as the interceptor's validation toast: field label + message.
        Object.entries(errors).forEach(([field, messageKey]) =>
          this.notify.warning(`VALIDATION_FIELDS.${field}`, messageKey),
        );
        return throwError(() => new Error("Validation failed")).pipe(
          delay(MOCK_DELAY_MS),
        ) as Observable<never>;
      }
    }

    branch.isVisible = !branch.isVisible;
    branch.updatedAt = new Date().toISOString();

    return this.reply(null, "Branch Updated Successfully");
  }

  /**
   * Bulk delete, all-or-nothing: any unknown id (404) or any branch that
   * still has chairs or barbers (409) aborts the whole request.
   */
  deleteBranches(payload: DeleteBranchesRequest): Observable<ApiResponse<null>> {
    if (!payload.ids.length) {
      return this.fail(this.translate.instant("BRANCHES.ERRORS.IDS_REQUIRED"), 400);
    }

    for (const id of payload.ids) {
      const branch = this.db.branches.find((b) => b.id === id);
      if (!branch) return this.fail(this.translate.instant("BRANCHES.ERRORS.NOT_FOUND"), 404);

      const chairs = branch.regularChairsCount + branch.vipChairsCount;
      if (chairs > 0 || branch.barbersCount > 0) {
        const name = this.language.currentLang() === "ar" ? branch.nameAr : branch.nameEn;
        const message =
          chairs > 0
            ? this.translate.instant("BRANCHES.ERRORS.DELETE_BLOCKED_CHAIRS", {
                name,
                count: chairs,
              })
            : this.translate.instant("BRANCHES.ERRORS.DELETE_BLOCKED_BARBERS", {
                name,
                count: branch.barbersCount,
              });

        return this.fail(message, 409);
      }
    }

    this.db.branches = this.db.branches.filter((b) => !payload.ids.includes(b.id));

    return this.reply(null, "Branch Deleted Successfully");
  }

  private reply<T>(data: T, message: string): Observable<ApiResponse<T>> {
    return of<ApiResponse<T>>({
      status: true,
      statusCode: 200,
      message,
      errors: null,
      meta: null,
      data,
    }).pipe(delay(MOCK_DELAY_MS));
  }

  /** Mock repositories skip the HTTP interceptors, so show the toast the interceptor would. */
  private fail(message: string, statusCode: number): Observable<never> {
    this.notify.warning(message);
    return throwError(() => Object.assign(new Error(message), { status: statusCode })).pipe(
      delay(MOCK_DELAY_MS),
    ) as Observable<never>;
  }
}
