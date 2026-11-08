import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { environment } from "@env/environment";
import { ApiResponse } from "@shared/model/api_response.model";
import {
  CreatePackagePayload,
  DeletePackagesRequest,
  PackageDetails,
  PackageListItem,
  PackagesQuery,
  UpdatePackagePayload,
} from "../model/package.model";
import { buildPackagesParams } from "../utils/package-query";
import { IPackageRepository } from "./package.repository";

/**
 * HTTP implementation of {@link IPackageRepository}.
 *
 * Thin pass-through over the `/packages` endpoints — no mapping or side effects.
 * Query translation lives in {@link buildPackagesParams} so it can be unit-tested
 * without `HttpClient`. Errors (400 / 403 / 404) are surfaced by the error
 * interceptor; this class does not catch them.
 */
@Injectable({ providedIn: "root" })
export class PackageApiRepository implements IPackageRepository {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/packages`;

  /** Packages of one branch; `meta.additionalData` holds the summary counts. */
  getPackages(query: PackagesQuery): Observable<ApiResponse<PackageListItem[]>> {
    return this.http.get<ApiResponse<PackageListItem[]>>(this.url, {
      params: buildPackagesParams(query),
    });
  }

  /** Single package (adds the branch name and `createdAt` / `updatedAt`); a missing one answers `404`. */
  getPackageById(id: number): Observable<ApiResponse<PackageDetails>> {
    return this.http.get<ApiResponse<PackageDetails>>(`${this.url}/${id}`);
  }

  /** Create a package (always active) and return its new id. */
  createPackage(payload: CreatePackagePayload): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(this.url, payload);
  }

  /** Same rules as create; `branchId` is not part of the body — a package can't move branches. */
  updatePackage(id: number, payload: UpdatePackagePayload): Observable<ApiResponse<null>> {
    return this.http.put<ApiResponse<null>>(`${this.url}/${id}`, payload);
  }

  /**
   * Flip `isActive` (no body). Re-activating answers `400` when a service is no longer
   * active in the branch (`serviceIds`) or the home price no longer fits (`homePrice`).
   */
  togglePackageStatus(id: number): Observable<ApiResponse<null>> {
    return this.http.patch<ApiResponse<null>>(`${this.url}/${id}/toggle-status`, null);
  }

  /**
   * Permanently delete one or more packages (all-or-nothing). `HttpClient.delete`
   * has no body argument, so the JSON goes through `options.body`.
   */
  deletePackages(payload: DeletePackagesRequest): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(this.url, { body: payload });
  }
}
