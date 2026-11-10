import { Injectable, inject } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import { Observable, delay, of, throwError } from "rxjs";

import { MockChair, MockDb } from "@core/mock/mock-db";
import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import {
  CHAIR_NAME_MAX_LENGTH,
  ChairDetails,
  ChairListItem,
  ChairType,
  ChairsQuery,
  ChairsSummary,
  CreateChairPayload,
  DeleteChairsRequest,
  UpdateChairPayload,
} from "../model/chair.model";
import { IChairRepository } from "./chair.repository";

// ============================================================
// Constants
// ============================================================

/** Simulated network latency applied to every mock response (ms). */
const MOCK_DELAY_MS = 450;

// ============================================================
// Mock Repository
// ============================================================

/**
 * In-memory implementation of {@link IChairRepository}.
 *
 * Reads from and writes to the shared {@link MockDb}, and keeps each branch's
 * `regularChairsCount` / `vipChairsCount` totals in sync so the Branches screen
 * stays consistent. It enforces the same business rules as the backend:
 * unique name per branch, and the "last active chair of an offered type in a
 * visible branch" lock (409) on deactivate / delete / change type.
 */
/** The API's ChairTypeEnum only has Regular (0) and Vip (1). */
const isChairType = (value: unknown): value is ChairType =>
  value === ChairType.Regular || value === ChairType.Vip;

@Injectable({ providedIn: "root" })
export class ChairMockRepository implements IChairRepository {
  private readonly db = inject(MockDb);
  private readonly notify = inject(NotificationService);
  private readonly translate = inject(TranslateService);

  // ----------------------------------------------------------
  // Read Operations
  // ----------------------------------------------------------

