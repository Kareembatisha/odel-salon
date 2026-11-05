import { Injectable, inject } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import { Observable, delay, of, throwError } from "rxjs";

import { MockService, MockDb } from "@core/mock/mock-db";
import { LanguageService } from "@core/services/language.service";
import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import {
  AdjustPricesRequest,
  CopyPricesRequest,
  DeleteServicesRequest,
  SERVICE_NAME_MAX_LENGTH,
  ServiceBranchPayload,
  ServiceBranchPricing,
  ServiceDetails,
  ServiceListItem,
  ServicePayload,
  ServicePricing,
  ServicesQuery,
  ServicesSummary,
  SetServiceStatusRequest,
} from "../model/service.model";
import { localizedName } from "../utils/service-labels.util";
import {
  applyPercentage,
  exceedsMaxPrice,
  isValidDuration,
  isValidPercentage,
  isValidPrice,
} from "../utils/service-price.util";
import { IServiceRepository } from "./service.repository";

// ============================================================
// Constants
// ============================================================

/** Simulated network latency applied to every mock response (ms). */
const MOCK_DELAY_MS = 450;

/** A validation problem: the field label key (`VALIDATION_FIELDS.*`) and the i18n message key. */
interface Problem {
  field: string;
  key: string;
}

// ============================================================
// Mock Repository
// ============================================================

/**
 * In-memory implementation of {@link IServiceRepository}.
 *
 * Reads from and writes to the shared {@link MockDb} and enforces the backend rules it can:
 * unique names, "every branch exactly once", price / duration limits, and the
 * "last active service of a VISIBLE branch" lock (409) on deactivate / delete / copy.
 *
 * NOT simulated: the 409s for services used by packages or running offers — those modules
 * don't exist in the mock yet, so nothing can reference a service.
 */
@Injectable({ providedIn: "root" })
export class ServiceMockRepository implements IServiceRepository {
  private readonly db = inject(MockDb);
  private readonly notify = inject(NotificationService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  // ----------------------------------------------------------
  // Read Operations
  // ----------------------------------------------------------

  /**
   * Price table of ONE branch, sorted by English name. `additionalData` counts the whole
   * branch and ignores search / isActive / isHomeAvailable. 404 when the branch is unknown.
   */
  getServices(q: ServicesQuery): Observable<ApiResponse<ServiceListItem[]>> {
    if (!this.db.branches.some((b) => b.id === q.branchId)) {
      return this.fail(this.translate.instant("SERVICES.ERRORS.BRANCH_NOT_FOUND"), 404);
    }

    const term = (q.search ?? "").trim().toLowerCase();
    const sorted = [...this.db.services].sort((a, b) => a.nameEn.localeCompare(b.nameEn));

    const all = sorted
      .map((s) => this.toListItem(s, q.branchId))
      .filter(
        (s) =>
          (q.isActive === undefined || s.pricing.isActive === q.isActive) &&
          (q.isHomeAvailable === undefined || s.pricing.isHomeAvailable === q.isHomeAvailable) &&
          (!term || s.nameEn.toLowerCase().includes(term) || s.nameAr.toLowerCase().includes(term)),
      );

    const start = (q.pageNumber - 1) * q.pageSize;
    const totalPages = Math.max(1, Math.ceil(all.length / q.pageSize));

    return of<ApiResponse<ServiceListItem[]>>({
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
        additionalData: { ...this.summary(q.branchId) },
      },
      data: all.slice(start, start + q.pageSize),
    }).pipe(delay(MOCK_DELAY_MS));
  }

