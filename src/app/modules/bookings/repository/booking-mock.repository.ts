import { Injectable, inject } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import { Observable } from "rxjs";

import { MockBooking, MockDb } from "@core/mock/mock-db";
import {
  bookingDuration,
  bookingTotal,
  canCompleteBooking,
  customerStats,
  isBookingInProgress,
  isRefundWaiting,
  isUpcomingBooking,
} from "@core/mock/mock-bookings";
import {
  mockFail,
  mockInvalid,
  mockNotFoundBody,
  mockReply,
  mockReplyWithMeta,
} from "@core/mock/mock-responses";
import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import { cairoToday } from "../../offers/utils/offer-dates.util";
import {
  BookingDetails,
  BookingListItem,
  BookingStatus,
  BookingTab,
  BookingsQuery,
} from "../model/booking.model";
import { bookingDay } from "../utils/booking-dates.util";
import { IBookingRepository } from "./booking.repository";

/** Largest page the API serves. */
const MAX_PAGE_SIZE = 100;

/** Mock barber ratings (null = no reviews yet), picked by barber id so a barber keeps one rating. */
const RATINGS: Array<number | null> = [4.9, 4.7, null, 4.5, 4.8, 4.6];

/**
 * In-memory implementation of {@link IBookingRepository}.
 *
 * Reads from and writes to the shared {@link MockDb} (the same bookings the payment-review queue and
 * the barbers' attendance use) and enforces the contract's rules: tabs and filters, ordering, the
 * "Today" / "Waiting" counters of the selected branch, 404 for a missing booking, and for "End
 * session" a 409 before the start time or when the booking isn't Confirmed. The time-driven changes
 * (expiry, auto-completion) are applied before every call.
 */
@Injectable({ providedIn: "root" })
export class BookingMockRepository implements IBookingRepository {
  private readonly db = inject(MockDb);
  private readonly notify = inject(NotificationService);
  private readonly translate = inject(TranslateService);

  // ----------------------------------------------------------
  // Read Operations
  // ----------------------------------------------------------

  /** Tab + filters, ordered like the API; `meta.additionalData` has the branch's counters. */
  getBookings(q: BookingsQuery): Observable<ApiResponse<BookingListItem[]>> {
    const now = new Date();
    this.db.settleBookings(now);

    if (q.dateFrom && q.dateTo && q.dateTo < q.dateFrom) {
      return mockInvalid(this.notify, "DateTo", "BOOKINGS.ERRORS.INVALID_DATE_RANGE");
    }

    const today = cairoToday(now);
    const statuses = new Set(q.statuses ?? []);
    const term = (q.search ?? "").trim().replace(/^#/, "").toLowerCase();
    const tab = q.tab ?? BookingTab.All;

    const matches = this.db.bookings.filter((b) => {
      const day = bookingDay(b.startAt) ?? "";
      return (
        this.inTab(b, tab, today, now) &&
        (q.branchId === undefined || b.branchId === q.branchId) &&
        (q.barberId === undefined || b.barberId === q.barberId) &&
        (q.type === undefined || b.type === q.type) &&
        (!statuses.size || statuses.has(b.status)) &&
        (!q.dateFrom || day >= q.dateFrom) &&
        (!q.dateTo || day <= q.dateTo) &&
        (q.refundStatus === undefined || b.refund?.status === q.refundStatus) &&
        (!term || this.matchesSearch(b, term))
      );
    });

    // Today and Upcoming: soonest first. All and Past: newest first.
    const soonestFirst = tab === BookingTab.Today || tab === BookingTab.Upcoming;
    matches.sort((a, b) =>
      soonestFirst
        ? a.startAt.localeCompare(b.startAt) || a.id - b.id
        : b.startAt.localeCompare(a.startAt) || b.id - a.id,
    );

    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, q.pageSize));
    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    const pageNumber = Math.max(1, q.pageNumber);
    const start = (pageNumber - 1) * pageSize;

    // Counters belong to the selected branch only — the other filters and the search don't move them.
    const ofBranch = this.db.bookings.filter(
      (b) => q.branchId === undefined || b.branchId === q.branchId,
    );

