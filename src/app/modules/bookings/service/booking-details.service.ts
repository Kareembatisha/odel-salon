import { Injectable, computed, inject, signal } from "@angular/core";
import { Observable, catchError, finalize, map, of, tap } from "rxjs";

import { NotificationService } from "@core/services/notification.service";
import { BookingDetails } from "../model/booking.model";
import { BOOKING_REPOSITORY } from "../repository/booking.repository";

/** What reading one booking can come to — "gone" is not the same as "couldn't load". */
export type BookingLoadResult =
  { kind: "ok"; booking: BookingDetails } | { kind: "notFound" } | { kind: "failed" };

/**
 * One booking (`/main/bookings/:id`): reading it and the action on it, "End session".
 *
 * Reading tells a missing booking (404) from a load failure, because they need different screens
 * (a "doesn't exist" message vs a retry). A missing booking arrives either as an HTTP 404 or as a
 * `status: false` body with `statusCode` 404 (that is how the mock answers).
 *
 * {@link complete} resolves to `true` once the session is ended and toasts our own localized
 * message (the backend's is English-only). A failure resolves to `false`: the error interceptor
 * already explained it (404 / 409 — "hasn't started yet", "not allowed for the current status"),
 * and the caller re-reads the booking because what it showed is out of date.
 */
@Injectable({ providedIn: "root" })
export class BookingDetailsService {
  private readonly repository = inject(BOOKING_REPOSITORY);
  private readonly notify = inject(NotificationService);

  /** Counter, not a boolean: one finishing can't clear `saving` while another is still running. */
  private readonly pendingMutations = signal(0);

  /** "End session" is in flight. */
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
    this.pendingMutations.update((n) => n + 1);

    return this.repository.completeBooking(id).pipe(
      map((res) => {
        if (!res.status) throw new Error(res.message);
        return true;
      }),
      tap(() => this.notify.success("BOOKINGS.SESSION_ENDED")),
      catchError(() => of(false)),
      finalize(() => this.pendingMutations.update((n) => n - 1)),
    );
  }
}
