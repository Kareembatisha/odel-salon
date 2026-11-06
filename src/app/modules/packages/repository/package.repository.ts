import { InjectionToken } from "@angular/core";
import { Observable } from "rxjs";

import { ApiResponse } from "@shared/model/api_response.model";
import {
  CreatePackagePayload,
  DeletePackagesRequest,
  PackageDetails,
  PackageListItem,
  PackagesQuery,
  UpdatePackagePayload,
} from "../model/package.model";

export const PACKAGE_REPOSITORY = new InjectionToken<IPackageRepository>(
  "PACKAGE_REPOSITORY",
);

/** Contract shared by the HTTP and mock repositories (pure data access). */
export interface IPackageRepository {
  /**
   * GET /packages — the packages of ONE branch (`branchId` required);
   * `meta.additionalData` carries the summary cards (total / active).
   */
  getPackages(query: PackagesQuery): Observable<ApiResponse<PackageListItem[]>>;

  /** GET /packages/{id} */
  getPackageById(id: number): Observable<ApiResponse<PackageDetails>>;

  /** POST /packages → data = the new package id. */
  createPackage(payload: CreatePackagePayload): Observable<ApiResponse<number>>;

  /** PUT /packages/{id} — same rules as create, the branch can't change. */
  updatePackage(
    id: number,
    payload: UpdatePackagePayload,
  ): Observable<ApiResponse<null>>;

  /** PATCH /packages/{id}/toggle-status — flips `isActive` (no body). */
  togglePackageStatus(id: number): Observable<ApiResponse<null>>;

  /** DELETE /packages — bulk, all-or-nothing, body `{ ids }`. */
  deletePackages(payload: DeletePackagesRequest): Observable<ApiResponse<null>>;
}
