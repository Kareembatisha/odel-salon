import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { MockBooking, MockCustomer, MockDb } from "@core/mock/mock-db";
import { bookingTotal, isBookingInProgress } from "@core/mock/mock-bookings";
import { mockNotFoundBody, mockReply, mockReplyWithMeta } from "@core/mock/mock-responses";
import { ApiResponse } from "@shared/model/api_response.model";
import { BookingStatus } from "../../bookings/model/booking.model";
import { bookingDay } from "../../bookings/utils/booking-dates.util";
import { addDays, cairoToday } from "../../offers/utils/offer-dates.util";
import {
  CustomerBooking,
  CustomerDetails,
  CustomerListItem,
  CustomerTab,
  CustomersQuery,
} from "../model/customer.model";
import { ICustomerRepository } from "./customer.repository";

/** Largest page the API serves. */
const MAX_PAGE_SIZE = 100;

/** "Latest bookings" of the profile. */
const LATEST_BOOKINGS = 5;

/** A customer who last visited MORE than this many days ago is "not back". */
const NOT_BACK_DAYS = 60;

/** What the list needs to know about one customer, worked out from the bookings in scope. */
interface CustomerStats {
  customer: MockCustomer;
  visitsCount: number;
  missedCount: number;
  lastVisitDate: string | null;
  /** `startAt` of the latest booking of any status (the list order), or null without bookings. */
  latestStartAt: string | null;
  visitedThisMonth: boolean;
}

/**
 * In-memory implementation of {@link ICustomerRepository}.
 *
 * Reads the shared {@link MockDb} (the same customers and bookings the Bookings screens use) and
 * follows the contract: customers are listed newest booking first (those without bookings last),
 * with a `branchId` only the customers who booked there are listed and every number counts that
 * branch only, `meta.additionalData` has the count of EVERY tab (the search doesn't move them), and
 * the profile covers all branches and answers a `status: false` 404 body for an unknown id.
 */
@Injectable({ providedIn: "root" })
export class CustomerMockRepository implements ICustomerRepository {
  private readonly db = inject(MockDb);

