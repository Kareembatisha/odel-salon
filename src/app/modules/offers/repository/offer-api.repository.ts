import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { environment } from "@env/environment";
import { ApiResponse } from "@shared/model/api_response.model";
import {
  CreateOfferPayload,
  DeleteOffersRequest,
  OfferDetails,
  OfferListItem,
  OffersQuery,
  UpdateOfferPayload,
} from "../model/offer.model";
import { buildCreateOfferFormData, buildUpdateOfferFormData } from "../utils/offer-form-data";
import { buildOffersParams } from "../utils/offer-query";
import { IOfferRepository } from "./offer.repository";

/**
 * HTTP implementation of {@link IOfferRepository}.
 *
 * Thin pass-through over the `/offers` endpoints — no mapping or side effects. Query
 * translation and the multipart bodies live in `utils/` so they can be unit-tested without
 * `HttpClient`. Errors (400 / 403 / 404) are surfaced by the error interceptor; this class does
 * not catch them.
 *
 * Create and edit send `multipart/form-data` (because of the banner). The Content-Type header
 * is deliberately NOT set: the browser adds it together with the multipart boundary.
 */
@Injectable({ providedIn: "root" })
export class OfferApiRepository implements IOfferRepository {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/offers`;

  /** Offers of one branch, newest start date first; `meta.additionalData` holds the tab counts. */
  getOffers(query: OffersQuery): Observable<ApiResponse<OfferListItem[]>> {
    return this.http.get<ApiResponse<OfferListItem[]>>(this.url, {
      params: buildOffersParams(query),
    });
  }

  /** Single offer (adds the branch name, duration and `createdAt` / `updatedAt`); a missing one answers `404`. */
  getOfferById(id: number): Observable<ApiResponse<OfferDetails>> {
    return this.http.get<ApiResponse<OfferDetails>>(`${this.url}/${id}`);
  }

  /** Create an offer and return its new id. */
  createOffer(payload: CreateOfferPayload): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(this.url, buildCreateOfferFormData(payload));
  }

  /** Same rules as create; `branchId` is not part of the body. Replaces or removes the banner. */
  updateOffer(id: number, payload: UpdateOfferPayload): Observable<ApiResponse<null>> {
    return this.http.put<ApiResponse<null>>(`${this.url}/${id}`, buildUpdateOfferFormData(payload));
  }

  /**
   * Stop a running offer / resume a stopped one (no body). Resuming answers `400` when a
   * service is no longer active in the branch (`serviceIds`) or the home price is no longer
   * allowed (`homePrice`).
   */
  toggleOfferStatus(id: number): Observable<ApiResponse<null>> {
    return this.http.patch<ApiResponse<null>>(`${this.url}/${id}/toggle-status`, null);
  }

  /**
   * Permanently delete one or more offers (all-or-nothing; banners are deleted too).
   * `HttpClient.delete` has no body argument, so the JSON goes through `options.body`.
   */
  deleteOffers(payload: DeleteOffersRequest): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(this.url, { body: payload });
  }
}
