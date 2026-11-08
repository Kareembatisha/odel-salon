import { InjectionToken } from "@angular/core";
import { Observable } from "rxjs";

import { ApiResponse } from "@shared/model/api_response.model";
import {
  AdjustPricesRequest,
  CopyPricesRequest,
  DeleteServicesRequest,
  ServiceDetails,
  ServiceListItem,
  ServicePayload,
  ServicesQuery,
  SetServiceStatusRequest,
} from "../model/service.model";

export const SERVICE_REPOSITORY = new InjectionToken<IServiceRepository>("SERVICE_REPOSITORY");

/** Contract shared by the HTTP and mock repositories (pure data access). */
export interface IServiceRepository {
  /**
   * GET /services — the price table of ONE branch (`branchId` required).
   * `meta.additionalData` carries the summary cards (total / active / homeAvailable / unpriced).
   */
  getServices(query: ServicesQuery): Observable<ApiResponse<ServiceListItem[]>>;

  /** GET /services/{id} — the service with its price in EVERY branch. */
  getServiceById(id: number): Observable<ApiResponse<ServiceDetails>>;

  /** POST /services → data = the new service id. */
  createService(payload: ServicePayload): Observable<ApiResponse<number>>;

  /** PUT /services/{id} — same body and rules as create. */
  updateService(id: number, payload: ServicePayload): Observable<ApiResponse<null>>;

  /** DELETE /services — bulk, all-or-nothing, body `{ ids }`. */
  deleteServices(payload: DeleteServicesRequest): Observable<ApiResponse<null>>;

  /** PATCH /services/{id}/branches/status — activate / deactivate ONE service in several branches. */
  setStatusInBranches(id: number, payload: SetServiceStatusRequest): Observable<ApiResponse<null>>;

  /** POST /services/copy-prices — copy every price of one branch onto another. */
  copyPrices(payload: CopyPricesRequest): Observable<ApiResponse<null>>;

  /** POST /services/adjust-prices — raise / lower the prices of a branch by a percentage. */
  adjustPrices(payload: AdjustPricesRequest): Observable<ApiResponse<null>>;
}