  /** Lists EVERY branch (priced or not). Responds with a `404` payload when the id is unknown. */
  getServiceById(id: number): Observable<ApiResponse<ServiceDetails>> {
    const service = this.find(id);

    if (!service) {
      return of<ApiResponse<ServiceDetails>>({
        status: false,
        statusCode: 404,
        message: "Service not found",
        errors: null,
        meta: null,
        data: null,
      }).pipe(delay(MOCK_DELAY_MS));
    }

    const branches: ServiceBranchPricing[] = [...this.db.branches]
      .sort((a, b) => a.id - b.id)
      .map((branch) => {
        const price = service.prices.find((p) => p.branchId === branch.id);
        return {
          branchId: branch.id,
          branchNameAr: branch.nameAr,
          branchNameEn: branch.nameEn,
          branchAllowsRegular: branch.allowsRegular,
          branchAllowsVip: branch.allowsVip,
          branchAllowsHome: branch.allowsHome,
          isPriced: !!price,
          durationMinutes: price?.durationMinutes ?? null,
          regularPrice: price?.regularPrice ?? null,
          vipPrice: price?.vipPrice ?? null,
          isHomeAvailable: price?.isHomeAvailable ?? false,
          homePrice: price?.homePrice ?? null,
          isActive: price?.isActive ?? false,
        };
      });

    return this.reply(
      {
        id: service.id,
        nameAr: service.nameAr,
        nameEn: service.nameEn,
        createdAt: service.createdAt,
        updatedAt: service.updatedAt,
        branches,
      },
      "Operation completed successfully",
    );
  }

  // ----------------------------------------------------------
  // Write Operations
  // ----------------------------------------------------------

  /** Create a service priced in every branch. 400 on any validation problem. */
  createService(payload: ServicePayload): Observable<ApiResponse<number>> {
    const problem = this.validate(payload);
    if (problem) return this.invalid(problem);

    const id = this.db.nextServiceId++;
    this.db.services.push({
      id,
      nameAr: payload.nameAr.trim(),
      nameEn: payload.nameEn.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: null,
      prices: payload.branches.map((b) => this.normalize(b)),
    });

    return this.reply(id, "Service Created Successfully", 201);
  }

  /** Replace names and all price rows. 409 when it would deactivate the last active service of a visible branch. */
  updateService(id: number, payload: ServicePayload): Observable<ApiResponse<null>> {
    const service = this.find(id);
    if (!service) return this.notFound();

    const problem = this.validate(payload, id);
    if (problem) return this.invalid(problem);

    const deactivating = payload.branches
      .filter((b) => !b.isActive && service.prices.some((p) => p.branchId === b.branchId && p.isActive))
      .map((b) => b.branchId);
    const blocked = this.emptiedBranch(deactivating, (s, active) => (s.id === id ? false : active));
    if (blocked) return this.lastActive(service, blocked);

    Object.assign(service, {
      nameAr: payload.nameAr.trim(),
      nameEn: payload.nameEn.trim(),
      prices: payload.branches.map((b) => this.normalize(b)),
      updatedAt: new Date().toISOString(),
    });

    return this.reply(null, "Service Updated Successfully");
  }

  /**
   * Bulk delete, all-or-nothing: unknown id → 404; the last-active lock is checked against
   * the WHOLE request, so deleting every remaining active service of a visible branch is blocked.
   */
  deleteServices(payload: DeleteServicesRequest): Observable<ApiResponse<null>> {
    if (!payload.ids.length) {
      return this.invalid({ field: "ServiceIds", key: "SERVICES.ERRORS.IDS_REQUIRED" });
    }

    const services: MockService[] = [];
    for (const id of payload.ids) {
      const service = this.find(id);
      if (!service) return this.notFound();
      services.push(service);
    }

    for (const service of services) {
      const branchIds = service.prices.filter((p) => p.isActive).map((p) => p.branchId);
      const blocked = this.emptiedBranch(branchIds, (s, active) => (payload.ids.includes(s.id) ? false : active));
      if (blocked) return this.lastActive(service, blocked);
    }

    this.db.services = this.db.services.filter((s) => !payload.ids.includes(s.id));
    return this.reply(null, "Service Deleted Successfully");
  }

