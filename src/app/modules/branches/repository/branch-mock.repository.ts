import { Injectable, inject } from "@angular/core";
import { Observable, delay, of } from "rxjs";

import { MockDb } from "@core/mock/mock-db";
import { ApiResponse } from "@shared/model/api_response.model";
import {
  BranchDetails,
  BranchListItem,
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
  updateBranch(
    id: number,
    payload: BranchPayload,
  ): Observable<ApiResponse<null>> {
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
}
