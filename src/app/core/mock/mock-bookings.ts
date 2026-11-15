import {
  BookingStatus,
  BookingType,
  PaymentMethod,
  RefundStatus,
} from "@modules/bookings/model/booking.model";
import { ChairType } from "@modules/chairs/model/chair.model";
import {
  addMinutesToStartAt,
  cairoNow,
  cairoStartAt,
} from "@modules/bookings/utils/booking-dates.util";
import { addDays, cairoToday } from "../../modules/offers/utils/offer-dates.util";
import type {
  MockBarber,
  MockBooking,
  MockBranch,
  MockChair,
  MockCustomer,
  MockService,
} from "./mock-db";

/**
 * Seed data and business rules for the mock bookings. Everything here is a pure function of the
 * stored {@link MockBooking} rows and "now" (in Cairo), so the mock keeps moving like the real
 * backend: unreviewed bookings expire at their start time, open confirmed ones complete 2 hours
 * after they end, and a barber's "upcoming bookings" are whatever is still pending / confirmed and
 * not over.
 */

/** "Review time 30 min": a proof waiting this long (or more) is late. */
export const REVIEW_TARGET_MINUTES = 30;

/** Confirmed bookings left open are completed automatically this long after they end. */
export const AUTO_COMPLETE_AFTER_MINUTES = 120;

const FIRST_BOOKING_ID = 401;
const FIRST_CUSTOMER_ID = 1001;
const MINUTE = 60_000;

// ============================================================
// Derived values
// ============================================================

export function bookingNumberOf(id: number): string {
  return `OD-${String(id).padStart(6, "0")}`;
}

export function bookingTotal(b: MockBooking): number {
  return b.items.reduce((sum, item) => sum + item.price, 0);
}

/** Sum of the services' durations. */
export function bookingDuration(b: MockBooking): number {
  return b.items.reduce((sum, item) => sum + item.durationMinutes, 0);
}

/** Cairo wall clock of the end of the booking (`startAt` + the services' duration). */
export function bookingEndAt(b: MockBooking): string {
  return addMinutesToStartAt(b.startAt, bookingDuration(b)) ?? b.startAt;
}

/** Pending or confirmed. */
export function isOpenBooking(b: MockBooking): boolean {
  return b.status === BookingStatus.PendingReview || b.status === BookingStatus.Confirmed;
}

/** Pending / confirmed and not over yet — the bookings that keep a present barber from leaving. */
export function isUpcomingBooking(b: MockBooking, now: Date): boolean {
  return isOpenBooking(b) && bookingEndAt(b) > cairoNow(now);
}

/** Confirmed and between its start and its end — shown as "Started". */
export function isBookingInProgress(b: MockBooking, now: Date): boolean {
  const clock = cairoNow(now);
  return b.status === BookingStatus.Confirmed && b.startAt <= clock && clock < bookingEndAt(b);
}

/** What the server allows: "End session" only for a Confirmed booking that has started. */
export function canCompleteBooking(b: MockBooking, now: Date): boolean {
  return b.status === BookingStatus.Confirmed && b.startAt <= cairoNow(now);
}

/** Refund still owed — the "Waiting" counter and the "Refund sent" action. */
export function isRefundWaiting(b: MockBooking): boolean {
  return b.refund?.status === RefundStatus.Waiting;
}

/** Whole minutes the payment proof has been waiting for a review (0 or more). */
export function waitingMinutesOf(b: MockBooking, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(b.submittedAt).getTime()) / MINUTE));
}

/** Pending / confirmed bookings of one barber that haven't ended. */
export function upcomingBookingsCount(
  bookings: readonly MockBooking[],
  barberId: number,
  now: Date,
): number {
  return bookings.filter((b) => b.barberId === barberId && isUpcomingBooking(b, now)).length;
}