  /**
   * Set (not toggle) `isActive` of ONE service in several branches, all-or-nothing.
   * 400 when a branch id is missing / duplicated or the service has no price there.
   */
  setStatusInBranches(
    id: number,
    payload: SetServiceStatusRequest,
  ): Observable<ApiResponse<null>> {
    const service = this.find(id);
    if (!service) return this.notFound();

    if (!payload.branchIds.length) {
      return this.invalid({ field: "BranchIds", key: "SERVICES.ERRORS.BRANCH_IDS_REQUIRED" });
    }
    if (new Set(payload.branchIds).size !== payload.branchIds.length) {
      return this.invalid({ field: "BranchIds", key: "SERVICES.ERRORS.BRANCH_IDS_DUPLICATE" });
    }
    const rows = payload.branchIds.map((branchId) =>
      service.prices.find((p) => p.branchId === branchId),
    );
    if (rows.some((row) => !row)) {
      return this.invalid({ field: "BranchIds", key: "SERVICES.ERRORS.NOT_PRICED_IN_BRANCH" });
    }

    if (!payload.isActive) {
      // Branches already inactive are left unchanged, so they can't be "emptied" by this call.
      const turningOff = rows.filter((r) => r!.isActive).map((r) => r!.branchId);
      const blocked = this.emptiedBranch(turningOff, (s, active) => (s.id === id ? false : active));
      if (blocked) return this.lastActive(service, blocked);
    }

    const now = new Date().toISOString();
    rows.forEach((row) => (row!.isActive = payload.isActive));
    service.updatedAt = now;

    return this.reply(null, "Service Updated Successfully");
  }

  /**
   * Copy duration, prices, home availability and status of every service priced in the
   * source onto the target (overwriting; other target services stay as they are).
   */
  copyPrices(payload: CopyPricesRequest): Observable<ApiResponse<null>> {
    const { sourceBranchId: source, targetBranchId: target } = payload;

    if (source === target) {
      return this.invalid({ field: "TargetBranchId", key: "SERVICES.ERRORS.SAME_BRANCH" });
    }
    if (!this.db.branches.some((b) => b.id === source)) {
      return this.invalid({ field: "SourceBranchId", key: "SERVICES.ERRORS.BRANCH_NOT_FOUND" });
    }
    if (!this.db.branches.some((b) => b.id === target)) {
      return this.invalid({ field: "TargetBranchId", key: "SERVICES.ERRORS.BRANCH_NOT_FOUND" });
    }

    const copied = this.db.services.filter((s) => s.prices.some((p) => p.branchId === source));
    if (!copied.length) {
      return this.invalid({ field: "SourceBranchId", key: "SERVICES.ERRORS.SOURCE_EMPTY" });
    }

    // After the copy a visible target must still have an active service.
    const targetBranch = this.db.branches.find((b) => b.id === target)!;
    if (targetBranch.isVisible) {
      const stillActive = this.db.services.some((s) => {
        const from = s.prices.find((p) => p.branchId === source);
        const own = s.prices.find((p) => p.branchId === target);
        return (from ?? own)?.isActive;
      });
      if (!stillActive) {
        return this.fail(
          this.translate.instant("SERVICES.ERRORS.COPY_EMPTIES_BRANCH", { branch: this.branchName(target) }),
          409,
        );
      }
    }

    const now = new Date().toISOString();
    for (const service of copied) {
      const from = service.prices.find((p) => p.branchId === source)!;
      const copy: ServiceBranchPayload = { ...from, branchId: target };
      const index = service.prices.findIndex((p) => p.branchId === target);
      if (index >= 0) service.prices[index] = copy;
      else service.prices.push(copy);
      service.updatedAt = now;
    }

    return this.reply(null, "Service Updated Successfully");
  }

