import { TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Observable, firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../assets/i18n/en.json";
import { MockDb } from "@core/mock/mock-db";
import { BarberMockRepository } from "../barbers/repository/barber-mock.repository";
import { PaymentReviewMockRepository } from "../payment-reviews/repository/payment-review-mock.repository";
import { BookingStatus } from "./model/booking.model";
import { BookingMockRepository } from "./repository/booking-mock.repository";

// 12:00 in Cairo (UTC+2 in November).
const NOW = new Date("2026-11-13T10:00:00Z");

/**
 * The mock bookings, the payment-review queue and the barbers' attendance share ONE database: what
 * one screen does must show up on the others.
 */
describe("bookings, payment reviews and attendance share one database", () => {
  let bookings: BookingMockRepository;
  let reviews: PaymentReviewMockRepository;
  let barbers: BarberMockRepository;
  let db: MockDb;

  async function settle<T>(obs: Observable<T>): Promise<T> {
    const result = firstValueFrom(obs);
    result.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1000);
    return result;
  }

  const attendanceRow = async (barberId: number) =>
    (await settle(barbers.getAttendance(1))).data!.find((r) => r.barberId === barberId)!;
  const detailsOf = async (id: number) => (await settle(bookings.getBookingById(id))).data!;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation("en", en);
    translate.use("en");
    bookings = TestBed.inject(BookingMockRepository);
    reviews = TestBed.inject(PaymentReviewMockRepository);
    barbers = TestBed.inject(BarberMockRepository);
    db = TestBed.inject(MockDb);
  });

  afterEach(() => vi.useRealTimers());

  it("approving a review shows the booking as Confirmed in the Bookings details", async () => {
    expect((await detailsOf(401)).status).toBe(BookingStatus.PendingReview);

    await settle(reviews.approveBooking(401));

    expect((await detailsOf(401)).status).toBe(BookingStatus.Confirmed);
  });

  it("rejecting a review shows the booking as Rejected in the Bookings list", async () => {
    await settle(reviews.rejectBooking(401, { reason: "Wrong amount" }));

    const list = await settle(
      bookings.getBookings({ pageNumber: 1, pageSize: 100, branchId: 1, search: "OD-000401" }),
    );
    expect(list.data![0].status).toBe(BookingStatus.Rejected);
  });

  it("attendance counts the seeded upcoming bookings of a barber", async () => {
    const barberId = db.bookings.find((b) => b.id === 401)!.barberId;

    expect((await attendanceRow(barberId)).upcomingBookingsCount).toBe(5);
  });

  it("rejecting a waiting booking lowers the barber's upcoming count; approving does not", async () => {
    const barberId = db.bookings.find((b) => b.id === 401)!.barberId;

    await settle(reviews.approveBooking(401));
    expect((await attendanceRow(barberId)).upcomingBookingsCount).toBe(5);

    await settle(reviews.rejectBooking(403, { reason: "Wrong amount" }));
    expect((await attendanceRow(barberId)).upcomingBookingsCount).toBe(4);
  });

  it("ending the session in progress frees the barber it was keeping", async () => {
    const barberId = db.bookings.find((b) => b.id === 410)!.barberId;
    const before = (await attendanceRow(barberId)).upcomingBookingsCount;

    await settle(bookings.completeBooking(410));

    expect((await attendanceRow(barberId)).upcomingBookingsCount).toBe(before - 1);
  });

  it("a present barber can leave once every open booking was rejected or ended — not before", async () => {
    const barberId = db.bookings.find((b) => b.id === 401)!.barberId; // present at the start
    const markAbsent = () =>
      settle(barbers.setAttendance({ barbers: [{ barberId, isPresent: false }] }));

    await expect(markAbsent()).rejects.toMatchObject({ status: 409 });

    const open = db.bookings.filter(
      (b) =>
        b.barberId === barberId &&
        [BookingStatus.PendingReview, BookingStatus.Confirmed].includes(b.status),
    );
    for (const b of open) {
      if (b.status === BookingStatus.PendingReview) {
        await settle(reviews.rejectBooking(b.id, { reason: "Wrong amount" }));
      } else {
        b.status = BookingStatus.Completed; // as if it was ended
      }
    }

    expect((await markAbsent()).status).toBe(true);
    expect((await attendanceRow(barberId)).isPresent).toBe(false);
  });

  it("time passing expires unreviewed bookings everywhere at once", async () => {
    vi.setSystemTime(new Date(NOW.getTime() + 60 * 60_000)); // 13:00

    expect((await detailsOf(401)).status).toBe(BookingStatus.Expired);
    const queue = await settle(
      reviews.getPaymentReviews({ pageNumber: 1, pageSize: 20, branchId: 1 }),
    );
    expect(queue.data!.map((b) => b.id)).not.toContain(401);
  });
});
