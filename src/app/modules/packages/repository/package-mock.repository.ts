import { Injectable, inject } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import { Observable, delay, of, throwError } from "rxjs";

import { MockDb, MockPackage } from "@core/mock/mock-db";
import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import { ServiceBranchPayload } from "@modules/services/model/service.model";
import {
  CreatePackagePayload,
  DeletePackagesRequest,
  PACKAGE_MIN_SERVICES,
  PACKAGE_NAME_MAX_LENGTH,
  PACKAGE_PRICE_MAX,
  PackageDetails,
  PackageListItem,
  PackagesQuery,
  PackagesSummary,
  UpdatePackagePayload,
} from "../model/package.model";
import { IPackageRepository } from "./package.repository";

// ============================================================
// Constants
// ============================================================

/** Simulated network latency applied to every mock response (ms). */
const MOCK_DELAY_MS = 450;

/** A rule that failed: the API field (shown in the toast) and the i18n key of the message. */
interface Problem {
  field: string;
  key: string;
}

// ============================================================
// Mock Repository
// ============================================================

/**
 * In-memory implementation of {@link IPackageRepository}.
 *
 * Reads from and writes to the shared {@link MockDb}. Only the package itself is stored;
 * its services' names, the "before discount" totals and the duration are derived from the
 * services' CURRENT prices on every read, exactly like the real API ("the current total of
 * the services' prices in this branch"). It enforces the same rules as the backend:
 * unique names per branch, at least 2 distinct ACTIVE services of that branch, prices
 * lower than the services' total, and a home price only when every service allows home visits.
 */
@Injectable({ providedIn: "root" })
export class PackageMockRepository implements IPackageRepository {
  private readonly db = inject(MockDb);
  private readonly notify = inject(NotificationService);
  private readonly translate = inject(TranslateService);

  // ----------------------------------------------------------
  // Read Operations
  // ----------------------------------------------------------

  /**
   * Packages of one branch filtered by name (Arabic or English) / status, sorted by English
   * name. `additionalData` counts the whole branch and ignores search / status.
   * 404 when the branch doesn't exist.
   */
  getPackages(q: PackagesQuery): Observable<ApiResponse<PackageListItem[]>> {
    if (!this.db.branches.some((b) => b.id === q.branchId)) {
      return this.fail(
        this.translate.instant("PACKAGES.ERRORS.BRANCH_NOT_FOUND"),
        404,
      );
    }

    const term = (q.search ?? "").trim().toLowerCase();
    const own = this.db.packages.filter((p) => p.branchId === q.branchId);

    const all = own
      .filter(
        (p) =>
          (q.isActive === undefined || p.isActive === q.isActive) &&
          (!term ||
            p.nameAr.toLowerCase().includes(term) ||
            p.nameEn.toLowerCase().includes(term)),
      )
      .sort((a, b) => a.nameEn.localeCompare(b.nameEn));

    const summary: PackagesSummary = {
      total: own.length,
      active: own.filter((p) => p.isActive).length,
    };
    const start = (q.pageNumber - 1) * q.pageSize;
    const totalPages = Math.max(1, Math.ceil(all.length / q.pageSize));

    return of<ApiResponse<PackageListItem[]>>({
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
      data: all
        .slice(start, start + q.pageSize)
        .map((p) => this.toListItem(p)),
    }).pipe(delay(MOCK_DELAY_MS));
  }

  /** Responds with a `404` payload (`status: false`) when the id does not exist. */
  getPackageById(id: number): Observable<ApiResponse<PackageDetails>> {
    const pkg = this.db.packages.find((p) => p.id === id);

    if (!pkg) {
      return of<ApiResponse<PackageDetails>>({
        status: false,
        statusCode: 404,
        message: "Package not found",
        errors: null,
        meta: null,
        data: null,
      }).pipe(delay(MOCK_DELAY_MS));
    }

    const branch = this.db.branches.find((b) => b.id === pkg.branchId);

    return this.reply(
      {
        ...this.toListItem(pkg),
        branchNameAr: branch?.nameAr ?? "",
        branchNameEn: branch?.nameEn ?? "",
        createdAt: pkg.createdAt,
        updatedAt: pkg.updatedAt,
      },
      "Operation completed successfully",
    );
  }

  // ----------------------------------------------------------
  // Write Operations
  // ----------------------------------------------------------