  /**
   * Change Regular / VIP / Home prices of a branch by a percentage (durations untouched).
   * Empty `serviceIds` = every service priced in the branch.
   */
  adjustPrices(payload: AdjustPricesRequest): Observable<ApiResponse<null>> {
    if (!isValidPercentage(payload.percentage)) {
      return this.invalid({ field: "Percentage", key: "SERVICES.ERRORS.PERCENTAGE_INVALID" });
    }
    if (!this.db.branches.some((b) => b.id === payload.branchId)) {
      return this.invalid({ field: "BranchId", key: "SERVICES.ERRORS.BRANCH_NOT_FOUND" });
    }

    const priced = this.db.services.filter((s) => s.prices.some((p) => p.branchId === payload.branchId));
    const targets = payload.serviceIds.length
      ? payload.serviceIds.map((id) => priced.find((s) => s.id === id))
      : priced;

    if (targets.some((s) => !s)) return this.notFound();
    if (!targets.length) {
      return this.invalid({ field: "BranchId", key: "SERVICES.ERRORS.BRANCH_EMPTY" });
    }

    const rows = (targets as MockService[]).map(
      (s) => s.prices.find((p) => p.branchId === payload.branchId)!,
    );
    const tooHigh = rows.some((r) =>
      [r.regularPrice, r.vipPrice, r.homePrice].some(
        (price) => price !== null && exceedsMaxPrice(price, payload.percentage),
      ),
    );
    if (tooHigh) {
      return this.invalid({ field: "Percentage", key: "SERVICES.ERRORS.PRICE_TOO_HIGH" });
    }

    const now = new Date().toISOString();
    (targets as MockService[]).forEach((service, i) => {
      const row = rows[i];
      row.regularPrice = applyPercentage(row.regularPrice, payload.percentage);
      row.vipPrice = applyPercentage(row.vipPrice, payload.percentage);
      if (row.homePrice !== null) row.homePrice = applyPercentage(row.homePrice, payload.percentage);
      service.updatedAt = now;
    });

    return this.reply(null, "Service Updated Successfully");
  }

  // ----------------------------------------------------------
  // Business rules
  // ----------------------------------------------------------

  /**
   * First visible branch (among `branchIds`) left with no active service when each service's
   * active flag is replaced by `resolve(service, currentlyActive)`. `null` when none is emptied.
   */
  private emptiedBranch(
    branchIds: number[],
    resolve: (service: MockService, active: boolean) => boolean,
  ): number | null {
    for (const branchId of branchIds) {
      const branch = this.db.branches.find((b) => b.id === branchId);
      if (!branch?.isVisible) continue;

      const stillActive = this.db.services.some((s) => {
        const row = s.prices.find((p) => p.branchId === branchId);
        return !!row && resolve(s, row.isActive);
      });
      if (!stillActive) return branchId;
    }
    return null;
  }

  /** First problem with a create / edit body (names → branch set → each branch row), or `null`. */
  private validate(payload: ServicePayload, ignoreId?: number): Problem | null {
    const names: Array<["NameAr" | "NameEn", string, "nameAr" | "nameEn"]> = [
      ["NameAr", payload.nameAr?.trim() ?? "", "nameAr"],
      ["NameEn", payload.nameEn?.trim() ?? "", "nameEn"],
    ];
    for (const [field, value, prop] of names) {
      if (!value) return { field, key: "SERVICES.ERRORS.NAME_REQUIRED" };
      if (value.length > SERVICE_NAME_MAX_LENGTH) return { field, key: "SERVICES.ERRORS.NAME_TOO_LONG" };
      const taken = this.db.services.some(
        (s) => s.id !== ignoreId && s[prop].toLowerCase() === value.toLowerCase(),
      );
      if (taken) return { field, key: "SERVICES.ERRORS.NAME_TAKEN" };
    }

    const ids = payload.branches.map((b) => b.branchId);
    const everyBranchOnce =
      ids.length === this.db.branches.length &&
      new Set(ids).size === ids.length &&
      this.db.branches.every((b) => ids.includes(b.id));
    if (!everyBranchOnce) return { field: "Branches", key: "SERVICES.ERRORS.BRANCHES_INVALID" };

    for (const row of payload.branches) {
      if (!isValidDuration(row.durationMinutes)) return { field: "DurationMinutes", key: "SERVICES.ERRORS.DURATION_INVALID" };
      if (!isValidPrice(row.regularPrice)) return { field: "RegularPrice", key: "SERVICES.ERRORS.PRICE_INVALID" };
      if (!isValidPrice(row.vipPrice)) return { field: "VipPrice", key: "SERVICES.ERRORS.PRICE_INVALID" };
      if (row.isHomeAvailable && !isValidPrice(row.homePrice)) {
        return { field: "HomePrice", key: "SERVICES.ERRORS.HOME_PRICE_REQUIRED" };
      }
    }
    return null;
  }

