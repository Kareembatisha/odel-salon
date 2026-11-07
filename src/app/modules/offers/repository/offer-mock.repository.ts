import { Injectable, inject } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import { Observable, delay, of, throwError } from "rxjs";

import { MockDb, MockOffer } from "@core/mock/mock-db";
import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import { createPreviewUrl } from "@shared/utils/image-preview.util";
import { ServiceBranchPayload } from "@modules/services/model/service.model";
import { savingPercent } from "@modules/services/utils/service-option.util";
import {
  CreateOfferPayload,
  DeleteOffersRequest,
  OFFER_MAX_BOOKINGS_MAX,
  OFFER_MIN_SERVICES,
  OFFER_NAME_MAX_LENGTH,
  OFFER_PRICE_MAX,
  OfferDetails,
  OfferListItem,
  OfferStatus,
  OffersQuery,
  OffersSummary,
  UpdateOfferPayload,
} from "../model/offer.model";
import { cairoToday, isValidDate } from "../utils/offer-dates.util";
import { validateOfferImage } from "../utils/offer-image.util";
import { deriveOfferStatus } from "../utils/offer-status.util";
import { IOfferRepository } from "./offer.repository";

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

type PriceRow = ServiceBranchPayload | undefined;

/** The fields create and edit share (everything but the branch and the banner flags). */
type OfferFields = Omit<CreateOfferPayload, "branchId">;

// ============================================================
// Mock Repository
// ============================================================

/**
 * In-memory implementation of {@link IOfferRepository}.
 *
 * Reads from and writes to the shared {@link MockDb}. Only the offer itself is stored; its
 * services' names, the "was" prices, the duration, `savingPercent` and the calculated `status`
 * are derived from the services' CURRENT prices and today's Cairo date on every read, exactly
 * like the real API. It enforces the same rules as the backend: at least 1 distinct ACTIVE
 * service of that branch, prices lower than the services' total, a home price only when every
 * service allows home visits, a start date of today or later (create only), an end date on or
 * after the start, 1 – 100,000 bookings and a JPG / PNG / WebP banner up to 5 MB. Names may repeat.
 */
@Injectable({ providedIn: "root" })
export class OfferMockRepository implements IOfferRepository {
  private readonly db = inject(MockDb);
  private readonly notify = inject(NotificationService);
  private readonly translate = inject(TranslateService);

  // ----------------------------------------------------------
  // Read Operations
  // ----------------------------------------------------------

  /**
   * Offers of one branch filtered by name (Arabic or English) / statuses, newest start date
   * first. `additionalData` counts the whole branch and ignores search / statuses.
   * 404 when the branch doesn't exist.
   */
  getOffers(q: OffersQuery): Observable<ApiResponse<OfferListItem[]>> {
    if (!this.db.branches.some((b) => b.id === q.branchId)) {
      return this.fail(this.translate.instant("OFFERS.ERRORS.BRANCH_NOT_FOUND"), 404);
    }

    const today = cairoToday();
    const term = (q.search ?? "").trim().toLowerCase();
    const own = this.db.offers
      .filter((o) => o.branchId === q.branchId)
      .map((o) => this.toListItem(o, today));

    const all = own
      .filter(
        (o) =>
          (!q.statuses?.length || q.statuses.includes(o.status)) &&
          (!term || o.nameAr.toLowerCase().includes(term) || o.nameEn.toLowerCase().includes(term)),
      )
      .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id - a.id);

    const count = (...statuses: OfferStatus[]) => own.filter((o) => statuses.includes(o.status)).length;
    const summary: OffersSummary = {
      all: own.length,
      active: count(OfferStatus.Active),
      scheduled: count(OfferStatus.Scheduled),
      endedOrFull: count(OfferStatus.Ended, OfferStatus.LimitReached, OfferStatus.Stopped),
    };

    const start = (q.pageNumber - 1) * q.pageSize;
    const totalPages = Math.max(1, Math.ceil(all.length / q.pageSize));

