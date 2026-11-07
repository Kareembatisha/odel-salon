import { InjectionToken } from "@angular/core";
import { Observable } from "rxjs";

import { ApiResponse } from "@shared/model/api_response.model";
import {
  CreateOfferPayload,
  DeleteOffersRequest,
  OfferDetails,
  OfferListItem,
  OffersQuery,
  UpdateOfferPayload,
} from "../model/offer.model";

export const OFFER_REPOSITORY = new InjectionToken<IOfferRepository>("OFFER_REPOSITORY");

/** Contract shared by the HTTP and mock repositories (pure data access). */
export interface IOfferRepository {
  /**
   * GET /offers — the offers of ONE branch (`branchId` required), newest start date first;
   * `meta.additionalData` carries the tab counts (all / active / scheduled / endedOrFull).
   */
  getOffers(query: OffersQuery): Observable<ApiResponse<OfferListItem[]>>;

  /** GET /offers/{id} */
  getOfferById(id: number): Observable<ApiResponse<OfferDetails>>;

  /** POST /offers (multipart) → data = the new offer id. */
  createOffer(payload: CreateOfferPayload): Observable<ApiResponse<number>>;

  /** PUT /offers/{id} (multipart) — same rules as create, the branch can't change. */
  updateOffer(id: number, payload: UpdateOfferPayload): Observable<ApiResponse<null>>;

  /** PATCH /offers/{id}/toggle-status — stops a running offer, resumes a stopped one (no body). */
  toggleOfferStatus(id: number): Observable<ApiResponse<null>>;

  /** DELETE /offers — bulk, all-or-nothing, body `{ ids }`. */
  deleteOffers(payload: DeleteOffersRequest): Observable<ApiResponse<null>>;
}
