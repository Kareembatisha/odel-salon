import { Injectable, inject } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import { Observable, delay, of, throwError } from "rxjs";

import { MockBarber, MockDb } from "@core/mock/mock-db";
import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import {
  BARBER_NAME_MAX_LENGTH,
  BarberDetails,
  BarberListItem,
  BarbersQuery,
  CreateBarberPayload,
  DeleteBarbersRequest,
  UpdateBarberPayload,
} from "../model/barber.model";
import { validateBarberImage } from "../utils/barber-image.util";
import { isValidEgyptianMobile } from "../utils/barber-phone.util";
import { IBarberRepository } from "./barber.repository";

// ============================================================
// Constants
// ============================================================

/** Simulated network latency applied to every mock response (ms). */
const MOCK_DELAY_MS = 450;

// ============================================================
// Mock Repository
// ============================================================

/**
 * In-memory implementation of {@link IBarberRepository}.
 *
 * Reads from and writes to the shared {@link MockDb}, and keeps each branch's
 * `barbersCount` total in sync so the Branches screen stays consistent. It
 * enforces the same business rules as the backend: valid + unique phone, a valid
 * photo, and the "last active barber of a visible branch" lock (409) on
 * suspend / delete / transfer. Hidden branches are never restricted.
 */
@Injectable({ providedIn: "root" })
export class BarberMockRepository implements IBarberRepository {
  private readonly db = inject(MockDb);
  private readonly notify = inject(NotificationService);
  private readonly translate = inject(TranslateService);

  // ----------------------------------------------------------
  // Read Operations
  // ----------------------------------------------------------

  /** Filter by branch / status / name-or-phone, sorted by full name. `meta.additionalData` is null. */
  getBarbers(q: BarbersQuery): Observable<ApiResponse<BarberListItem[]>> {
    const term = (q.search ?? "").trim().toLowerCase();

    const all = this.db.barbers
      .filter(
        (b) =>
          (q.branchId === undefined || b.branchId === q.branchId) &&
          (q.isActive === undefined || b.isActive === q.isActive) &&
          (!term ||
            b.fullName.toLowerCase().includes(term) ||
            b.phone.toLowerCase().includes(term)),
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.id - b.id);

    const start = (q.pageNumber - 1) * q.pageSize;
    const totalPages = Math.max(1, Math.ceil(all.length / q.pageSize));

    return of<ApiResponse<BarberListItem[]>>({
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
      data: all.slice(start, start + q.pageSize).map((b) => this.toListItem(b)),
    }).pipe(delay(MOCK_DELAY_MS));
  }

  /** Responds with a `404` payload (`status: false`) when the id does not exist. */
  getBarberById(id: number): Observable<ApiResponse<BarberDetails>> {
    const barber = this.db.barbers.find((b) => b.id === id);

    if (!barber) {
      return of<ApiResponse<BarberDetails>>({
        status: false,
        statusCode: 404,
        message: "Barber not found",
        errors: null,
        meta: null,
        data: null,
      }).pipe(delay(MOCK_DELAY_MS));
    }

    return this.reply({ ...barber }, "Operation completed successfully");
  }

  // ----------------------------------------------------------
  // Write Operations
  // ----------------------------------------------------------

  /** Create an active barber. 400 for an unknown branch, a bad name / phone / photo or a taken phone. */
  createBarber(payload: CreateBarberPayload): Observable<ApiResponse<number>> {
    const branch = this.db.branches.find((b) => b.id === payload.branchId);
    if (!branch) return this.invalid("BranchId", "BARBERS.ERRORS.BRANCH_NOT_FOUND");

    const fullName = payload.fullName.trim();
    const phone = payload.phone.trim();
    const problem = this.fieldError(fullName, phone, payload.image);
    if (problem) return this.invalid(problem.field, problem.key);

    const id = this.db.nextBarberId++;

    this.db.barbers.push({
      id,
      branchId: branch.id,
      branchNameAr: branch.nameAr,
      branchNameEn: branch.nameEn,
      fullName,
      phone,
      imageUrl: payload.image ? this.photoUrl(payload.image) : null,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    });
    this.syncBranchCount(branch.id);

    return this.reply(id, "Barber Created Successfully", 201);
  }

  /**
   * Edit. A new `image` replaces the photo, `removeImage` (with no image) removes it,
   * neither keeps it. Moving an ACTIVE barber out of a visible branch's last active
   * slot is a 409.
   */
  updateBarber(id: number, payload: UpdateBarberPayload): Observable<ApiResponse<null>> {
    const barber = this.db.barbers.find((b) => b.id === id);
    if (!barber) return this.notFound();

    const target = this.db.branches.find((b) => b.id === payload.branchId);
    if (!target) return this.invalid("BranchId", "BARBERS.ERRORS.BRANCH_NOT_FOUND");

    const fullName = payload.fullName.trim();
    const phone = payload.phone.trim();
    const problem = this.fieldError(fullName, phone, payload.image, barber.id);
    if (problem) return this.invalid(problem.field, problem.key);

    const fromBranchId = barber.branchId;
    const moving = target.id !== fromBranchId;

    if (moving) {
      const blocker = this.lastActiveBlocker([barber]);
      if (blocker) return this.lastActive(blocker);
    }

    let imageUrl = barber.imageUrl;
    if (payload.image) imageUrl = this.photoUrl(payload.image);
    else if (payload.removeImage) imageUrl = null;

    Object.assign(barber, {
      branchId: target.id,
      branchNameAr: target.nameAr,
      branchNameEn: target.nameEn,
      fullName,
      phone,
      imageUrl,
      updatedAt: new Date().toISOString(),
    });

    if (moving) this.syncBranchCount(fromBranchId);
    this.syncBranchCount(target.id);

    return this.reply(null, "Barber Updated Successfully");
  }