    return of<ApiResponse<OfferListItem[]>>({
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
      data: all.slice(start, start + q.pageSize),
    }).pipe(delay(MOCK_DELAY_MS));
  }

  /** Responds with a `404` payload (`status: false`) when the id does not exist. */
  getOfferById(id: number): Observable<ApiResponse<OfferDetails>> {
    const offer = this.db.offers.find((o) => o.id === id);

    if (!offer) {
      return of<ApiResponse<OfferDetails>>({
        status: false,
        statusCode: 404,
        message: "Offer not found",
        errors: null,
        meta: null,
        data: null,
      }).pipe(delay(MOCK_DELAY_MS));
    }

    const branch = this.db.branches.find((b) => b.id === offer.branchId);
    const durationMinutes = this.priced(this.rowsOf(offer.serviceIds, offer.branchId)).reduce(
      (sum, row) => sum + row.durationMinutes,
      0,
    );

    return this.reply(
      {
        ...this.toListItem(offer, cairoToday()),
        branchNameAr: branch?.nameAr ?? "",
        branchNameEn: branch?.nameEn ?? "",
        durationMinutes,
        createdAt: offer.createdAt,
        updatedAt: offer.updatedAt,
      },
      "Operation completed successfully",
    );
  }

  // ----------------------------------------------------------
  // Write Operations
  // ----------------------------------------------------------

  /** Create an offer (Scheduled when it starts later). 400 when the branch is unknown or any rule fails. */
  createOffer(payload: CreateOfferPayload): Observable<ApiResponse<number>> {
    if (!this.db.branches.some((b) => b.id === payload.branchId)) {
      return this.invalid({ field: "BranchId", key: "OFFERS.ERRORS.BRANCH_NOT_FOUND" });
    }

    const problem = this.validate(payload.branchId, payload, true);
    if (problem) return this.invalid(problem);

    const id = this.db.nextOfferId++;

    this.db.offers.push({
      id,
      branchId: payload.branchId,
      nameAr: payload.nameAr.trim(),
      nameEn: payload.nameEn.trim(),
      imageUrl: payload.image ? this.bannerUrl(payload.image) : null,
      serviceIds: [...payload.serviceIds],
      regularPrice: payload.regularPrice,
      vipPrice: payload.vipPrice,
      homePrice: payload.homePrice,
      startDate: payload.startDate,
      endDate: payload.endDate,
      maxBookings: payload.maxBookings,
      stoppedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    });

    return this.reply(id, "Offer Created Successfully", 201);
  }

  /**
   * Same rules as create, without `branchId` — and the start date may be in the past (so a
   * running offer can be edited). A new `image` replaces the banner, `removeImage` (with no
   * image) removes it, neither keeps it. Stop / resume is not part of it.
   */
  updateOffer(id: number, payload: UpdateOfferPayload): Observable<ApiResponse<null>> {
    const offer = this.db.offers.find((o) => o.id === id);
    if (!offer) return this.notFound();

    const problem = this.validate(offer.branchId, payload, false);
    if (problem) return this.invalid(problem);

    let imageUrl = offer.imageUrl;
    if (payload.image) imageUrl = this.bannerUrl(payload.image);
    else if (payload.removeImage) imageUrl = null;

    Object.assign(offer, {
      nameAr: payload.nameAr.trim(),
      nameEn: payload.nameEn.trim(),
      imageUrl,
      serviceIds: [...payload.serviceIds],
      regularPrice: payload.regularPrice,
      vipPrice: payload.vipPrice,
      homePrice: payload.homePrice,
      startDate: payload.startDate,
      endDate: payload.endDate,
      maxBookings: payload.maxBookings,
      updatedAt: new Date().toISOString(),
    });

    return this.reply(null, "Offer Updated Successfully");
  }

  /**
   * Stop a running offer (hides it from the app at once: status Stopped, `stoppedAt` set) or
   * resume a stopped one. Stopping is always allowed; resuming is a 400 when a service is no
   * longer active in the branch, or the offer has a home price but a service is no longer
   * home-available.
   */
  toggleOfferStatus(id: number): Observable<ApiResponse<null>> {
    const offer = this.db.offers.find((o) => o.id === id);
    if (!offer) return this.notFound();

    if (offer.stoppedAt !== null) {
      const rows = this.rowsOf(offer.serviceIds, offer.branchId);

      if (rows.some((row) => !row?.isActive)) {
        return this.invalid({ field: "ServiceIds", key: "OFFERS.ERRORS.SERVICE_INACTIVE" });
      }
      if (offer.homePrice !== null && !this.allHome(rows)) {
        return this.invalid({ field: "HomePrice", key: "OFFERS.ERRORS.HOME_UNAVAILABLE" });
      }
    }

    offer.stoppedAt = offer.stoppedAt === null ? new Date().toISOString() : null;
    offer.updatedAt = new Date().toISOString();

    return this.reply(null, "Offer Updated Successfully");
  }

  /** Bulk delete, all-or-nothing: an empty list is a 400 and an unknown id a 404 (nothing is deleted). */
  deleteOffers(payload: DeleteOffersRequest): Observable<ApiResponse<null>> {
    if (!payload.ids.length) {
      return this.invalid({ field: "OfferIds", key: "OFFERS.ERRORS.IDS_REQUIRED" });
    }

    if (payload.ids.some((id) => !this.db.offers.some((o) => o.id === id))) {
      return this.notFound();
    }

    this.db.offers = this.db.offers.filter((o) => !payload.ids.includes(o.id));

    return this.reply(null, "Offer Deleted Successfully");
  }

  // ----------------------------------------------------------
  // Business rules
  // ----------------------------------------------------------

  /** First rule `payload` breaks, in form order (names → services → prices → dates → bookings → banner), or `null`. */
  private validate(
    branchId: number,
    payload: OfferFields,
    creating: boolean,
  ): Problem | null {
    for (const [field, raw] of [
      ["NameAr", payload.nameAr],
      ["NameEn", payload.nameEn],
    ] as const) {
      const name = raw.trim();
      if (!name) return { field, key: "OFFERS.ERRORS.NAME_REQUIRED" };
      if (name.length > OFFER_NAME_MAX_LENGTH) return { field, key: "OFFERS.ERRORS.NAME_TOO_LONG" };
    }

    const serviceIds = payload.serviceIds;
    if (serviceIds.length < OFFER_MIN_SERVICES) {
      return { field: "ServiceIds", key: "OFFERS.ERRORS.SERVICES_MIN" };
    }
    if (new Set(serviceIds).size !== serviceIds.length) {
      return { field: "ServiceIds", key: "OFFERS.ERRORS.SERVICES_DUPLICATE" };
    }

    const rows = this.rowsOf(serviceIds, branchId);
    if (rows.some((row) => !row?.isActive)) {
      return { field: "ServiceIds", key: "OFFERS.ERRORS.SERVICE_INACTIVE" };
    }
    const priced = this.priced(rows);

    const regular = this.priceProblem(payload.regularPrice, this.sum(priced, (p) => p.regularPrice));
    if (regular) return { field: "RegularPrice", key: regular };

    const vip = this.priceProblem(payload.vipPrice, this.sum(priced, (p) => p.vipPrice));
    if (vip) return { field: "VipPrice", key: vip };

    if (payload.homePrice !== null) {
      if (!this.allHome(priced)) {
        return { field: "HomePrice", key: "OFFERS.ERRORS.HOME_UNAVAILABLE" };
      }
      const home = this.priceProblem(payload.homePrice, this.sum(priced, (p) => p.homePrice ?? 0));
      if (home) return { field: "HomePrice", key: home };
    }

    const dates = this.dateProblem(payload, creating);
    if (dates) return dates;

    const max = payload.maxBookings;
    if (max !== null && (!Number.isInteger(max) || max < 1 || max > OFFER_MAX_BOOKINGS_MAX)) {
      return { field: "MaxBookings", key: "OFFERS.ERRORS.MAX_BOOKINGS_INVALID" };
    }

    if (payload.image && validateOfferImage(payload.image)) {
      return { field: "Image", key: "OFFERS.ERRORS.INVALID_IMAGE" };
    }

    return null;
  }

  /** Start: required, a real date, today or later (create only). End: a real date on or after the start. */
  private dateProblem(payload: OfferFields, creating: boolean): Problem | null {
    const { startDate, endDate } = payload;

    if (!startDate) return { field: "StartDate", key: "OFFERS.ERRORS.START_REQUIRED" };
    if (!isValidDate(startDate)) return { field: "StartDate", key: "OFFERS.ERRORS.START_INVALID" };
    if (creating && startDate < cairoToday()) {
      return { field: "StartDate", key: "OFFERS.ERRORS.START_PAST" };
    }

    if (endDate !== null) {
      if (!isValidDate(endDate)) return { field: "EndDate", key: "OFFERS.ERRORS.END_INVALID" };
      if (endDate < startDate) return { field: "EndDate", key: "OFFERS.ERRORS.END_BEFORE_START" };
    }

    return null;
  }

  /** > 0, ≤ 100,000, at most 2 decimals, and LOWER than the services' total. */
  private priceProblem(price: number, total: number): string | null {
    const cents = price * 100;
    const valid =
      Number.isFinite(price) &&
      price > 0 &&
      price <= OFFER_PRICE_MAX &&
      Math.abs(cents - Math.round(cents)) < 1e-6;

    if (!valid) return "OFFERS.ERRORS.PRICE_INVALID";
    return price >= total ? "OFFERS.ERRORS.PRICE_TOO_HIGH" : null;
  }

  /** The services' price rows in `branchId` (`undefined` = not priced there). */
  private rowsOf(serviceIds: number[], branchId: number): PriceRow[] {
    return serviceIds.map((serviceId) =>
      this.db.services
        .find((s) => s.id === serviceId)
        ?.prices.find((p) => p.branchId === branchId),
    );
  }

  private priced(rows: PriceRow[]): ServiceBranchPayload[] {
    return rows.filter((row): row is ServiceBranchPayload => row !== undefined);
  }

  private allHome(rows: PriceRow[]): boolean {
    return rows.every((row) => row?.isHomeAvailable);
  }

  private sum(rows: ServiceBranchPayload[], pick: (row: ServiceBranchPayload) => number): number {
    return rows.reduce((total, row) => total + pick(row), 0);
  }

  // ----------------------------------------------------------
  // Mapping
  // ----------------------------------------------------------

  /** Derives names, "was" prices, `savingPercent` and the calculated status from current data. */
  private toListItem(o: MockOffer, today: string): OfferListItem {
    const rows = this.rowsOf(o.serviceIds, o.branchId);
    const priced = this.priced(rows);
    const originalRegularPrice = this.sum(priced, (r) => r.regularPrice);
    const bookingsCount = 0; // always 0 until the bookings module is ready

    return {
      id: o.id,
      branchId: o.branchId,
      nameAr: o.nameAr,
      nameEn: o.nameEn,
      imageUrl: o.imageUrl,
      regularPrice: o.regularPrice,
      vipPrice: o.vipPrice,
      homePrice: o.homePrice,
      startDate: o.startDate,
      endDate: o.endDate,
      maxBookings: o.maxBookings,
      bookingsCount,
      status: deriveOfferStatus({ ...o, bookingsCount }, today),
      stoppedAt: o.stoppedAt,
      services: o.serviceIds.map((serviceId) => {
        const service = this.db.services.find((s) => s.id === serviceId);
        return {
          serviceId,
          nameAr: service?.nameAr ?? "",
          nameEn: service?.nameEn ?? "",
        };
      }),
      originalRegularPrice,
      originalVipPrice: this.sum(priced, (r) => r.vipPrice),
      originalHomePrice: this.allHome(rows) ? this.sum(priced, (r) => r.homePrice ?? 0) : null,
      savingPercent: savingPercent(originalRegularPrice, o.regularPrice),
    };
  }

  /** A browser URL for the chosen file (stands in for the uploaded-banner URL the server would return). */
  private bannerUrl(file: File): string {
    return createPreviewUrl(file) ?? `blob:mock/${encodeURIComponent(file.name)}`;
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
    return this.fail(this.translate.instant("OFFERS.ERRORS.NOT_FOUND"), 404);
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
