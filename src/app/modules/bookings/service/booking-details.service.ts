import { Injectable, computed, inject, signal } from "@angular/core";
import { Observable, catchError, finalize, map, of, tap } from "rxjs";

import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import { BARBER_REPOSITORY } from "../../barbers/repository/barber.repository";
import { BookingDetails } from "../model/booking.model";
import { BOOKING_REPOSITORY } from "../repository/booking.repository";
import type { BookingBarberOption } from "./bookings.service";

/** What reading one booking can come to — "gone" is not the same as "couldn't load". */
export type BookingLoadResult =
  { kind: "ok"; booking: BookingDetails } | { kind: "notFound" } | { kind: "failed" };

/**
 * One booking (`/main/bookings/:id`): reading it and the actions on it — "End session", "Missed",
 * "Cancel booking", "Change barber" and "Refund sent".
 *
 * Reading tells a missing booking (404) from a load failure, because they need different screens
 * (a "doesn't exist" message vs a retry). A missing booking arrives either as an HTTP 404 or as a
 * `status: false` body with `statusCode` 404 (that is how the mock answers).
 *
 * Every action resolves to `true` once it went through and toasts our own localized message (the
 * backend's is English-only). A failure resolves to `false`: the error interceptor already
 * explained it (400 / 404 / 409 — "hasn't started yet", "not allowed for the current status",
 * "the barber isn't available"), and the caller re-reads the booking because what it showed is out
 * of date.
 */
@Injectable({ providedIn: "root" })
export class BookingDetailsService {
  private readonly repository = inject(BOOKING_REPOSITORY);
  private readonly barberRepository = inject(BARBER_REPOSITORY);
  private readonly notify = inject(NotificationService);

  /** Counter, not a boolean: one finishing can't clear `saving` while another is still running. */
  private readonly pendingMutations = signal(0);

  /** An action (end, missed, cancel, change barber, refund sent) is in flight. */
  readonly saving = computed(() => this.pendingMutations() > 0);

  getBooking(id: number): Observable<BookingLoadResult> {
    return this.repository.getBookingById(id).pipe(
      map((res): BookingLoadResult => {
        if (res.status && res.data) return { kind: "ok", booking: res.data };
        return res.statusCode === 404 ? { kind: "notFound" } : { kind: "failed" };
      }),
      catchError((err: { status?: number }) =>
        of<BookingLoadResult>(err?.status === 404 ? { kind: "notFound" } : { kind: "failed" }),
      ),
    );
  }

  /** Confirmed → Completed. `true` on success, `false` when nothing changed. */
  complete(id: number): Observable<boolean> {
    return this.run(this.repository.completeBooking(id), "BOOKINGS.SESSION_ENDED");
  }

  /** Confirmed → Missed (the customer didn't come); a refund minus the fee becomes owed. */
  markNoShow(id: number): Observable<boolean> {
    return this.run(this.repository.markNoShow(id), "BOOKINGS.MARKED_NO_SHOW");
  }

  /** The branch returned the money outside the app: records it (`refund.status` becomes Sent). */
  markRefunded(id: number): Observable<boolean> {
    return this.run(this.repository.markRefunded(id), "BOOKINGS.REFUND_MARKED");
  }

  /** The BRANCH cancels the booking; `reason` is required and the customer sees it. */
  cancel(id: number, reason: string): Observable<boolean> {
    return this.run(this.repository.cancelBooking(id, reason), "BOOKINGS.CANCELLED");
  }

  /** Moves the booking to another barber at the same time. */
  reassignBarber(id: number, barberId: number): Observable<boolean> {
    return this.run(this.repository.reassignBarber(id, barberId), "BOOKINGS.BARBER_CHANGED");
  }

  /**
   * The barbers the booking can move to: the ACTIVE barbers of its branch, without its current one.
   * Whether a barber is free at that time is only known to the server (409), which is why every one
   * of them is offered. A failure gives an empty list.
   */
  loadReassignOptions(booking: BookingDetails): Observable<BookingBarberOption[]> {
    return this.barberRepository
      .getBarbers({ branchId: booking.branch.id, isActive: true, pageNumber: 1, pageSize: 100 })
      .pipe(
        map((res) =>
          (res.data ?? [])
            .filter((b) => b.id !== booking.barber.id)
            .map((b) => ({ id: b.id, fullName: b.fullName })),
        ),
        catchError(() => of<BookingBarberOption[]>([])),
      );
  }

  /** The shared shape of an action: counted while in flight, toast on success, `false` on failure. */
  private run(request: Observable<ApiResponse<null>>, successKey: string): Observable<boolean> {
    this.pendingMutations.update((n) => n + 1);

    return request.pipe(
      map((res) => {
        if (!res.status) throw new Error(res.message);
        return true;
      }),
      tap(() => this.notify.success(successKey)),
      catchError(() => of(false)),
      finalize(() => this.pendingMutations.update((n) => n - 1)),
    );
  }
}