    return mockReplyWithMeta(
      matches.slice(start, start + pageSize).map((b) => this.toListItem(b, now)),
      {
        currentPage: pageNumber,
        pageSize,
        totalPages,
        totalCount: matches.length,
        hasPreviousPage: pageNumber > 1,
        hasNextPage: pageNumber < totalPages,
        additionalData: {
          todayCount: ofBranch.filter((b) => bookingDay(b.startAt) === today).length,
          refundWaitingCount: ofBranch.filter(isRefundWaiting).length,
        },
      },
    );
  }

  /** A `status: false` 404 body when the booking doesn't exist. */
  getBookingById(id: number): Observable<ApiResponse<BookingDetails>> {
    const now = new Date();
    this.db.settleBookings(now);

    const booking = this.db.bookings.find((b) => b.id === id);
    if (!booking) return mockNotFoundBody("Booking not found");

    return mockReply(this.toDetails(booking, now));
  }

  // ----------------------------------------------------------
  // Write Operations
  // ----------------------------------------------------------

  /** Confirmed → Completed, only after the start time. 404 / 409 like the contract. */
  completeBooking(id: number): Observable<ApiResponse<null>> {
    const now = new Date();
    this.db.settleBookings(now);

    const booking = this.db.bookings.find((b) => b.id === id);
    if (!booking) return this.fail("BOOKINGS.ERRORS.NOT_FOUND", 404);
    if (booking.status !== BookingStatus.Confirmed) {
      return this.fail("BOOKINGS.ERRORS.NOT_ALLOWED", 409);
    }
    if (!canCompleteBooking(booking, now)) return this.fail("BOOKINGS.ERRORS.NOT_STARTED", 409);

    booking.status = BookingStatus.Completed;
    return mockReply(null, "Booking Updated Successfully");
  }

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------

  private fail(key: string, status: number): Observable<never> {
    return mockFail(this.notify, this.translate.instant(key), status);
  }

  /**
   * Today: any status on today's branch working day. Upcoming: pending / confirmed that haven't
   * ended. Past: everything else.
   */
  private inTab(b: MockBooking, tab: BookingTab, today: string, now: Date): boolean {
    switch (tab) {
      case BookingTab.Today:
        return bookingDay(b.startAt) === today;
      case BookingTab.Upcoming:
        return isUpcomingBooking(b, now);
      case BookingTab.Past:
        return !isUpcomingBooking(b, now);
      default:
        return true;
    }
  }

  /** Booking number (`#OD-000482`, `OD-000482` or `482`), customer name or phone. */
  private matchesSearch(b: MockBooking, term: string): boolean {
    const customer = this.db.customers.find((c) => c.id === b.customerId);
    const digits = term.replace(/[^\d]/g, "");
    const number = b.bookingNumber.toLowerCase();

    return (
      number.includes(term) ||
      (/^\d+$/.test(term) && Number(term) === b.id) ||
      !!customer?.fullName.toLowerCase().includes(term) ||
      (digits.length >= 3 && !!customer?.phoneNumber.replace(/[^\d]/g, "").includes(digits))
    );
  }

  private toListItem(b: MockBooking, now: Date): BookingListItem {
    const customer = this.db.customers.find((c) => c.id === b.customerId);
    const barber = this.db.barbers.find((x) => x.id === b.barberId);

    return {
      id: b.id,
      bookingNumber: b.bookingNumber,
      startAt: b.startAt,
      customer: {
        fullName: customer?.fullName ?? "",
        phoneNumber: customer?.phoneNumber ?? "",
      },
      items: b.items.map((i) => ({ nameAr: i.nameAr, nameEn: i.nameEn })),
      barber: { fullName: barber?.fullName ?? "" },
      type: b.type,
      status: b.status,
      isInProgress: isBookingInProgress(b, now),
      payment: { method: b.paymentMethod, totalPrice: bookingTotal(b) },
      refund: b.refund ? { ...b.refund } : null,
    };
  }

  private toDetails(b: MockBooking, now: Date): BookingDetails {
    const customer = this.db.customers.find((c) => c.id === b.customerId);
    const barber = this.db.barbers.find((x) => x.id === b.barberId);
    const chair = b.chairId === null ? null : this.db.chairs.find((c) => c.id === b.chairId);
    const branch = this.db.branches.find((x) => x.id === b.branchId);
    const total = bookingTotal(b);

    return {
      id: b.id,
      bookingNumber: b.bookingNumber,
      status: b.status,
      isInProgress: isBookingInProgress(b, now),
      type: b.type,
      startAt: b.startAt,
      durationMinutes: bookingDuration(b),
      barber: {
        fullName: barber?.fullName ?? "",
        averageRating: RATINGS[b.barberId % RATINGS.length],
      },
      chair: chair ? { name: chair.name } : null,
      branch: { nameAr: branch?.nameAr ?? "", nameEn: branch?.nameEn ?? "" },
      homeAddress: b.homeAddress,
      items: b.items.map((i) => ({
        nameAr: i.nameAr,
        nameEn: i.nameEn,
        durationMinutes: i.durationMinutes,
        price: i.price,
      })),
      payment: { method: b.paymentMethod, totalPrice: total, subtotal: total },
      customer: {
        fullName: customer?.fullName ?? "",
        phoneNumber: customer?.phoneNumber ?? "",
        id: b.customerId,
        ...customerStats(this.db.bookings, b.customerId),
      },
      refund: b.refund ? { ...b.refund } : null,
      actions: {
        canComplete: canCompleteBooking(b, now),
        canMarkRefunded: isRefundWaiting(b),
      },
    };
  }
}
