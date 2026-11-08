import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { environment } from "@env/environment";
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
import { buildServicesParams } from "../utils/service-query";
import { IServiceRepository } from "./service.repository";

/**
 * HTTP implementation of {@link IServiceRepository}.
 *
 * Thin pass-through over the `/services` endpoints — no mapping or side effects.
 * Query translation lives in {@link buildServicesParams} so it can be unit-tested
 * without `HttpClient`. Errors (400 / 403 / 404 / 409) are surfaced by the error
 * interceptor; this class does not catch them.
 */
@Injectable({ providedIn: "root" })
export class ServiceApiRepository implements IServiceRepository {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/services`;

  /** Price table of one branch; `meta.additionalData` holds the summary counts. */
  getServices(query: ServicesQuery): Observable<ApiResponse<ServiceListItem[]>> {
    return this.http.get<ApiResponse<ServiceListItem[]>>(this.url, {
      params: buildServicesParams(query),
    });
  }

  /** Service + price in every branch; a missing service answers `404`. */
  getServiceById(id: number): Observable<ApiResponse<ServiceDetails>> {
    return this.http.get<ApiResponse<ServiceDetails>>(`${this.url}/${id}`);
  }

  /** Create a service with a price row for every branch → its new id. */
  createService(payload: ServicePayload): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(this.url, payload);
  }

  /** Replace names and the price rows of every branch. */
  updateService(id: number, payload: ServicePayload): Observable<ApiResponse<null>> {
    return this.http.put<ApiResponse<null>>(`${this.url}/${id}`, payload);
  }

  /**
   * Permanently delete one or more services (all-or-nothing). `HttpClient.delete`
   * has no body argument, so the JSON goes through `options.body`.
   */
  deleteServices(payload: DeleteServicesRequest): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(this.url, { body: payload });
  }

  /** Set (not toggle) `isActive` of one service in the listed branches. */
  setStatusInBranches(id: number, payload: SetServiceStatusRequest): Observable<ApiResponse<null>> {
    return this.http.patch<ApiResponse<null>>(`${this.url}/${id}/branches/status`, payload);
  }

  /** Copy duration, prices, home availability and status from one branch onto another. */
  copyPrices(payload: CopyPricesRequest): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(`${this.url}/copy-prices`, payload);
  }

  /** Change Regular / VIP / Home prices of a branch by a percentage. */
  adjustPrices(payload: AdjustPricesRequest): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(`${this.url}/adjust-prices`, payload);
  }
}