/** Completed / missed bookings of a customer, across all branches (the details "Customer" card). */
export function customerStats(
  bookings: readonly MockBooking[],
  customerId: number,
): { visitsCount: number; noShowCount: number } {
  const mine = bookings.filter((b) => b.customerId === customerId);
  return {
    visitsCount: mine.filter((b) => b.status === BookingStatus.Completed).length,
    noShowCount: mine.filter((b) => b.status === BookingStatus.NoShow).length,
  };
}

/** The Cairo calendar day of a UTC instant (`yyyy-MM-dd`). */
export function cairoDayOf(iso: string): string {
  return cairoToday(new Date(iso));
}

// ============================================================
// Time-driven status changes
// ============================================================

/**
 * Applies what the backend does on its own, in place:
 * - a booking nobody reviewed before its start time EXPIRES, and the customer is owed a full refund;
 * - a Confirmed booking left open is COMPLETED 2 hours after it ends.
 */
export function settleBookings(bookings: MockBooking[], now: Date): void {
  const clock = cairoNow(now);
  for (const b of bookings) {
    if (b.status === BookingStatus.PendingReview && b.startAt <= clock) {
      b.status = BookingStatus.Expired;
      b.refund = { status: RefundStatus.Waiting, amount: bookingTotal(b), feeAmount: null };
    } else if (b.status === BookingStatus.Confirmed) {
      const done = addMinutesToStartAt(bookingEndAt(b), AUTO_COMPLETE_AFTER_MINUTES);
      if (done !== null && done <= clock) b.status = BookingStatus.Completed;
    }
  }
}

// ============================================================
// Payment proof (a generated "transfer receipt" image)
// ============================================================

const METHOD_LABEL: Record<PaymentMethod, string> = {
  [PaymentMethod.InstaPay]: "InstaPay transfer",
  [PaymentMethod.MobileWallet]: "Mobile wallet transfer",
};

const METHOD_COLOR: Record<PaymentMethod, string> = {
  [PaymentMethod.InstaPay]: "#0f766e",
  [PaymentMethod.MobileWallet]: "#b45309",
};

/**
 * A receipt-style image as a `data:` URL (works offline, no files to serve). The amount on it is the
 * booking total minus `proofShortfall`, so a "wrong amount" proof can be reviewed and rejected.
 */