  /** Flip `isActive`. Activating is always allowed; suspending is subject to the last-active lock. */
  toggleBarberStatus(id: number): Observable<ApiResponse<null>> {
    const barber = this.db.barbers.find((b) => b.id === id);
    if (!barber) return this.notFound();

    if (barber.isActive) {
      const blocker = this.lastActiveBlocker([barber]);
      if (blocker) return this.lastActive(blocker);
    }

    barber.isActive = !barber.isActive;
    barber.updatedAt = new Date().toISOString();

    return this.reply(null, "Barber Updated Successfully");
  }

  /**
   * Bulk delete, all-or-nothing: an empty list is a 400, an unknown id a 404, and the
   * last-active lock is checked against the WHOLE request — deleting every remaining
   * active barber of a visible branch at once is blocked too (the message names the
   * first blocking barber).
   */
  deleteBarbers(payload: DeleteBarbersRequest): Observable<ApiResponse<null>> {
    if (!payload.ids.length) return this.invalid("BarberIds", "BARBERS.ERRORS.IDS_REQUIRED");

    const barbers: MockBarber[] = [];
    for (const id of payload.ids) {
      const barber = this.db.barbers.find((b) => b.id === id);
      if (!barber) return this.notFound();
      barbers.push(barber);
    }

    const blocker = this.lastActiveBlocker(barbers);
    if (blocker) return this.lastActive(blocker);

    const affectedBranches = new Set(barbers.map((b) => b.branchId));
    this.db.barbers = this.db.barbers.filter((b) => !payload.ids.includes(b.id));
    affectedBranches.forEach((branchId) => this.syncBranchCount(branchId));

    return this.reply(null, "Barber Deleted Successfully");
  }

  // ----------------------------------------------------------
  // Business rules
  // ----------------------------------------------------------

  /**
   * First barber in `leaving` whose departure (suspended, deleted or moved away)
   * would leave a VISIBLE branch with no active barber. Hidden branches are never
   * restricted. Barbers that are already suspended are not "active", so they never block.
   */
  private lastActiveBlocker(leaving: MockBarber[]): MockBarber | null {
    for (const barber of leaving) {
      if (!barber.isActive) continue;

      const branch = this.db.branches.find((b) => b.id === barber.branchId);
      if (!branch?.isVisible) continue;

      const remaining = this.db.barbers.filter(
        (b) => b.branchId === barber.branchId && b.isActive && !leaving.includes(b),
      ).length;

      if (remaining === 0) return barber;
    }
    return null;
  }

  /** First problem with the editable fields (field label + i18n key), or `null` when they are valid. */
  private fieldError(
    fullName: string,
    phone: string,
    image: File | null | undefined,
    ignoreId?: number,
  ): { field: string; key: string } | null {
    if (!fullName) return { field: "FullName", key: "BARBERS.ERRORS.NAME_REQUIRED" };
    if (fullName.length > BARBER_NAME_MAX_LENGTH) {
      return { field: "FullName", key: "BARBERS.ERRORS.NAME_TOO_LONG" };
    }

    if (!phone) return { field: "Phone", key: "BARBERS.ERRORS.PHONE_REQUIRED" };
    if (!isValidEgyptianMobile(phone))
      return { field: "Phone", key: "BARBERS.ERRORS.PHONE_INVALID" };
    if (this.db.barbers.some((b) => b.id !== ignoreId && b.phone === phone)) {
      return { field: "Phone", key: "BARBERS.ERRORS.PHONE_TAKEN" };
    }

    if (image && validateBarberImage(image)) {
      return { field: "Image", key: "BARBERS.ERRORS.INVALID_IMAGE" };
    }
    return null;
  }

  /** Branch total (suspended barbers included), exactly like the real API. */
  private syncBranchCount(branchId: number): void {
    const branch = this.db.branches.find((b) => b.id === branchId);
    if (!branch) return;
    branch.barbersCount = this.db.barbers.filter((b) => b.branchId === branchId).length;
  }

  /** A browser URL for the chosen file (stands in for the uploaded-photo URL the server would return). */
  private photoUrl(file: File): string {
    return typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(file)
      : `blob:mock/${encodeURIComponent(file.name)}`;
  }

  private toListItem(b: MockBarber): BarberListItem {
    return {
      id: b.id,
      branchId: b.branchId,
      branchNameAr: b.branchNameAr,
      branchNameEn: b.branchNameEn,
      fullName: b.fullName,
      phone: b.phone,
      imageUrl: b.imageUrl,
      isActive: b.isActive,
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
    return this.fail(this.translate.instant("BARBERS.ERRORS.NOT_FOUND"), 404);
  }

  /** 409 — names the blocking barber, like the contract's message. */
  private lastActive(barber: MockBarber): Observable<never> {
    return this.fail(
      this.translate.instant("BARBERS.ERRORS.LAST_ACTIVE", { name: barber.fullName }),
      409,
    );
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
