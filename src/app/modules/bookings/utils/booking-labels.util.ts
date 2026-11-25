import { StatusBadgeVariant } from "@shared/components/status-badge/status-badge.component";
import {
  BookingItemName,
  BookingStatus,
  BookingType,
  CancelReason,
  PaymentMethod,
  RefundStatus,
} from "../model/booking.model";

/**
 * i18n keys and badge variants for the booking enums. An unknown value (a status the backend adds
 * later) maps to an `UNKNOWN` label and a neutral badge instead of showing a raw key or `undefined`.
 */

const STATUS_KEYS: Record<BookingStatus, string> = {
  [BookingStatus.PendingReview]: "BOOKINGS.STATUS.PENDING_REVIEW",
  [BookingStatus.Confirmed]: "BOOKINGS.STATUS.CONFIRMED",
  [BookingStatus.Rejected]: "BOOKINGS.STATUS.REJECTED",
  [BookingStatus.Expired]: "BOOKINGS.STATUS.EXPIRED",
  [BookingStatus.Completed]: "BOOKINGS.STATUS.COMPLETED",
  [BookingStatus.NoShow]: "BOOKINGS.STATUS.NO_SHOW",
  [BookingStatus.Cancelled]: "BOOKINGS.STATUS.CANCELLED",
};

const STATUS_VARIANTS: Record<BookingStatus, StatusBadgeVariant> = {
  [BookingStatus.PendingReview]: "warning",
  [BookingStatus.Confirmed]: "success",
  [BookingStatus.Rejected]: "danger",
  [BookingStatus.Expired]: "neutral",
  [BookingStatus.Completed]: "neutral",
  [BookingStatus.NoShow]: "danger",
  [BookingStatus.Cancelled]: "danger",
};

/** Every booking status, in lifecycle order (filter options, tests). */
export const BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.PendingReview,
  BookingStatus.Confirmed,
  BookingStatus.Completed,
  BookingStatus.Rejected,
  BookingStatus.Expired,
  BookingStatus.NoShow,
  BookingStatus.Cancelled,
];

/** "Started" replaces the status while `isInProgress` is true. */
export function bookingStatusKey(status: BookingStatus, isInProgress = false): string {
  if (isInProgress) return "BOOKINGS.STATUS.STARTED";
  return STATUS_KEYS[status] ?? "BOOKINGS.STATUS.UNKNOWN";
}

export function bookingStatusVariant(
  status: BookingStatus,
  isInProgress = false,
): StatusBadgeVariant {
  if (isInProgress) return "info";
  return STATUS_VARIANTS[status] ?? "neutral";
}

const TYPE_KEYS: Record<BookingType, string> = {
  [BookingType.Regular]: "BOOKINGS.TYPE.REGULAR",
  [BookingType.Vip]: "BOOKINGS.TYPE.VIP",
  [BookingType.Home]: "BOOKINGS.TYPE.HOME",
};

const TYPE_VARIANTS: Record<BookingType, StatusBadgeVariant> = {
  [BookingType.Regular]: "neutral",
  [BookingType.Vip]: "vip",
  [BookingType.Home]: "info",
};

export const BOOKING_TYPES: readonly BookingType[] = [
  BookingType.Regular,
  BookingType.Vip,
  BookingType.Home,
];

export function bookingTypeKey(type: BookingType): string {
  return TYPE_KEYS[type] ?? "BOOKINGS.TYPE.UNKNOWN";
}

export function bookingTypeVariant(type: BookingType): StatusBadgeVariant {
  return TYPE_VARIANTS[type] ?? "neutral";
}

const METHOD_KEYS: Record<PaymentMethod, string> = {
  [PaymentMethod.InstaPay]: "BOOKINGS.PAYMENT_METHOD.INSTAPAY",
  [PaymentMethod.MobileWallet]: "BOOKINGS.PAYMENT_METHOD.WALLET",
};

const METHOD_ICONS: Record<PaymentMethod, string> = {
  [PaymentMethod.InstaPay]: "pi pi-at",
  [PaymentMethod.MobileWallet]: "pi pi-mobile",
};

export function paymentMethodKey(method: PaymentMethod): string {
  return METHOD_KEYS[method] ?? "BOOKINGS.PAYMENT_METHOD.UNKNOWN";
}

/** Same icons as the branch payment-methods form (`pi-at` InstaPay, `pi-mobile` wallet). */
export function paymentMethodIcon(method: PaymentMethod): string {
  return METHOD_ICONS[method] ?? "pi pi-wallet";
}

const REFUND_KEYS: Record<RefundStatus, string> = {
  [RefundStatus.Waiting]: "BOOKINGS.REFUND.WAITING",
  [RefundStatus.Sent]: "BOOKINGS.REFUND.SENT",
};

const REFUND_VARIANTS: Record<RefundStatus, StatusBadgeVariant> = {
  [RefundStatus.Waiting]: "warning",
  [RefundStatus.Sent]: "success",
};

export function refundStatusKey(status: RefundStatus): string {
  return REFUND_KEYS[status] ?? "BOOKINGS.REFUND.UNKNOWN";
}

export function refundStatusVariant(status: RefundStatus): StatusBadgeVariant {
  return REFUND_VARIANTS[status] ?? "neutral";
}

const CANCEL_REASON_KEYS: Record<CancelReason, string> = {
  [CancelReason.ChangeOfPlans]: "BOOKINGS.CANCEL_REASON.CHANGE_OF_PLANS",
  [CancelReason.BookedByMistake]: "BOOKINGS.CANCEL_REASON.BOOKED_BY_MISTAKE",
  [CancelReason.WantAnotherTime]: "BOOKINGS.CANCEL_REASON.WANT_ANOTHER_TIME",
  [CancelReason.Other]: "BOOKINGS.CANCEL_REASON.OTHER",
};

/** Why a customer cancelled; an unknown reason maps to `UNKNOWN`. */
export function cancelReasonKey(reason: CancelReason): string {
  return CANCEL_REASON_KEYS[reason] ?? "BOOKINGS.CANCEL_REASON.UNKNOWN";
}

/** One service name for the active UI language, falling back to the other if it is empty. */
export function localizedItemName(item: BookingItemName, lang: string): string {
  return lang === "ar" ? item.nameAr || item.nameEn : item.nameEn || item.nameAr;
}

/** "Haircut, Beard trim" / "حلاقة، تحديد لحية" — the booking's services on one line. */
export function bookingItemsLabel(items: BookingItemName[], lang: string): string {
  return items
    .map((i) => localizedItemName(i, lang))
    .filter(Boolean)
    .join(lang === "ar" ? "، " : ", ");
}