  getCustomers(q: CustomersQuery): Observable<ApiResponse<CustomerListItem[]>> {
    const now = new Date();
    this.db.settleBookings(now);

    const today = cairoToday(now);
    const scope = this.db.bookings.filter(
      (b) => q.branchId === undefined || b.branchId === q.branchId,
    );

    // Without a branch everyone is listed; with one, only those who booked there.
    const stats = this.db.customers
      .filter((c) => q.branchId === undefined || scope.some((b) => b.customerId === c.id))
      .map((c) => this.statsOf(c, scope, today));

    const term = (q.search ?? "").trim().toLowerCase();
    const digits = term.replace(/[^\d]/g, "");
    const matching = stats.filter(
      (s) =>
        !term ||
        s.customer.fullName.toLowerCase().includes(term) ||
        (digits.length >= 3 && s.customer.phoneNumber.replace(/[^\d]/g, "").includes(digits)),
    );

    const tab = q.tab ?? CustomerTab.All;
    const rows = matching
      .filter((s) => this.inTab(s, tab, today))
      .sort((a, b) => {
        if (a.latestStartAt === null || b.latestStartAt === null) {
          // Customers without bookings come last.
          return a.latestStartAt === b.latestStartAt
            ? a.customer.id - b.customer.id
            : a.latestStartAt === null
              ? 1
              : -1;
        }
        return b.latestStartAt.localeCompare(a.latestStartAt) || a.customer.id - b.customer.id;
      });

    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, q.pageSize));
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const pageNumber = Math.max(1, q.pageNumber);
    const start = (pageNumber - 1) * pageSize;

    return mockReplyWithMeta(
      rows.slice(start, start + pageSize).map((s) => this.toListItem(s)),
      {
        currentPage: pageNumber,
        pageSize,
        totalPages,
        totalCount: rows.length,
        hasPreviousPage: pageNumber > 1,
        hasNextPage: pageNumber < totalPages,
        // The tab counts belong to the branch and ignore the search.
        additionalData: {
          allCount: stats.length,
          visitedThisMonthCount: stats.filter((s) =>
            this.inTab(s, CustomerTab.VisitedThisMonth, today),
          ).length,
          hasMissedBookingsCount: stats.filter((s) =>
            this.inTab(s, CustomerTab.HasMissedBookings, today),
          ).length,
          notBackIn60DaysCount: stats.filter((s) =>
            this.inTab(s, CustomerTab.NotBackIn60Days, today),
          ).length,
        },
      },
    );
  }

  /** A `status: false` 404 body when the customer doesn't exist. */
  getCustomerById(id: number): Observable<ApiResponse<CustomerDetails>> {
    const now = new Date();
    this.db.settleBookings(now);

    const customer = this.db.customers.find((c) => c.id === id);
    if (!customer) return mockNotFoundBody("Customer not found");

    const mine = this.db.bookings
      .filter((b) => b.customerId === id)
      .sort((a, b) => b.startAt.localeCompare(a.startAt) || b.id - a.id);
    const missed = mine.filter((b) => b.status === BookingStatus.NoShow);

    return mockReply<CustomerDetails>({
      id: customer.id,
      fullName: customer.fullName,
      countryCode: "+20",
      phoneNumber: customer.phoneNumber,
      email: customer.email,
      imageUrl: null,
      createdAt: customer.createdAt,
      visitsCount: mine.filter((b) => b.status === BookingStatus.Completed).length,
      missedCount: missed.length,
      lastMissedDate: missed.length ? bookingDay(missed[0].startAt) : null,
      bookingsCount: mine.length,
      latestBookings: mine.slice(0, LATEST_BOOKINGS).map((b) => this.toBooking(b, now)),
    });
  }

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------

  private statsOf(customer: MockCustomer, scope: MockBooking[], today: string): CustomerStats {
    const mine = scope.filter((b) => b.customerId === customer.id);
    const completed = mine.filter((b) => b.status === BookingStatus.Completed);
    const days = completed.map((b) => bookingDay(b.startAt) ?? "").sort();
    const starts = mine.map((b) => b.startAt).sort();

    return {
      customer,
      visitsCount: completed.length,
      missedCount: mine.filter((b) => b.status === BookingStatus.NoShow).length,
      lastVisitDate: days.length ? days[days.length - 1] : null,
      latestStartAt: starts.length ? starts[starts.length - 1] : null,
      visitedThisMonth: days.some((d) => d.slice(0, 7) === today.slice(0, 7)),
    };
  }

  private inTab(s: CustomerStats, tab: CustomerTab, today: string): boolean {
    switch (tab) {
      case CustomerTab.VisitedThisMonth:
        return s.visitedThisMonth;
      case CustomerTab.HasMissedBookings:
        return s.missedCount > 0;
      case CustomerTab.NotBackIn60Days:
        return s.lastVisitDate !== null && s.lastVisitDate < addDays(today, -NOT_BACK_DAYS);
      default:
        return true;
    }
  }

  private toListItem(s: CustomerStats): CustomerListItem {
    return {
      id: s.customer.id,
      fullName: s.customer.fullName,
      countryCode: "+20",
      phoneNumber: s.customer.phoneNumber,
      visitsCount: s.visitsCount,
      lastVisitDate: s.lastVisitDate,
      missedCount: s.missedCount,
    };
  }

  private toBooking(b: MockBooking, now: Date): CustomerBooking {
    const barber = this.db.barbers.find((x) => x.id === b.barberId);
    const branch = this.db.branches.find((x) => x.id === b.branchId);

    return {
      id: b.id,
      bookingNumber: b.bookingNumber,
      startAt: b.startAt,
      items: b.items.map((i) => ({ nameAr: i.nameAr, nameEn: i.nameEn })),
      barber: { fullName: barber?.fullName ?? "" },
      type: b.type,
      branch: { nameAr: branch?.nameAr ?? "", nameEn: branch?.nameEn ?? "" },
      status: b.status,
      isInProgress: isBookingInProgress(b, now),
      totalPrice: bookingTotal(b),
      refund: b.refund ? { ...b.refund } : null,
      cancelledByBranch:
        b.status === BookingStatus.Cancelled ? (b.cancellation?.cancelledByBranch ?? false) : null,
      // Some completed bookings were rated (1-5 stars), picked by id so a booking keeps its rating.
      rating: b.status === BookingStatus.Completed && b.id % 3 !== 0 ? 3 + (b.id % 3) : null,
    };
  }
}
