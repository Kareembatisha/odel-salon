/**
 * booking.model.ts — data contracts for the Bookings feature.
 * Mirrors API Contract — Admin Bookings (GET /bookings, GET /bookings/{id},
 * PATCH /bookings/{id}/complete) and its additions: Admin Booking Cancellation (PATCH
 * /bookings/{id}/cancel) and Admin Booking Actions (PATCH /bookings/{id}/no-show, PUT
 * /bookings/{id}/barber). The payment-review queue shares these enums and building blocks (see
 * `modules/payment-reviews`).
 *
 * `startAt` is salon-local (Cairo) time WITHOUT an offset (`yyyy-MM-ddTHH:mm:ss`): never feed it to
 * `new Date()` — use `utils/booking-dates.util.ts`.
 *
 * Note: `shared/utils/status-badge.util.ts` still has an older, unused string-union `BookingStatus`
 * from the first design sketch. The enum below is the API's and is the one to use.
 */

/** `tab` of GET /bookings. 0 is the default. */
export enum BookingTab {
  All = 0,
  /** Today's branch working day. */
  Today = 1,
  /** PendingReview / Confirmed that haven't ended yet. */
  Upcoming = 2,
  /** Everything else. */
  Past = 3,
}

/** BookingStatusEnum. Shown as "Started" instead of Confirmed when `isInProgress` is true. */
export enum BookingStatus {
  /** "Waiting for branch" — payment proof not reviewed yet. */
  PendingReview = 0,
  Confirmed = 1,
  Rejected = 2,
  /** Not reviewed before its start time. */
  Expired = 3,
  Completed = 4,
  /** "Missed" — the customer didn't come. */
  NoShow = 5,
  /** Cancelled — by the customer before the start time, or by the branch (see `cancellation`). */
  Cancelled = 6,
}

/** BookingTypeEnum. */
export enum BookingType {
  Regular = 0,
  Vip = 1,
  Home = 2,
}

/** PaymentMethodEnum. */
export enum PaymentMethod {
  InstaPay = 0,
  MobileWallet = 1,
}

/** RefundStatusEnum — also the `refundStatus` filter of GET /bookings. */
export enum RefundStatus {
  /** Refund still owed. */
  Waiting = 0,
  /** Marked as refunded. */
  Sent = 1,
}

export interface BookingCustomerSummary {
  fullName: string;
  /** Egyptian mobile, `+201XXXXXXXXX`. */
  phoneNumber: string;
}

/** A service of the booking, named in both languages. */
export interface BookingItemName {
  nameAr: string;
  nameEn: string;
}

/**
 * The actual refund of a Cancelled / Expired / NoShow booking (null for every other booking).
 * `feeAmount` ("EGP 24 fee") is set for NoShow only.
 */
export interface BookingRefund {
  status: RefundStatus;
  amount: number;
  feeAmount: number | null;
}

export interface BookingListPayment {
  method: PaymentMethod;
  totalPrice: number;
}

/** GET /bookings → data[] */
export interface BookingListItem {
  /** Opens GET /bookings/{id}. */
  id: number;
  /** `OD-000482`. */
  bookingNumber: string;
  /** Salon-local, no offset. */
  startAt: string;
  customer: BookingCustomerSummary;
  items: BookingItemName[];
  barber: { fullName: string };
  type: BookingType;
  status: BookingStatus;
  /** Show "Started" instead of the status when true. */
  isInProgress: boolean;
  payment: BookingListPayment;
  refund: BookingRefund | null;
}

/**
 * `meta.additionalData` of GET /bookings, for the SELECTED BRANCH only — the other filters and the
 * search don't change them.
 */
export interface BookingCounters {
  /** "Today 42". */
  todayCount: number;
  /** "Waiting 3" — refunds still owed. */
  refundWaitingCount: number;
}

