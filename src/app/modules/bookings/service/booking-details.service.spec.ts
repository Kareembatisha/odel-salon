import { TestBed } from "@angular/core/testing";
import { Observable, Subject, of, throwError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import { BookingDetails, BookingStatus, BookingType, PaymentMethod } from "../model/booking.model";
import { BOOKING_REPOSITORY } from "../repository/booking.repository";
import { BookingDetailsService } from "./booking-details.service";

const details = (): BookingDetails => ({
  id: 482,
  bookingNumber: "OD-000482",
  status: BookingStatus.Confirmed,
  isInProgress: true,
  type: BookingType.Vip,
  startAt: "2026-11-13T19:00:00",
  durationMinutes: 50,
  barber: { fullName: "Karim Adel", averageRating: 4.9 },
  chair: { name: "VIP 1" },
  branch: { nameAr: "مدينة نصر", nameEn: "Nasr City" },
  homeAddress: null,
  items: [],
  payment: { method: PaymentMethod.InstaPay, totalPrice: 340, subtotal: 340 },
  customer: {
    fullName: "Ahmed Hassan",
    phoneNumber: "+201001234567",
    id: 1203,
    visitsCount: 12,
    noShowCount: 1,
  },
  refund: null,
  actions: { canComplete: true, canMarkRefunded: false },
});

const envelope = <T>(over: Partial<ApiResponse<T>>): ApiResponse<T> => ({
  status: true,
  statusCode: 200,
  message: "ok",
  errors: null,
  meta: null,
  data: null as T,
  ...over,
});

describe("BookingDetailsService", () => {
  let service: BookingDetailsService;
  let repo: {
    getBookingById: (id: number) => Observable<ApiResponse<BookingDetails>>;
    completeBooking: (id: number) => Observable<ApiResponse<null>>;
  };
  let success: ReturnType<typeof vi.fn>;

  const read = async (id = 482) =>
    new Promise((resolve) => service.getBooking(id).subscribe(resolve));

  beforeEach(() => {
    success = vi.fn();
    repo = {
      getBookingById: () => of(envelope({ data: details() })),
      completeBooking: () => of(envelope<null>({ data: null })),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: BOOKING_REPOSITORY, useValue: repo },
        { provide: NotificationService, useValue: { success } },
      ],
    });
    service = TestBed.inject(BookingDetailsService);
  });

  describe("getBooking", () => {
    it("returns the booking", async () => {
      expect(await read()).toEqual({ kind: "ok", booking: details() });
    });

    it("tells a missing booking apart: a status:false 404 body", async () => {
      repo.getBookingById = () =>
        of(envelope({ status: false, statusCode: 404, data: null as never }));

      expect(await read()).toEqual({ kind: "notFound" });
    });

    it("tells a missing booking apart: an HTTP 404", async () => {
      repo.getBookingById = () => throwError(() => ({ status: 404 }));

      expect(await read()).toEqual({ kind: "notFound" });
    });

    it("calls any other failure 'failed' (so the page offers a retry)", async () => {
      repo.getBookingById = () => throwError(() => ({ status: 500 }));
      expect(await read()).toEqual({ kind: "failed" });

      repo.getBookingById = () =>
        of(envelope({ status: false, statusCode: 500, data: null as never }));
      expect(await read()).toEqual({ kind: "failed" });
    });

    it("calls a successful answer without data 'failed'", async () => {
      repo.getBookingById = () => of(envelope({ data: null as never }));

      expect(await read()).toEqual({ kind: "failed" });
    });
  });

  describe("complete", () => {
    const run = () => new Promise<boolean>((resolve) => service.complete(482).subscribe(resolve));

    it("resolves true and toasts our own localized message", async () => {
      expect(await run()).toBe(true);
      expect(success).toHaveBeenCalledWith("BOOKINGS.SESSION_ENDED");
    });

    it("resolves false, with no success toast, when the request fails", async () => {
      repo.completeBooking = () => throwError(() => ({ status: 409 }));

      expect(await run()).toBe(false);
      expect(success).not.toHaveBeenCalled();
    });

    it("treats a status:false body as a failure", async () => {
      repo.completeBooking = () =>
        of(envelope<null>({ status: false, message: "nope", data: null }));

      expect(await run()).toBe(false);
      expect(success).not.toHaveBeenCalled();
    });

    it("is 'saving' while the request runs and not after, success or failure", async () => {
      const hold = new Subject<ApiResponse<null>>();
      repo.completeBooking = () => hold;
      let result: boolean | undefined;

      service.complete(482).subscribe((ok) => (result = ok));
      expect(service.saving()).toBe(true);

      hold.next(envelope<null>({ data: null }));
      hold.complete();
      expect(service.saving()).toBe(false);
      expect(result).toBe(true);

      repo.completeBooking = () => throwError(() => ({ status: 500 }));
      await run();
      expect(service.saving()).toBe(false);
    });

    it("keeps 'saving' on until the last of two overlapping requests ends", () => {
      const first = new Subject<ApiResponse<null>>();
      const second = new Subject<ApiResponse<null>>();
      const subjects = [first, second];
      repo.completeBooking = () => subjects.shift()!;

      service.complete(1).subscribe();
      service.complete(2).subscribe();
      first.next(envelope<null>({ data: null }));
      first.complete();

      expect(service.saving()).toBe(true);

      second.next(envelope<null>({ data: null }));
      second.complete();
      expect(service.saving()).toBe(false);
    });
  });
});