export function paymentProofUrl(b: MockBooking, branch: MockBranch | undefined): string {
  const sent = bookingTotal(b) - b.proofShortfall;
  const slug = (branch?.nameEn ?? "branch").toLowerCase().replace(/[^a-z0-9]/g, "");
  const target =
    b.paymentMethod === PaymentMethod.InstaPay
      ? (branch?.instaPayAccount ?? `odel.${slug}@instapay`)
      : (branch?.walletNumber ?? "+201012345678");
  const reference = String(b.id * 7919).padStart(10, "0");
  const color = METHOD_COLOR[b.paymentMethod] ?? "#475569";
  const label = METHOD_LABEL[b.paymentMethod] ?? "Transfer";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="520" viewBox="0 0 360 520" font-family="Arial, sans-serif">
<rect width="360" height="520" fill="#f1f5f9"/>
<rect x="16" y="16" width="328" height="488" rx="16" fill="#ffffff"/>
<rect x="16" y="16" width="328" height="84" rx="16" fill="${color}"/>
<rect x="16" y="76" width="328" height="24" fill="${color}"/>
<text x="180" y="52" text-anchor="middle" font-size="18" font-weight="700" fill="#ffffff">${label}</text>
<text x="180" y="78" text-anchor="middle" font-size="13" fill="#ffffff" opacity="0.85">Transfer successful</text>
<text x="180" y="156" text-anchor="middle" font-size="13" fill="#64748b">Amount sent</text>
<text x="180" y="196" text-anchor="middle" font-size="36" font-weight="700" fill="#0f172a">EGP ${sent.toFixed(2)}</text>
<line x1="40" y1="228" x2="320" y2="228" stroke="#e2e8f0"/>
<text x="40" y="262" font-size="12" fill="#64748b">To</text>
<text x="40" y="284" font-size="15" font-weight="600" fill="#0f172a">${target}</text>
<text x="40" y="326" font-size="12" fill="#64748b">Reference</text>
<text x="40" y="348" font-size="15" font-weight="600" fill="#0f172a">${reference}</text>
<text x="40" y="390" font-size="12" fill="#64748b">Date</text>
<text x="40" y="412" font-size="15" font-weight="600" fill="#0f172a">${b.startAt.slice(0, 10)}</text>
<text x="180" y="468" text-anchor="middle" font-size="11" fill="#94a3b8">Sample receipt generated for the mock backend</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ============================================================
// Seed
// ============================================================

/** What the seed reads from the database (it must be built after these are). */
export interface BookingSeedSource {
  branches: MockBranch[];
  barbers: MockBarber[];
  chairs: MockChair[];
  services: MockService[];
}

const CUSTOMERS: Array<[string, string]> = [
  ["Ahmed Hassan", "+201001234567"],
  ["Nader Samir", "+201223091144"],
  ["Adam Roshdy", "+201006651200"],
  ["Khaled Tarek", "+201017772310"],
  ["Hesham Yousry", "+201145558821"],
  ["Omar Fawzy", "+201090011223"],
  ["Tarek Anwar", "+201112223344"],
  ["Yassin Maged", "+201551234567"],
  ["Karim Sherif", "+201066778899"],
  ["Ziad Hany", "+201277889900"],
  ["Mazen Ayman", "+201033445566"],
  ["Hazem Saleh", "+201588990011"],
];

const HOME_ADDRESSES = [
  "14 Al Nozha St, Heliopolis, Cairo — building 3, floor 5",
  "27 Mostafa El Nahas St, Nasr City, Cairo — apt 12",
  "Villa 41, Street 9, Fifth Settlement, New Cairo",
  "9 Road 233, Degla, Maadi, Cairo — floor 2",
];

/** Default text of a rejection (the customer sees it). */
const DEFAULT_REJECT_REASON = "The transferred amount doesn't match the booking total.";

interface SeedRow {
  /** Minutes from now (negative = earlier), or `"<days>@HH:mm"` for another day. */
  when: number | string;
  /** Index among the branch's ACTIVE barbers. */
  barber: number;
  type: BookingType;
  status: BookingStatus;
  /** Service ids (1-based position in the services seed). */
  services: number[];
  method: PaymentMethod;
  /** Index into the customers list. */
  customer: number;
  /** PendingReview: minutes since the proof was sent. */
  waiting?: number;
  /** Minutes since an admin approved it. */
  approvedAgo?: number;
  /** Minutes since an admin rejected it. */
  rejectedAgo?: number;
  reason?: string;
  /** Refund state for Cancelled / Expired / NoShow. */
  refund?: RefundStatus;
  /** The proof shows this much less than the total. */
  short?: number;
}

const R = BookingType.Regular;
const V = BookingType.Vip;
const H = BookingType.Home;
const PR = BookingStatus.PendingReview;
const CF = BookingStatus.Confirmed;
const RJ = BookingStatus.Rejected;
const EX = BookingStatus.Expired;
const CP = BookingStatus.Completed;
const NS = BookingStatus.NoShow;
const CN = BookingStatus.Cancelled;
const INSTA = PaymentMethod.InstaPay;
const WALLET = PaymentMethod.MobileWallet;
const WAITING = RefundStatus.Waiting;
const SENT = RefundStatus.Sent;

const row = (
  when: number | string,
  barber: number,
  type: BookingType,
  status: BookingStatus,
  services: number[],
  method: PaymentMethod,
  customer: number,
  extra: Partial<SeedRow> = {},
): SeedRow => ({ when, barber, type, status, services, method, customer, ...extra });

const DAY = 24 * 60;

/**
 * Branch 1 (the one the pages open on) has 42 bookings: 5 waiting for a review (two of them late,
 * one with a proof for LESS than the total), 2 approved and 1 rejected today, one in progress, and a
 * history of completed / cancelled / missed / expired / rejected ones. Its second barber has no
 * upcoming bookings, so attendance can be toggled freely for them.
 */
const SEED: ReadonlyArray<[number, SeedRow[]]> = [
  [
    1,
    [
      // Waiting for a payment review (barbers 0 and 2)
      row(45, 0, R, PR, [1, 2], INSTA, 0, { waiting: 12 }),
      row(90, 2, V, PR, [1, 3], WALLET, 1, { waiting: 39 }),
      row(150, 0, R, PR, [1], INSTA, 2, { waiting: 5 }),
      row(240, 2, R, PR, [10], WALLET, 3, { waiting: 55 }),
      row(330, 0, V, PR, [9], INSTA, 4, { waiting: 20, short: 40 }),
      // Confirmed, still to come (two of them approved today)
      row(60, 0, V, CF, [1, 2], INSTA, 5, { approvedAgo: 100 }),
      row(120, 2, R, CF, [1], WALLET, 6, { approvedAgo: 45 }),
      row("1@11:00", 0, R, CF, [4], INSTA, 7),
      row("1@14:30", 2, V, CF, [5, 3], WALLET, 8),
      // In progress right now (45 min, started 25 min ago)
      row(-25, 2, R, CF, [1, 2], INSTA, 9),
      // Earlier today
      row(-150, 1, R, CP, [1], INSTA, 10),
      row(-240, 0, R, CP, [10], WALLET, 0),
      row(-300, 1, R, NS, [1], WALLET, 1, { refund: WAITING }),
      row(-420, 2, V, CP, [1, 2], INSTA, 2),
      // History
      row("-1@10:30", 1, R, CP, [1], INSTA, 3),
      row("-1@12:00", 0, V, CP, [1, 2], WALLET, 4),
      row("-1@13:30", 2, R, CP, [2, 3], INSTA, 5),
      row("-1@15:00", 1, R, CN, [1], INSTA, 6, { refund: SENT }),
      row("-1@17:00", 0, R, NS, [1, 2], WALLET, 7, { refund: SENT }),
      row("-1@19:00", 2, V, CP, [5], INSTA, 8),
      row("-2@11:00", 1, R, CP, [4], WALLET, 9),
      row("-2@13:00", 0, R, EX, [1], INSTA, 10, { refund: WAITING }),
      row("-2@15:30", 2, V, CP, [1], INSTA, 11),
      row("-2@18:00", 1, R, RJ, [10], WALLET, 0, { rejectedAgo: 2 * DAY, short: 30 }),
      row("-3@10:00", 0, R, CP, [9], INSTA, 1),
      row("-3@12:30", 1, V, CN, [1, 3], WALLET, 2, { refund: WAITING }),
      row("-3@16:00", 2, R, CP, [1, 2], INSTA, 3),
      row("-4@11:30", 1, R, CP, [3], INSTA, 4),
      row("-4@14:00", 0, V, NS, [1], WALLET, 5, { refund: WAITING }),
      row("-4@17:30", 2, R, CP, [10], INSTA, 6),
      row("-5@10:30", 1, R, CP, [1, 2], WALLET, 7),
      row("-5@13:00", 0, R, EX, [2], INSTA, 8, { refund: SENT }),
      row("-5@15:00", 2, V, CP, [5], INSTA, 9),
      row("-6@12:00", 1, R, CN, [1], INSTA, 10, { refund: SENT }),
      row("-6@16:00", 0, R, CP, [4], WALLET, 11),
      row("-7@11:00", 2, R, RJ, [1], INSTA, 0, { rejectedAgo: 7 * DAY }),
      row("-7@14:30", 1, V, CP, [1, 2], INSTA, 1),
      row("-8@10:00", 0, R, CP, [3], WALLET, 2),
      row("-8@13:30", 2, R, CN, [10], INSTA, 3, { refund: WAITING }),
      row("-9@12:00", 1, R, EX, [1], WALLET, 4, { refund: WAITING }),
      row("-10@15:00", 0, R, CP, [1], INSTA, 5),
      // Rejected today (a future booking whose proof was wrong)
      row(200, 1, R, RJ, [1], INSTA, 6, {
        rejectedAgo: 30,
        short: 60,
        reason: DEFAULT_REJECT_REASON,
      }),
    ],
  ],
  [
    2,
    [
      row(75, 0, R, PR, [1, 2], INSTA, 3, { waiting: 8 }),
      row(180, 1, V, CF, [1], WALLET, 4, { approvedAgo: 60 }),
      row(-200, 2, R, CP, [1], INSTA, 5),
      row("-1@12:00", 3, R, CN, [1], INSTA, 6, { refund: WAITING }),
      row("-2@16:00", 0, V, NS, [1, 2], WALLET, 7, { refund: SENT }),
      row("-3@11:00", 1, R, CP, [4], INSTA, 8),
    ],
  ],
  [
    3,
    [
      row(100, 0, H, PR, [1], WALLET, 9, { waiting: 44 }),
      row(210, 1, R, CF, [1, 2], INSTA, 10, { approvedAgo: 30 }),
      row(50, 2, V, CF, [5], INSTA, 11, { approvedAgo: 200 }),
      row("1@13:00", 3, H, CF, [4], WALLET, 0),
      row(-90, 4, R, CP, [10], INSTA, 1),
      row("-1@15:00", 0, H, CN, [1], INSTA, 2, { refund: SENT }),
      row("-2@12:00", 5, R, EX, [1], WALLET, 3, { refund: WAITING }),
    ],
  ],
  [
    4,
    [
      row(130, 0, H, PR, [7], INSTA, 4, { waiting: 15, short: 50 }),
      row("-1@11:30", 1, R, CP, [1], WALLET, 5),
      row("-2@14:00", 2, H, NS, [9], INSTA, 6, { refund: WAITING }),
      row(300, 1, R, CF, [3], INSTA, 7, { approvedAgo: 15 }),
    ],
  ],
  [
    5,
    [
      row(95, 0, V, PR, [1], WALLET, 8, { waiting: 31 }),
      row("1@16:00", 1, R, CF, [1, 2], INSTA, 9),
      row(-120, 2, H, CP, [1], WALLET, 10),
    ],
  ],
];

/** Wall-clock `startAt` of a seed row: minutes from now, or `"<days>@HH:mm"`. */
function startAtOf(when: number | string, now: Date): string {
  if (typeof when === "number") return cairoStartAt(when, now);
  const [days, time] = when.split("@");
  return `${addDays(cairoToday(now), Number(days))}T${time}:00`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Builds the customers and bookings the mock starts with. Must run after the branches, barbers,
 * chairs and services exist. Rows that don't fit the data (an unknown branch, a branch with no
 * active barber) are skipped, never half-built.
 */
export function buildMockBookingSeed(
  db: BookingSeedSource,
  now: Date,
): { customers: MockCustomer[]; bookings: MockBooking[] } {
  const customers: MockCustomer[] = CUSTOMERS.map(([fullName, phoneNumber], index) => ({
    id: FIRST_CUSTOMER_ID + index,
    fullName,
    phoneNumber,
  }));

  const bookings: MockBooking[] = [];
  let nextId = FIRST_BOOKING_ID;
  let homeIndex = 0;

  for (const [branchId, rows] of SEED) {
    const branch = db.branches.find((b) => b.id === branchId);
    const barbers = db.barbers.filter((b) => b.branchId === branchId && b.isActive);
    if (!branch || !barbers.length) continue;

    for (const seedRow of rows) {
      const barber = barbers[seedRow.barber % barbers.length];

      const items = seedRow.services.flatMap((serviceId) => {
        const service = db.services.find((s) => s.id === serviceId);
        if (!service) return [];
        const prices = service.prices.find((p) => p.branchId === branchId) ?? service.prices[0];
        if (!prices) return [];
        const price =
          seedRow.type === BookingType.Vip
            ? prices.vipPrice
            : seedRow.type === BookingType.Home
              ? (prices.homePrice ?? prices.regularPrice)
              : prices.regularPrice;
        return [
          {
            serviceId,
            nameAr: service.nameAr,
            nameEn: service.nameEn,
            durationMinutes: prices.durationMinutes,
            price,
          },
        ];
      });
      if (!items.length) continue;

      const chairs = db.chairs.filter(
        (c) =>
          c.branchId === branchId &&
          c.isActive &&
          c.type === (seedRow.type === BookingType.Vip ? ChairType.Vip : ChairType.Regular),
      );
      const chair =
        seedRow.type === BookingType.Home ? null : (chairs[seedRow.barber % chairs.length] ?? null);

      const id = nextId++;
      const total = items.reduce((sum, item) => sum + item.price, 0);
      const ago = (minutes: number): string =>
        new Date(now.getTime() - minutes * MINUTE).toISOString();

      let refund: MockBooking["refund"] = null;
      if (seedRow.refund !== undefined) {
        const fee = seedRow.status === NS ? round2(total * 0.2) : null;
        refund = { status: seedRow.refund, amount: round2(total - (fee ?? 0)), feeAmount: fee };
      }

      const approved =
        seedRow.status === CF ||
        seedRow.status === CP ||
        seedRow.status === NS ||
        seedRow.status === CN;

      bookings.push({
        id,
        bookingNumber: bookingNumberOf(id),
        branchId,
        barberId: barber.id,
        chairId: chair?.id ?? null,
        customerId: customers[seedRow.customer % customers.length].id,
        type: seedRow.type,
        status: seedRow.status,
        startAt: startAtOf(seedRow.when, now),
        items,
        paymentMethod: seedRow.method,
        proofShortfall: seedRow.short ?? 0,
        homeAddress:
          seedRow.type === BookingType.Home
            ? HOME_ADDRESSES[homeIndex++ % HOME_ADDRESSES.length]
            : null,
        submittedAt:
          seedRow.waiting !== undefined
            ? ago(seedRow.waiting)
            : ago((seedRow.approvedAgo ?? seedRow.rejectedAgo ?? 3 * DAY) + 20),
        approvedAt: approved ? ago(seedRow.approvedAgo ?? 2 * DAY) : null,
        rejectedAt: seedRow.status === RJ ? ago(seedRow.rejectedAgo ?? 2 * DAY) : null,
        rejectionReason: seedRow.status === RJ ? (seedRow.reason ?? DEFAULT_REJECT_REASON) : null,
        refund,
      });
    }
  }

  return { customers, bookings };
}

// ============================================================
// Test helper
// ============================================================

/**
 * `count` Confirmed bookings of one barber that start in the next hours — for tests that need a
 * barber with upcoming bookings (assign it to `db.bookings`).
 */
export function upcomingBookingsFor(barberId: number, count: number, branchId = 1): MockBooking[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => ({
    id: 900_000 + barberId * 100 + i,
    bookingNumber: bookingNumberOf(900_000 + barberId * 100 + i),
    branchId,
    barberId,
    chairId: null,
    customerId: FIRST_CUSTOMER_ID,
    type: BookingType.Regular,
    status: BookingStatus.Confirmed,
    startAt: cairoStartAt(60 * (i + 1), now),
    items: [{ serviceId: 1, nameAr: "قص شعر", nameEn: "Haircut", durationMinutes: 30, price: 100 }],
    paymentMethod: PaymentMethod.InstaPay,
    proofShortfall: 0,
    homeAddress: null,
    submittedAt: now.toISOString(),
    approvedAt: now.toISOString(),
    rejectedAt: null,
    rejectionReason: null,
    refund: null,
  }));
}