/** GET /bookings query. Every filter is optional (defaults: tab All, page 1, size 20, max 100). */
export interface BookingsQuery {
  pageNumber: number;
  pageSize: number;
  tab?: BookingTab;
  branchId?: number;
  barberId?: number;
  type?: BookingType;
  /** Repeated in the query string: `?statuses=1&statuses=4`. */
  statuses?: BookingStatus[];
  /** Inclusive branch working days (`yyyy-MM-dd`); `dateTo` must be >= `dateFrom`. */
  dateFrom?: string;
  dateTo?: string;
  /** 0 (Waiting) is a real filter — omit the field for "all bookings". */
  refundStatus?: RefundStatus;
  /** Booking number (`#OD-000482`, `OD-000482` or `482`), customer name or phone. */
  search?: string;
  /**
   * Only this customer's bookings (the "All bookings" link of the customer profile). Also narrows
   * `meta.additionalData` to that customer.
   */
  customerId?: number;
}

export interface BookingDetailsItem extends BookingItemName {
  /** Duration at booking time. */
  durationMinutes: number;
  /** Price at booking time. */
  price: number;
}

export interface BookingDetailsPayment extends BookingListPayment {
  subtotal: number;
}

export interface BookingDetailsCustomer extends BookingCustomerSummary {
  /** For the "Customer profile" link. */
  id: number;
  /** Completed bookings, across all branches. */
  visitsCount: number;
  /** "Missed" bookings, across all branches. */
  noShowCount: number;
}

/** CancellationReasonEnum — why a CUSTOMER cancelled from the app (may be null). */
export enum CancelReason {
  ChangeOfPlans = 0,
  BookedByMistake = 1,
  WantAnotherTime = 2,
  Other = 3,
}

/** Set for Cancelled bookings only. */
export interface BookingCancellation {
  /** UTC ISO (an audit timestamp, unlike the salon-local `startAt`). */
  cancelledAt: string;
  /** true = staff cancelled it (show `note` and `cancelledByName`); false = the customer did. */
  cancelledByBranch: boolean;
  /** The staff member who cancelled; null when the customer did. */
  cancelledByName: string | null;
  /** Customer cancellations only (may be null). */
  reason: CancelReason | null;
  /** The reason the staff wrote — branch cancellations only. */
  note: string | null;
}

/** What the admin may do with the booking right now — computed by the server. */
export interface BookingActions {
  /** Shows "End session" (Complete Booking) and "Missed" (Mark Booking No-Show). */
  canComplete: boolean;
  /** Shows "Refund sent" (Mark Booking Refunded): a refund is owed (`refund.status` is Waiting). */
  canMarkRefunded: boolean;
  /** Shows "Cancel booking": PendingReview / Confirmed and not ended yet. */
  canCancel: boolean;
  /** Shows "Change barber" (Reassign Booking Barber): PendingReview / Confirmed and not ended yet. */
  canReassign: boolean;
}

/** GET /bookings/{id} (404 when the booking doesn't exist). */
export interface BookingDetails {
  id: number;
  bookingNumber: string;
  status: BookingStatus;
  isInProgress: boolean;
  type: BookingType;
  /** Salon-local, no offset. */
  startAt: string;
  /** Sum of the services' durations. */
  durationMinutes: number;
  /** `id` is what "Change barber" excludes and sends; `averageRating` is null until the barber has reviews. */
  barber: { id: number; fullName: string; averageRating: number | null };
  /** Null for Home bookings. */
  chair: { id: number; name: string } | null;
  /** `id` is the branch whose barbers "Change barber" lists. */
  branch: { id: number; nameAr: string; nameEn: string };
  /** Home bookings only. The contract only shows `null`; read as free text. */
  homeAddress: string | null;
  items: BookingDetailsItem[];
  payment: BookingDetailsPayment;
  customer: BookingDetailsCustomer;
  refund: BookingRefund | null;
  /** Cancelled bookings only. */
  cancellation: BookingCancellation | null;
  actions: BookingActions;
}