  /**
   * Filter by branch / type / status / name, sorted by branch, then type
   * (Regular first), then name. `additionalData` holds the summary counts of
   * the whole branch (or all branches) and ignores type / status / search.
   */
  getChairs(q: ChairsQuery): Observable<ApiResponse<ChairListItem[]>> {
    const term = (q.search ?? "").trim().toLowerCase();

    const all = this.db.chairs
      .filter(
        (c) =>
          (q.branchId === undefined || c.branchId === q.branchId) &&
          (q.type === undefined || c.type === q.type) &&
          (q.isActive === undefined || c.isActive === q.isActive) &&
          (!term || c.name.toLowerCase().includes(term)),
      )
      .sort(
        (a, b) =>
          a.branchNameEn.localeCompare(b.branchNameEn) ||
          a.type - b.type ||
          a.name.localeCompare(b.name, undefined, { numeric: true }),
      );

    const summary = this.summary(q.branchId);
    const start = (q.pageNumber - 1) * q.pageSize;
    const totalPages = Math.max(1, Math.ceil(all.length / q.pageSize));

    return of<ApiResponse<ChairListItem[]>>({
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
        additionalData: { ...summary },
      },
      data: all.slice(start, start + q.pageSize).map((c) => this.toListItem(c)),
    }).pipe(delay(MOCK_DELAY_MS));
  }

  /** Responds with a `404` payload (`status: false`) when the id does not exist. */
  getChairById(id: number): Observable<ApiResponse<ChairDetails>> {
    const chair = this.db.chairs.find((c) => c.id === id);

    if (!chair) {
      return of<ApiResponse<ChairDetails>>({
        status: false,
        statusCode: 404,
        message: "Chair not found",
        errors: null,
        meta: null,
        data: null,
      }).pipe(delay(MOCK_DELAY_MS));
    }

    return this.reply({ ...chair }, "Operation completed successfully");
  }

  // ----------------------------------------------------------
  // Write Operations
  // ----------------------------------------------------------

  /** Create an active chair. 400 when the branch is unknown or the name is invalid / taken. */
  createChair(payload: CreateChairPayload): Observable<ApiResponse<number>> {
    const branch = this.db.branches.find((b) => b.id === payload.branchId);
    if (!branch) {
      return this.invalid("BranchId", "CHAIRS.ERRORS.BRANCH_NOT_FOUND");
    }

    if (!isChairType(payload.type)) return this.invalid("Type", "CHAIRS.ERRORS.TYPE_INVALID");

    const name = payload.name.trim();
    const nameError = this.nameError(name, branch.id);
    if (nameError) return this.invalid("Name", nameError);

    const id = this.db.nextChairId++;

    this.db.chairs.push({
      id,
      branchId: branch.id,
      branchNameAr: branch.nameAr,
      branchNameEn: branch.nameEn,
      name,
      type: payload.type,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    });
    this.syncBranchCounts(branch.id);

    return this.reply(id, "Chair Created Successfully", 201);
  }

  /** Rename / change type. Changing the type of the last active chair of an offered type is a 409. */
  updateChair(id: number, payload: UpdateChairPayload): Observable<ApiResponse<null>> {
    const chair = this.db.chairs.find((c) => c.id === id);
    if (!chair) return this.notFound();

    if (!isChairType(payload.type)) return this.invalid("Type", "CHAIRS.ERRORS.TYPE_INVALID");

    const name = payload.name.trim();
    const nameError = this.nameError(name, chair.branchId, chair.id);
    if (nameError) return this.invalid("Name", nameError);

    if (payload.type !== chair.type) {
      const blocker = this.lastActiveBlocker([chair]);
      if (blocker) return this.lastActive(blocker);
    }

    Object.assign(chair, {
      name,
      type: payload.type,
      updatedAt: new Date().toISOString(),
    });
    this.syncBranchCounts(chair.branchId);

    return this.reply(null, "Chair Updated Successfully");
  }

  /** Flip `isActive`. Activating is always allowed; deactivating is subject to the last-active lock. */
  toggleChairStatus(id: number): Observable<ApiResponse<null>> {
    const chair = this.db.chairs.find((c) => c.id === id);
    if (!chair) return this.notFound();

    if (chair.isActive) {
      const blocker = this.lastActiveBlocker([chair]);
      if (blocker) return this.lastActive(blocker);
    }

    chair.isActive = !chair.isActive;
    chair.updatedAt = new Date().toISOString();

    return this.reply(null, "Chair Updated Successfully");
  }

  /**
   * Bulk delete, all-or-nothing: an empty list is a 400, an unknown id a 404,
   * and the last-active lock is checked against the WHOLE request — deleting
   * every remaining active chair of an offered type at once is blocked too.
   */
  deleteChairs(payload: DeleteChairsRequest): Observable<ApiResponse<null>> {
    if (!payload.ids.length) {
      return this.invalid("Ids", "CHAIRS.ERRORS.IDS_REQUIRED");
    }

    const chairs: MockChair[] = [];
    for (const id of payload.ids) {
      const chair = this.db.chairs.find((c) => c.id === id);
      if (!chair) return this.notFound();
      chairs.push(chair);
    }

    const blocker = this.lastActiveBlocker(chairs);
    if (blocker) return this.lastActive(blocker);

    const affectedBranches = new Set(chairs.map((c) => c.branchId));
    this.db.chairs = this.db.chairs.filter((c) => !payload.ids.includes(c.id));
    affectedBranches.forEach((branchId) => this.syncBranchCounts(branchId));

    return this.reply(null, "Chair Deleted Successfully");
  }

  // ----------------------------------------------------------
  // Business rules
  // ----------------------------------------------------------

  /**
   * First chair in `leaving` whose departure (deactivated, deleted or moved to
   * another type) would leave a VISIBLE branch that offers its type with no
   * active chair of that type. Hidden branches are never restricted.
   */
  private lastActiveBlocker(leaving: MockChair[]): MockChair | null {
    for (const chair of leaving) {
      if (!chair.isActive) continue;

      const branch = this.db.branches.find((b) => b.id === chair.branchId);
      if (!branch?.isVisible) continue;

      const offered = chair.type === ChairType.Vip ? branch.allowsVip : branch.allowsRegular;
      if (!offered) continue;

      const remaining = this.db.chairs.filter(
        (c) =>
          c.branchId === chair.branchId &&
          c.type === chair.type &&
          c.isActive &&
          !leaving.includes(c),
      ).length;

      if (remaining === 0) return chair;
    }
    return null;
  }

  /** i18n key of the first problem with `name`, or `null` when it is valid. */
  private nameError(name: string, branchId: number, ignoreId?: number): string | null {
    if (!name) return "CHAIRS.ERRORS.NAME_REQUIRED";
    if (name.length > CHAIR_NAME_MAX_LENGTH) return "CHAIRS.ERRORS.NAME_TOO_LONG";

    const taken = this.db.chairs.some(
      (c) =>
        c.branchId === branchId && c.id !== ignoreId && c.name.toLowerCase() === name.toLowerCase(),
    );
    return taken ? "CHAIRS.ERRORS.NAME_TAKEN" : null;
  }

  /** Branch totals are TOTALS (inactive chairs included), exactly like the real API. */
  private syncBranchCounts(branchId: number): void {
    const branch = this.db.branches.find((b) => b.id === branchId);
    if (!branch) return;

    const own = this.db.chairs.filter((c) => c.branchId === branchId);
    branch.regularChairsCount = own.filter((c) => c.type === ChairType.Regular).length;
    branch.vipChairsCount = own.filter((c) => c.type === ChairType.Vip).length;
  }

  private summary(branchId?: number): ChairsSummary {
    const scope = this.db.chairs.filter((c) => branchId === undefined || c.branchId === branchId);
    return {
      regularActive: scope.filter((c) => c.isActive && c.type === ChairType.Regular).length,
      vipActive: scope.filter((c) => c.isActive && c.type === ChairType.Vip).length,
      inactive: scope.filter((c) => !c.isActive).length,
    };
  }

  private toListItem(c: MockChair): ChairListItem {
    return {
      id: c.id,
      branchId: c.branchId,
      branchNameAr: c.branchNameAr,
      branchNameEn: c.branchNameEn,
      name: c.name,
      type: c.type,
      isActive: c.isActive,
    };
  }

  // ----------------------------------------------------------
  // Responses
  // ----------------------------------------------------------

  private reply<T>(data: T, message: string, statusCode = 200): Observable<ApiResponse<T>> {
    return of<ApiResponse<T>>({
      status: true,
      statusCode,
      message,
      errors: null,
      meta: null,
      data,
    }).pipe(delay(MOCK_DELAY_MS));
  }

  /** 404 — mutations toast it (the real interceptor would), reads use a `status: false` body instead. */
  private notFound(): Observable<never> {
    return this.fail(this.translate.instant("CHAIRS.ERRORS.NOT_FOUND"), 404);
  }

  /** 409 — names the blocking chair and the type, like the contract's message. */
  private lastActive(chair: MockChair): Observable<never> {
    const key =
      chair.type === ChairType.Vip
        ? "CHAIRS.ERRORS.LAST_ACTIVE_VIP"
        : "CHAIRS.ERRORS.LAST_ACTIVE_REGULAR";
    return this.fail(this.translate.instant(key, { name: chair.name }), 409);
  }

  /** 400 — same shape as the interceptor's validation toast: field label + message. */
  private invalid(field: string, messageKey: string): Observable<never> {
    this.notify.warning(`VALIDATION_FIELDS.${field}`, messageKey);
    return throwError(() => Object.assign(new Error("Validation failed"), { status: 400 })).pipe(
      delay(MOCK_DELAY_MS),
    ) as Observable<never>;
  }

  /** Mock repositories skip the HTTP interceptors, so show the toast the interceptor would. */
  private fail(message: string, statusCode: number): Observable<never> {
    this.notify.warning(message);
    return throwError(() => Object.assign(new Error(message), { status: statusCode })).pipe(
      delay(MOCK_DELAY_MS),
    ) as Observable<never>;
  }
}
