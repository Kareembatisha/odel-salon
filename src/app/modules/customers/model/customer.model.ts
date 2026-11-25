/**
 * customer.model.ts — data contracts for the Customers feature.
 * Mirrors API Contract — Customers (GET /customers, GET /customers/{id}); the profile's "All
 * bookings" link uses GET /bookings with `customerId` (see `modules/bookings`).
 *
 * Customers are the app users who registered and verified their email (staff never appear).
 * `startAt` of a booking is salon-local (Cairo) without an offset — use
 * `bookings/utils/booking-dates.util.ts`, never `new Date()`; `createdAt` is UTC.
 */
import {
  BookingItemName,
  BookingRefund,
  BookingStatus,
  BookingType,
} from "../../bookings/model/booking.model";

/** `tab` of GET /customers. 0 is the default. */
export enum CustomerTab {
  All = 0,
  /** A completed visit in the current month. */
  VisitedThisMonth = 1,
  /** At least one no-show. */
  HasMissedBookings = 2,
  /** Visited before, and the last visit was more than 60 days ago. */
  NotBackIn60Days = 3,
}

/** GET /customers → data[] */
export interface CustomerListItem {
  /** Opens GET /customers/{id}. */
  id: number;
  fullName: string;
  /** `+20`. */
  countryCode: string;
  /** `+201001234567` — the number to call. */
  phoneNumber: string;
  /** Completed bookings. */
  visitsCount: number;
  /** Salon date (`yyyy-MM-dd`) of the latest completed booking; null if the customer never visited. */
  lastVisitDate: string | null;
  /** No-show bookings (the "Missed" column). */
  missedCount: number;
}

/**
 * `meta.additionalData` of GET /customers: the count of EVERY tab for the selected branch — the
 * search doesn't change them.
 */
export interface CustomerCounters {
  allCount: number;
  visitedThisMonthCount: number;
  hasMissedBookingsCount: number;
  notBackIn60DaysCount: number;
}

/**
 * GET /customers query. Every filter is optional (defaults: tab All, page 1, size 20, max 100).
 * Without `branchId` every customer is listed and the numbers cover all branches; with it only the
 * customers who booked there are listed and the numbers (and the tab counts) count that branch only.
 */
export interface CustomersQuery {
  pageNumber: number;
  pageSize: number;
  tab?: CustomerTab;
  branchId?: number;
  /** The customer's name or phone (contains). */
  search?: string;
}

/** One of the customer's latest bookings (GET /customers/{id} → latestBookings[]). */
export interface CustomerBooking {
  id: number;
  bookingNumber: string;
  /** Salon-local, no offset. */
  startAt: string;
  items: BookingItemName[];
  barber: { fullName: string };
  type: BookingType;
  branch: { nameAr: string; nameEn: string };
  status: BookingStatus;
  /** Show "Started" instead of the status when true. */
  isInProgress: boolean;
  totalPrice: number;
  /** Cancelled / Expired / NoShow bookings only. */
  refund: BookingRefund | null;
  /** Cancelled bookings only: false = by the customer, true = by the branch. */
  cancelledByBranch: boolean | null;
  /** The customer's barber stars (1-5) for a rated completed booking. */
  rating: number | null;
}

/** GET /customers/{id} (404 when the id doesn't exist or isn't a customer). Covers ALL branches. */
export interface CustomerDetails {
  id: number;
  fullName: string;
  countryCode: string;
  phoneNumber: string;
  email: string;
  /** Null when the customer has no photo (show initials). */
  imageUrl: string | null;
  /** UTC — "customer since". */
  createdAt: string;
  visitsCount: number;
  missedCount: number;
  /** Salon date of the latest no-show; null if never missed. */
  lastMissedDate: string | null;
  /** All bookings of the customer ("All bookings (14)"). */
  bookingsCount: number;
  /** The latest 5, newest first. */
  latestBookings: CustomerBooking[];
}