  /** Stored row: no home price when the service isn't available at home. */
  private normalize(row: ServiceBranchPayload): ServiceBranchPayload {
    return {
      branchId: row.branchId,
      durationMinutes: row.durationMinutes,
      regularPrice: row.regularPrice,
      vipPrice: row.vipPrice,
      isHomeAvailable: row.isHomeAvailable,
      homePrice: row.isHomeAvailable ? row.homePrice : null,
      isActive: row.isActive ?? true,
    };
  }

  private find(id: number): MockService | undefined {
    return this.db.services.find((s) => s.id === id);
  }

  private branchName(branchId: number): string {
    const branch = this.db.branches.find((b) => b.id === branchId);
    return branch ? localizedName(branch.nameAr, branch.nameEn, this.language.currentLang()) : "";
  }

  private toListItem(service: MockService, branchId: number): ServiceListItem {
    const row = service.prices.find((p) => p.branchId === branchId);
    const pricing: ServicePricing = row
      ? {
          isPriced: true,
          durationMinutes: row.durationMinutes,
          regularPrice: row.regularPrice,
          vipPrice: row.vipPrice,
          isHomeAvailable: row.isHomeAvailable,
          homePrice: row.homePrice,
          isActive: row.isActive,
        }
      : {
          isPriced: false,
          durationMinutes: null,
          regularPrice: null,
          vipPrice: null,
          isHomeAvailable: false,
          homePrice: null,
          isActive: false,
        };
    return { id: service.id, nameAr: service.nameAr, nameEn: service.nameEn, pricing };
  }

  private summary(branchId: number): ServicesSummary {
    const rows = this.db.services.map((s) => s.prices.find((p) => p.branchId === branchId));
    return {
      total: rows.length,
      active: rows.filter((r) => r?.isActive).length,
      homeAvailable: rows.filter((r) => r?.isActive && r.isHomeAvailable).length,
      unpriced: rows.filter((r) => !r).length,
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

  /** 404 — mutations toast it (the real interceptor would). */
  private notFound(): Observable<never> {
    return this.fail(this.translate.instant("SERVICES.ERRORS.NOT_FOUND"), 404);
  }

  /** 409 — names the service and the branch, like the contract's message. */
  private lastActive(service: MockService, branchId: number): Observable<never> {
    return this.fail(
      this.translate.instant("SERVICES.ERRORS.LAST_ACTIVE", {
        name: localizedName(service.nameAr, service.nameEn, this.language.currentLang()),
        branch: this.branchName(branchId),
      }),
      409,
    );
  }

  /** 400 — same shape as the interceptor's validation toast: field label + message. */
  private invalid(problem: Problem): Observable<never> {
    this.notify.warning(`VALIDATION_FIELDS.${problem.field}`, problem.key);
    return throwError(() =>
      Object.assign(new Error("Validation failed"), { status: 400 }),
    ).pipe(delay(MOCK_DELAY_MS)) as Observable<never>;
  }

  /** Mock repositories skip the HTTP interceptors, so show the toast the interceptor would. */
  private fail(message: string, statusCode: number): Observable<never> {
    this.notify.warning(message);
    return throwError(() =>
      Object.assign(new Error(message), { status: statusCode }),
    ).pipe(delay(MOCK_DELAY_MS)) as Observable<never>;
  }
}
