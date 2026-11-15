import { describe, expect, it } from "vitest";

import ar from "../../../../assets/i18n/ar.json";
import en from "../../../../assets/i18n/en.json";
import { BookingStatus, BookingType, PaymentMethod, RefundStatus } from "../model/booking.model";
import {
  BOOKING_STATUSES,
  BOOKING_TYPES,
  bookingItemsLabel,
  bookingStatusKey,
  bookingStatusVariant,
  bookingTypeKey,
  bookingTypeVariant,
  localizedItemName,
  paymentMethodIcon,
  paymentMethodKey,
  refundStatusKey,
  refundStatusVariant,
} from "./booking-labels.util";

function resolve(tree: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], tree);
}

describe("booking label keys exist in both languages", () => {
  const keys = [
    ...BOOKING_STATUSES.map((s) => bookingStatusKey(s)),
    bookingStatusKey(BookingStatus.Confirmed, true),
    bookingStatusKey(99 as BookingStatus),
    ...BOOKING_TYPES.map(bookingTypeKey),
    bookingTypeKey(99 as BookingType),
    paymentMethodKey(PaymentMethod.InstaPay),
    paymentMethodKey(PaymentMethod.MobileWallet),
    paymentMethodKey(99 as PaymentMethod),
    refundStatusKey(RefundStatus.Waiting),
    refundStatusKey(RefundStatus.Sent),
    refundStatusKey(99 as RefundStatus),
  ];

  it.each(keys)("%s", (key) => {
    expect(typeof resolve(en, key), `en ${key}`).toBe("string");
    expect(typeof resolve(ar, key), `ar ${key}`).toBe("string");
  });

  it("covers every booking status", () => {
    expect(new Set(BOOKING_STATUSES).size).toBe(7);
  });
});

describe("bookingStatusKey / bookingStatusVariant", () => {
  it("maps each status to its own label", () => {
    expect(bookingStatusKey(BookingStatus.PendingReview)).toBe("BOOKINGS.STATUS.PENDING_REVIEW");
    expect(bookingStatusKey(BookingStatus.NoShow)).toBe("BOOKINGS.STATUS.NO_SHOW");
    expect(bookingStatusKey(BookingStatus.Cancelled)).toBe("BOOKINGS.STATUS.CANCELLED");
  });

  it("shows 'Started' (info) while the booking is in progress", () => {
    expect(bookingStatusKey(BookingStatus.Confirmed, true)).toBe("BOOKINGS.STATUS.STARTED");
    expect(bookingStatusVariant(BookingStatus.Confirmed, true)).toBe("info");
    expect(bookingStatusVariant(BookingStatus.Confirmed, false)).toBe("success");
  });

  it("colours the lifecycle: waiting warns, bad outcomes are red, done is neutral", () => {
    expect(bookingStatusVariant(BookingStatus.PendingReview)).toBe("warning");
    expect(bookingStatusVariant(BookingStatus.Rejected)).toBe("danger");
    expect(bookingStatusVariant(BookingStatus.NoShow)).toBe("danger");
    expect(bookingStatusVariant(BookingStatus.Cancelled)).toBe("danger");
    expect(bookingStatusVariant(BookingStatus.Completed)).toBe("neutral");
    expect(bookingStatusVariant(BookingStatus.Expired)).toBe("neutral");
  });

  it("answers an unknown status with the Unknown label and a neutral badge", () => {
    expect(bookingStatusKey(42 as BookingStatus)).toBe("BOOKINGS.STATUS.UNKNOWN");
    expect(bookingStatusVariant(42 as BookingStatus)).toBe("neutral");
  });
});

describe("type, payment method and refund", () => {
  it("styles VIP as vip and Home as info", () => {
    expect(bookingTypeVariant(BookingType.Vip)).toBe("vip");
    expect(bookingTypeVariant(BookingType.Home)).toBe("info");
    expect(bookingTypeVariant(BookingType.Regular)).toBe("neutral");
    expect(bookingTypeKey(7 as BookingType)).toBe("BOOKINGS.TYPE.UNKNOWN");
  });

  it("uses the same icons as the branch payment form", () => {
    expect(paymentMethodIcon(PaymentMethod.InstaPay)).toBe("pi pi-at");
    expect(paymentMethodIcon(PaymentMethod.MobileWallet)).toBe("pi pi-mobile");
    expect(paymentMethodIcon(9 as PaymentMethod)).toBe("pi pi-wallet");
  });

  it("warns on a refund still owed and confirms one that was sent", () => {
    expect(refundStatusVariant(RefundStatus.Waiting)).toBe("warning");
    expect(refundStatusVariant(RefundStatus.Sent)).toBe("success");
    expect(refundStatusVariant(9 as RefundStatus)).toBe("neutral");
  });
});

describe("booking items", () => {
  const haircut = { nameAr: "حلاقة", nameEn: "Haircut" };
  const beard = { nameAr: "تحديد لحية", nameEn: "Beard trim" };

  it("picks the name for the UI language", () => {
    expect(localizedItemName(haircut, "en")).toBe("Haircut");
    expect(localizedItemName(haircut, "ar")).toBe("حلاقة");
  });

  it("falls back to the other language when a name is empty", () => {
    expect(localizedItemName({ nameAr: "", nameEn: "Wash" }, "ar")).toBe("Wash");
    expect(localizedItemName({ nameAr: "غسيل", nameEn: "" }, "en")).toBe("غسيل");
  });

  it("joins the services on one line with the language's separator", () => {
    expect(bookingItemsLabel([haircut, beard], "en")).toBe("Haircut, Beard trim");
    expect(bookingItemsLabel([haircut, beard], "ar")).toBe("حلاقة، تحديد لحية");
    expect(bookingItemsLabel([], "en")).toBe("");
  });
});
