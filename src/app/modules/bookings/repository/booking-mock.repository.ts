import { Injectable, inject } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import { Observable } from "rxjs";

import { MockBooking, MockDb } from "@core/mock/mock-db";
import {
  bookingDuration,
  bookingEndAt,
  bookingTotal,
  canCancelBooking,
  canCompleteBooking,
  customerStats,
  isBookingInProgress,
  isOpenBooking,
  isRefundWaiting,
  isUpcomingBooking,
  noShowRefund,
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
  RefundStatus,
} from "../model/booking.model";
import { bookingDay } from "../utils/booking-dates.util";
import { IBookingRepository } from "./booking.repository";

/** Largest page the API serves. */
const MAX_PAGE_SIZE = 100;

/** Longest reason the API accepts for a cancellation. */
const MAX_REASON_LENGTH = 500;

/** The staff member the mock records as the one who cancelled. */
const MOCK_STAFF_NAME = "Branch staff";

/** Mock barber ratings (null = no reviews yet), picked by barber id so a barber keeps one rating. */
const RATINGS: Array<number | null> = [4.9, 4.7, null, 4.5, 4.8, 4.6];

/**
 * In-memory implementation of {@link IBookingRepository}.
 *
 * Reads from and writes to the shared {@link MockDb} (the same bookings the payment-review queue and
 * the barbers' attendance use) and enforces the contract's rules: tabs and filters, ordering, the
 * "Today" / "Waiting" counters of the selected branch (or customer), 404 for a missing booking, and
 * for the actions their 400 / 409 answers: "End session" and "Missed" only after the start time of a
 * Confirmed booking, "Cancel" and "Reassign barber" only while a pending / confirmed booking hasn't
 * ended. The time-driven changes (expiry, auto-completion) are applied before every call.
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
        (q.customerId === undefined || b.customerId === q.customerId) &&
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

    // Counters belong to the selected branch (and customer) only — the other filters and the search
    // don't move them.
    const ofBranch = this.db.bookings.filter(
      (b) =>
        (q.branchId === undefined || b.branchId === q.branchId) &&
        (q.customerId === undefined || b.customerId === q.customerId),
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

  /** Pending / confirmed → Cancelled by the branch, with a full refund owed. */
  cancelBooking(id: number, reason: string): Observable<ApiResponse<null>> {
    const now = new Date();
    this.db.settleBookings(now);

    const text = reason.trim();
    if (!text || text.length > MAX_REASON_LENGTH) {
      return mockInvalid(this.notify, "Reason", "BOOKINGS.ERRORS.INVALID_REASON");
    }

    const booking = this.db.bookings.find((b) => b.id === id);
    if (!booking) return this.fail("BOOKINGS.ERRORS.NOT_FOUND", 404);
    if (!isOpenBooking(booking)) return this.fail("BOOKINGS.ERRORS.NOT_ALLOWED", 409);
    if (!canCancelBooking(booking, now)) return this.fail("BOOKINGS.ERRORS.ALREADY_ENDED", 409);

    booking.status = BookingStatus.Cancelled;
    booking.refund = {
      status: RefundStatus.Waiting,
      amount: bookingTotal(booking),
      feeAmount: null,
    };
    booking.cancellation = {
      cancelledAt: now.toISOString(),
      cancelledByBranch: true,
      cancelledByName: MOCK_STAFF_NAME,
      reason: null,
      note: text,
    };
    return mockReply(null, "Booking Updated Successfully");
  }

  /**
   * "Refund sent": the money was returned outside the app. Only a booking with a refund still
   * Waiting can be marked; its status doesn't change.
   */
  markRefunded(id: number): Observable<ApiResponse<null>> {
    this.db.settleBookings(new Date());

    const booking = this.db.bookings.find((b) => b.id === id);
    if (!booking) return this.fail("BOOKINGS.ERRORS.NOT_FOUND", 404);
    if (!booking.refund) return this.fail("BOOKINGS.ERRORS.NOT_ALLOWED", 409);
    if (booking.refund.status === RefundStatus.Sent) {
      return this.fail("BOOKINGS.ERRORS.REFUND_ALREADY_SENT", 409);
    }

    booking.refund.status = RefundStatus.Sent;
    return mockReply(null, "Booking Updated Successfully");
  }

  /** Confirmed → NoShow after the start time; the price minus the no-show fee becomes owed. */
  markNoShow(id: number): Observable<ApiResponse<null>> {
    const now = new Date();
    this.db.settleBookings(now);

    const booking = this.db.bookings.find((b) => b.id === id);
    if (!booking) return this.fail("BOOKINGS.ERRORS.NOT_FOUND", 404);
    if (booking.status !== BookingStatus.Confirmed) {
      return this.fail("BOOKINGS.ERRORS.NOT_ALLOWED", 409);
    }
    if (!canCompleteBooking(booking, now)) return this.fail("BOOKINGS.ERRORS.NOT_STARTED", 409);

    booking.status = BookingStatus.NoShow;
    booking.refund = { status: RefundStatus.Waiting, ...noShowRefund(bookingTotal(booking)) };
    return mockReply(null, "Booking Updated Successfully");
  }

  /**
   * Moves a pending / confirmed booking that hasn't ended to another barber of the same branch.
   * The new barber must be active, present today (when the booking is today) and free at that time.
   * (The real API also counts the travel time of Home bookings; the mock doesn't.)
   */
  reassignBarber(id: number, barberId: number): Observable<ApiResponse<null>> {
    const now = new Date();
    this.db.settleBookings(now);

    const booking = this.db.bookings.find((b) => b.id === id);
    if (!booking) return this.fail("BOOKINGS.ERRORS.NOT_FOUND", 404);

    const barber = this.db.barbers.find((b) => b.id === barberId);
    if (!barber) return mockInvalid(this.notify, "BarberId", "BOOKINGS.ERRORS.BARBER_NOT_FOUND");
    if (barber.branchId !== booking.branchId) {
      return mockInvalid(this.notify, "BarberId", "BOOKINGS.ERRORS.BARBER_OTHER_BRANCH");
    }

    if (!isOpenBooking(booking)) return this.fail("BOOKINGS.ERRORS.NOT_ALLOWED", 409);
    if (!canCancelBooking(booking, now)) return this.fail("BOOKINGS.ERRORS.ALREADY_ENDED", 409);
    if (barber.id === booking.barberId) return mockReply(null, "Booking Updated Successfully");

    if (!this.isBarberFree(barber.id, booking, now)) {
      return this.fail("BOOKINGS.ERRORS.BARBER_UNAVAILABLE", 409);
    }

    booking.barberId = barber.id;
    return mockReply(null, "Booking Updated Successfully");
  }

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------

  /** Active, present today (only the day's sheet exists), and no other open booking overlapping. */
  private isBarberFree(barberId: number, booking: MockBooking, now: Date): boolean {
    const barber = this.db.barbers.find((b) => b.id === barberId);
    if (!barber?.isActive) return false;

    const today = cairoToday(now);
    if (bookingDay(booking.startAt) === today) {
      const entry = this.db.barberAttendance[barberId];
      if (!entry || entry.date !== today || !entry.isPresent) return false;
    }

    const end = bookingEndAt(booking);
    return !this.db.bookings.some(
      (b) =>
        b.id !== booking.id &&
        b.barberId === barberId &&
        isOpenBooking(b) &&
        b.startAt < end &&
        bookingEndAt(b) > booking.startAt,
    );
  }

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
        id: b.barberId,
        fullName: barber?.fullName ?? "",
        averageRating: RATINGS[b.barberId % RATINGS.length],
      },
      chair: chair ? { id: chair.id, name: chair.name } : null,
      branch: { id: b.branchId, nameAr: branch?.nameAr ?? "", nameEn: branch?.nameEn ?? "" },
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
      cancellation: b.cancellation ? { ...b.cancellation } : null,
      actions: {
        canComplete: canCompleteBooking(b, now),
        canMarkRefunded: isRefundWaiting(b),
        canCancel: canCancelBooking(b, now),
        canReassign: canCancelBooking(b, now),
      },
    };
  }
}