  /** Create an active package. 400 when the branch is unknown or any rule fails. */
  createPackage(payload: CreatePackagePayload): Observable<ApiResponse<number>> {
    if (!this.db.branches.some((b) => b.id === payload.branchId)) {
      return this.invalid({
        field: "BranchId",
        key: "PACKAGES.ERRORS.BRANCH_NOT_FOUND",
      });
    }

    const problem = this.validate(payload.branchId, payload);
    if (problem) return this.invalid(problem);

    const id = this.db.nextPackageId++;

    this.db.packages.push({
      id,
      branchId: payload.branchId,
      nameAr: payload.nameAr.trim(),
      nameEn: payload.nameEn.trim(),
      serviceIds: [...new Set(payload.serviceIds)],
      regularPrice: payload.regularPrice,
      vipPrice: payload.vipPrice,
      homePrice: payload.homePrice,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    });

    return this.reply(id, "Package Created Successfully", 201);
  }

  /** Same rules as create, without `branchId`. The active status is not touched here. */
  updatePackage(
    id: number,
    payload: UpdatePackagePayload,
  ): Observable<ApiResponse<null>> {
    const pkg = this.db.packages.find((p) => p.id === id);
    if (!pkg) return this.notFound();

    const problem = this.validate(pkg.branchId, payload, pkg.id);
    if (problem) return this.invalid(problem);

    Object.assign(pkg, {
      nameAr: payload.nameAr.trim(),
      nameEn: payload.nameEn.trim(),
      serviceIds: [...new Set(payload.serviceIds)],
      regularPrice: payload.regularPrice,
      vipPrice: payload.vipPrice,
      homePrice: payload.homePrice,
      updatedAt: new Date().toISOString(),
    });

    return this.reply(null, "Package Updated Successfully");
  }

  /**
   * Flip `isActive`. Deactivating is always allowed; re-activating is a 400 when a service
   * is no longer active in the branch, or the package has a home price but a service is no
   * longer home-available.
   */
  togglePackageStatus(id: number): Observable<ApiResponse<null>> {
    const pkg = this.db.packages.find((p) => p.id === id);
    if (!pkg) return this.notFound();

    if (!pkg.isActive) {
      const rows = this.rowsOf(pkg.serviceIds, pkg.branchId);

      if (rows.some((row) => !row?.isActive)) {
        return this.invalid({
          field: "ServiceIds",
          key: "PACKAGES.ERRORS.SERVICE_INACTIVE",
        });
      }
      if (pkg.homePrice !== null && !this.allHome(rows)) {
        return this.invalid({
          field: "HomePrice",
          key: "PACKAGES.ERRORS.HOME_UNAVAILABLE",
        });
      }
    }

    pkg.isActive = !pkg.isActive;
    pkg.updatedAt = new Date().toISOString();

    return this.reply(null, "Package Updated Successfully");
  }

  /** Bulk delete, all-or-nothing: an empty list is a 400 and an unknown id a 404 (nothing is deleted). */
  deletePackages(payload: DeletePackagesRequest): Observable<ApiResponse<null>> {
    if (!payload.ids.length) {
      return this.invalid({
        field: "PackageIds",
        key: "PACKAGES.ERRORS.IDS_REQUIRED",
      });
    }

    if (payload.ids.some((id) => !this.db.packages.some((p) => p.id === id))) {
      return this.notFound();
    }

    this.db.packages = this.db.packages.filter(
      (p) => !payload.ids.includes(p.id),
    );

    return this.reply(null, "Package Deleted Successfully");
  }

  // ----------------------------------------------------------
  // Business rules
  // ----------------------------------------------------------

  /** First rule `payload` breaks, in form order (names → services → prices), or `null`. */
  private validate(
    branchId: number,
    payload: UpdatePackagePayload,
    ignoreId?: number,
  ): Problem | null {
    const names: Array<[field: string, value: string, own: keyof MockPackage]> =
      [
        ["NameAr", payload.nameAr, "nameAr"],
        ["NameEn", payload.nameEn, "nameEn"],
      ];

    for (const [field, raw, own] of names) {
      const problem = this.nameProblem(raw.trim(), own, branchId, ignoreId);
      if (problem) return { field, key: problem };
    }

    const serviceIds = [...new Set(payload.serviceIds)];
    if (serviceIds.length < PACKAGE_MIN_SERVICES) {
      return { field: "ServiceIds", key: "PACKAGES.ERRORS.SERVICES_MIN" };
    }

    const rows = this.rowsOf(serviceIds, branchId);
    if (rows.some((row) => !row?.isActive)) {
      return { field: "ServiceIds", key: "PACKAGES.ERRORS.SERVICE_INACTIVE" };
    }
    const priced = rows as ServiceBranchPayload[];

    const regular = this.priceProblem(
      payload.regularPrice,
      this.sum(priced, (p) => p.regularPrice),
    );
    if (regular) return { field: "RegularPrice", key: regular };

    const vip = this.priceProblem(
      payload.vipPrice,
      this.sum(priced, (p) => p.vipPrice),
    );
    if (vip) return { field: "VipPrice", key: vip };

    if (payload.homePrice !== null) {
      if (!this.allHome(priced)) {
        return { field: "HomePrice", key: "PACKAGES.ERRORS.HOME_UNAVAILABLE" };
      }
      const home = this.priceProblem(
        payload.homePrice,
        this.sum(priced, (p) => p.homePrice ?? 0),
      );
      if (home) return { field: "HomePrice", key: home };
    }

    return null;
  }

  /** i18n key of the first problem with a name, or `null` when it is valid (unique per branch, case-insensitive). */
  private nameProblem(
    name: string,
    own: keyof MockPackage,
    branchId: number,
    ignoreId?: number,
  ): string | null {
    if (!name) return "PACKAGES.ERRORS.NAME_REQUIRED";
    if (name.length > PACKAGE_NAME_MAX_LENGTH) {
      return "PACKAGES.ERRORS.NAME_TOO_LONG";
    }

    const taken = this.db.packages.some(
      (p) =>
        p.branchId === branchId &&
        p.id !== ignoreId &&
        String(p[own]).toLowerCase() === name.toLowerCase(),
    );
    return taken ? "PACKAGES.ERRORS.NAME_TAKEN" : null;
  }

  /** > 0, ≤ 100,000, at most 2 decimals, and LOWER than the services' total. */
  private priceProblem(price: number, total: number): string | null {
    const cents = price * 100;
    const valid =
      Number.isFinite(price) &&
      price > 0 &&
      price <= PACKAGE_PRICE_MAX &&
      Math.abs(cents - Math.round(cents)) < 1e-6;

    if (!valid) return "PACKAGES.ERRORS.PRICE_INVALID";
    return price >= total ? "PACKAGES.ERRORS.PRICE_TOO_HIGH" : null;
  }

  /** The services' price rows in `branchId` (`undefined` = not priced there). */
  private rowsOf(
    serviceIds: number[],
    branchId: number,
  ): Array<ServiceBranchPayload | undefined> {
    return serviceIds.map((serviceId) =>
      this.db.services
        .find((s) => s.id === serviceId)
        ?.prices.find((p) => p.branchId === branchId),
    );
  }

  private allHome(rows: Array<ServiceBranchPayload | undefined>): boolean {
    return rows.every((row) => row?.isHomeAvailable);
  }

  private sum(
    rows: ServiceBranchPayload[],
    pick: (row: ServiceBranchPayload) => number,
  ): number {
    return rows.reduce((total, row) => total + pick(row), 0);
  }

  // ----------------------------------------------------------
  // Mapping
  // ----------------------------------------------------------

  /** Derives names, "before discount" totals and duration from the services' current prices. */
  private toListItem(p: MockPackage): PackageListItem {
    const rows = this.rowsOf(p.serviceIds, p.branchId);
    const priced = rows.filter(
      (row): row is ServiceBranchPayload => row !== undefined,
    );

    return {
      id: p.id,
      branchId: p.branchId,
      nameAr: p.nameAr,
      nameEn: p.nameEn,
      regularPrice: p.regularPrice,
      vipPrice: p.vipPrice,
      homePrice: p.homePrice,
      isActive: p.isActive,
      services: p.serviceIds.map((serviceId) => {
        const service = this.db.services.find((s) => s.id === serviceId);
        return {
          serviceId,
          nameAr: service?.nameAr ?? "",
          nameEn: service?.nameEn ?? "",
        };
      }),
      originalRegularPrice: this.sum(priced, (r) => r.regularPrice),
      originalVipPrice: this.sum(priced, (r) => r.vipPrice),
      originalHomePrice: this.allHome(rows)
        ? this.sum(priced, (r) => r.homePrice ?? 0)
        : null,
      durationMinutes: this.sum(priced, (r) => r.durationMinutes),
    };
  }

  // ----------------------------------------------------------
  // Responses
  // ----------------------------------------------------------

  private reply<T>(
    data: T,
    message: string,
    statusCode = 200,
  ): Observable<ApiResponse<T>> {
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
    return this.fail(this.translate.instant("PACKAGES.ERRORS.NOT_FOUND"), 404);
  }

  /** 400 — same shape as the interceptor's validation toast: field label + message. */
  private invalid({ field, key }: Problem): Observable<never> {
    this.notify.warning(`VALIDATION_FIELDS.${field}`, key);
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
