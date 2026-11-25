import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";

import { PERMISSIONS } from "@core/auth/permissions";
import { LanguageService } from "@core/services/language.service";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { ConfirmModalComponent } from "@shared/components/confirm-modal/confirm-modal.component";
import { EmptyStateComponent } from "@shared/components/empty-state/empty-state.component";
import { FailedStateComponent } from "@shared/components/failed-state/failed-state.component";
import { PageHeaderComponent } from "@shared/components/page-header/page-header.component";
import { SkeletonComponent } from "@shared/components/skeleton/skeleton.component";
import {
  StatusBadgeComponent,
  StatusBadgeVariant,
} from "@shared/components/status-badge/status-badge.component";
import { BreadcrumbService } from "../../../../layout/main-layout/components/header/breadcrumb.service";
import { localizedName } from "../../../barbers/utils/barber-labels.util";
import { AuthService } from "../../../auth/service/auth.service";
import { RejectDialogComponent } from "../../../payment-reviews/components/reject-dialog/reject-dialog.component";
import { formatDuration, formatPrice } from "../../../services/utils/service-price.util";
import {
  ReassignBarberDialogComponent,
  ReassignOption,
} from "../../components/reassign-barber-dialog/reassign-barber-dialog.component";
import { BookingDetails, BookingStatus, RefundStatus } from "../../model/booking.model";
import { BookingDetailsService, BookingLoadResult } from "../../service/booking-details.service";
import {
  formatBookingDateLong,
  formatBookingTime,
  formatCairoDateTime,
} from "../../utils/booking-dates.util";
import {
  bookingStatusKey,
  bookingStatusVariant,
  bookingTypeKey,
  bookingTypeVariant,
  cancelReasonKey,
  localizedItemName,
  paymentMethodIcon,
  paymentMethodKey,
  refundStatusKey,
  refundStatusVariant,
} from "../../utils/booking-labels.util";

const LIST_ROUTE = "/main/bookings";

/** The longest reason the API accepts for a cancellation. */
const CANCEL_REASON_MAX = 500;

type ViewState = "loading" | "ready" | "notFound" | "failed";

/** Everything the page shows, formatted once per booking and language. */
export interface BookingView {
  number: string;
  dateLong: string;
  time: string;
  duration: string;
  statusLabel: string;
  statusVariant: StatusBadgeVariant;
  typeLabel: string;
  typeVariant: StatusBadgeVariant;
  barber: string;
  /** "4.9", or `null` while the barber has no reviews. */
  rating: string | null;
  /** Home bookings have no chair. */
  chair: string | null;
  branch: string;
  /** Home bookings only. */
  homeAddress: string | null;
  items: Array<{ name: string; duration: string; price: string }>;
  subtotal: string;
  total: string;
  methodLabel: string;
  methodIcon: string;
  customerId: number;
  customerName: string;
  customerPhone: string;
  visits: string;
  missed: string;
  refund: {
    statusLabel: string;
    statusVariant: StatusBadgeVariant;
    amount: string;
    fee: string | null;
  } | null;
  /** The server allows "End session" right now. */
  canEnd: boolean;
  /** "Missed" has the same rule as "End session": a Confirmed booking that has started. */
  canNoShow: boolean;
  /** Pending / confirmed and not ended: the branch may cancel it. */
  canCancel: boolean;
  /** The server allows "Change barber" right now (`actions.canReassign`). */
  canReassign: boolean;
  /** A refund is owed and the branch can record that it sent it (`actions.canMarkRefunded`). */
  canRefund: boolean;
  /** Confirmed but not started: "End session" will be possible once it starts. */
  endsAfterStart: boolean;
  /** Cancelled bookings only. */
  cancellation: {
    byBranch: boolean;
    /** The staff member (branch cancellations only). */
    by: string | null;
    when: string;
    /** What the staff wrote, or the reason the customer picked; null when there is none. */
    reason: string | null;
  } | null;
}

/**
 * Booking details (`/main/bookings/:id`) — everything `GET /bookings/{id}` returns (header,
 * appointment, services & payment, customer, refund, cancellation) plus the actions on the booking
 * (all `Booking.Manage`, each shown when the server allows it):
 *
 * - **End session** and **Missed** (`actions.canComplete`): a Confirmed booking that has started;
 * - **Cancel booking** (`actions.canCancel`): the branch cancels with a reason the customer sees;
 * - **Change barber** (`actions.canReassign`): moves the booking to another barber of its branch;
 * - **Refund sent** (`actions.canMarkRefunded`): in the refund card — the branch returned the money
 *   OUTSIDE the app and this records it (it asks first: it can't be undone).
 *
 * Every action asks first, then re-reads the booking so the status and the allowed actions are the
 * server's. It is re-read after a FAILURE too (400 / 404 / 409): what the page showed was out of
 * date. A missing booking gets its own message, not a retry.
 *
 * The customer is NOT notified by the backend yet (no notifications module): cancelling and
 * changing the barber say so, and the customer card keeps its call link.
 *
 * The customer card links to the customer's profile (`Customer.View`).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-booking-details",
  standalone: true,
  imports: [
    RouterLink,
    TranslateModule,
    PageHeaderComponent,
    AppButtonComponent,
    StatusBadgeComponent,
    SkeletonComponent,
    FailedStateComponent,
    EmptyStateComponent,
    ConfirmModalComponent,
    RejectDialogComponent,
    ReassignBarberDialogComponent,
  ],
  templateUrl: "./booking-details.html",
  styleUrl: "./booking-details.scss",
})
export class BookingDetailsPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly details = inject(BookingDetailsService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private readonly breadcrumbs = inject(BreadcrumbService);

  protected readonly id = Number(this.route.snapshot.paramMap.get("id"));

  protected readonly booking = signal<BookingDetails | null>(null);
  protected readonly state = signal<ViewState>("loading");
  protected readonly confirmOpen = signal(false);
  protected readonly noShowOpen = signal(false);
  protected readonly cancelOpen = signal(false);
  protected readonly refundOpen = signal(false);
  protected readonly reassignOpen = signal(false);
  protected readonly reassignLoading = signal(false);
  protected readonly reassignOptions = signal<ReassignOption[]>([]);
  protected readonly saving = this.details.saving;
  protected readonly cancelReasonMax = CANCEL_REASON_MAX;

  /** Lazy on purpose: the route guard stays the real boundary. */
  protected readonly canManage = computed(() =>
    this.auth.hasPermission(PERMISSIONS.Booking.Manage),
  );

  /** The "Customer profile" link: the Customers module has its own permission. */
  protected readonly canViewCustomer = computed(() =>
    this.auth.hasPermission(PERMISSIONS.Customer.View),
  );

  protected readonly view = computed<BookingView | null>(() => {
    const b = this.booking();
    return b ? this.toView(b, this.language.currentLang()) : null;
  });

  ngOnInit(): void {
    if (!Number.isInteger(this.id) || this.id <= 0) {
      this.router.navigate([LIST_ROUTE]);
      return;
    }

    this.load();
  }

  /** First read (or a retry): shows the skeleton. */
  protected load(): void {
    this.state.set("loading");
    this.details.getBooking(this.id).subscribe((result) => this.apply(result, true));
  }

  protected askEnd(): void {
    if (!this.canManage() || !this.view()?.canEnd) return;
    this.confirmOpen.set(true);
  }

  /** End the session, then re-read: the result (or the 404 / 409 explanation) was already toasted. */
  protected confirmEnd(): void {
    if (this.saving()) return;

    this.details.complete(this.id).subscribe(() => {
      this.confirmOpen.set(false);
      this.refresh();
    });
  }

  protected askNoShow(): void {
    if (!this.canManage() || !this.view()?.canNoShow) return;
    this.noShowOpen.set(true);
  }

  protected confirmNoShow(): void {
    if (this.saving()) return;

    this.details.markNoShow(this.id).subscribe(() => {
      this.noShowOpen.set(false);
      this.refresh();
    });
  }

  protected askRefund(): void {
    if (!this.canManage() || !this.view()?.canRefund) return;
    this.refundOpen.set(true);
  }

  /** The branch already returned the money outside the app; this only records it. */
  protected confirmRefund(): void {
    if (this.saving()) return;

    this.details.markRefunded(this.id).subscribe(() => {
      this.refundOpen.set(false);
      this.refresh();
    });
  }

  protected askCancel(): void {
    if (!this.canManage() || !this.view()?.canCancel) return;
    this.cancelOpen.set(true);
  }

  /** `reason` is already trimmed and non-empty (the dialog guarantees it). */
  protected confirmCancel(reason: string): void {
    if (this.saving()) return;

    this.details.cancel(this.id, reason).subscribe(() => {
      this.cancelOpen.set(false);
      this.refresh();
    });
  }

  /** Opens the dialog at once and fills it with the branch's other active barbers when they arrive. */
  protected askReassign(): void {
    const booking = this.booking();
    if (!this.canManage() || !this.view()?.canReassign || !booking) return;

    this.reassignOptions.set([]);
    this.reassignLoading.set(true);
    this.reassignOpen.set(true);
    this.details.loadReassignOptions(booking).subscribe((barbers) => {
      this.reassignOptions.set(barbers.map((b) => ({ id: b.id, label: b.fullName })));
      this.reassignLoading.set(false);
    });
  }

  protected confirmReassign(barberId: number): void {
    if (this.saving()) return;

    this.details.reassignBarber(this.id, barberId).subscribe(() => {
      this.reassignOpen.set(false);
      this.refresh();
    });
  }

  protected endMessage(): string {
    return this.messageOf("BOOKINGS.DETAILS.END_MESSAGE");
  }

  protected noShowMessage(): string {
    return this.messageOf("BOOKINGS.DETAILS.NO_SHOW_MESSAGE");
  }

  protected refundMessage(): string {
    return this.messageOf("BOOKINGS.DETAILS.REFUND_MESSAGE");
  }

  private messageOf(key: string): string {
    const view = this.view();
    return this.translate.instant(key, {
      number: view?.number ?? "",
      name: view?.customerName ?? "",
      amount: view?.refund?.amount ?? "",
    });
  }

  // ── Helpers ──────────────────────────────────────────
  /** Re-read the booking after an action: what the page showed is now out of date. */
  private refresh(): void {
    this.details.getBooking(this.id).subscribe((result) => this.apply(result, false));
  }

  /**
   * `initial`: a failed first read shows the failed state. Otherwise (a re-read after an action) a
   * failure keeps what is on screen — only a 404 replaces it.
   */
  private apply(result: BookingLoadResult, initial: boolean): void {
    switch (result.kind) {
      case "ok":
        this.booking.set(result.booking);
        this.state.set("ready");
        // The route's static breadcrumb says "Booking details"; swap in the booking number.
        this.breadcrumbs.setBreadcrumbs([
          { label: "LAYOUT.NAV.BOOKINGS", route: LIST_ROUTE },
          { label: result.booking.bookingNumber },
        ]);
        return;
      case "notFound":
        this.booking.set(null);
        this.state.set("notFound");
        return;
      case "failed":
        if (initial || !this.booking()) this.state.set("failed");
    }
  }

  private toView(b: BookingDetails, lang: string): BookingView {
    const t = (key: string, params?: object): string => this.translate.instant(key, params);
    const currency = t("SERVICES.CURRENCY");
    const price = (value: number): string => formatPrice(value, lang, currency);
    const units = { h: t("SERVICES.UNITS.H"), min: t("SERVICES.UNITS.MIN") };
    const number = (value: number): string =>
      new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US").format(value);
    const refund = b.refund;
    const cancellation = b.cancellation;

    return {
      number: b.bookingNumber,
      dateLong: formatBookingDateLong(b.startAt, lang),
      time: formatBookingTime(b.startAt, lang),
      duration: formatDuration(b.durationMinutes, units),
      statusLabel: t(bookingStatusKey(b.status, b.isInProgress)),
      statusVariant: bookingStatusVariant(b.status, b.isInProgress),
      typeLabel: t(bookingTypeKey(b.type)),
      typeVariant: bookingTypeVariant(b.type),
      barber: b.barber.fullName,
      rating:
        b.barber.averageRating === null
          ? null
          : new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }).format(b.barber.averageRating),
      chair: b.chair?.name ?? null,
      branch: localizedName(b.branch, lang),
      homeAddress: b.homeAddress,
      items: b.items.map((i) => ({
        name: localizedItemName(i, lang),
        duration: formatDuration(i.durationMinutes, units),
        price: price(i.price),
      })),
      subtotal: price(b.payment.subtotal),
      total: price(b.payment.totalPrice),
      methodLabel: t(paymentMethodKey(b.payment.method)),
      methodIcon: paymentMethodIcon(b.payment.method),
      customerId: b.customer.id,
      customerName: b.customer.fullName,
      customerPhone: b.customer.phoneNumber,
      visits: number(b.customer.visitsCount),
      missed: number(b.customer.noShowCount),
      refund: refund
        ? {
            statusLabel: t(refundStatusKey(refund.status)),
            statusVariant: refundStatusVariant(refund.status as RefundStatus),
            amount: price(refund.amount),
            fee: refund.feeAmount === null ? null : price(refund.feeAmount),
          }
        : null,
      canEnd: b.actions.canComplete,
      canNoShow: b.actions.canComplete,
      canCancel: b.actions.canCancel,
      canReassign: b.actions.canReassign,
      canRefund: b.actions.canMarkRefunded,
      endsAfterStart: b.status === BookingStatus.Confirmed && !b.actions.canComplete,
      cancellation: cancellation
        ? {
            byBranch: cancellation.cancelledByBranch,
            by: cancellation.cancelledByName,
            when: formatCairoDateTime(cancellation.cancelledAt, lang),
            reason: cancellation.cancelledByBranch
              ? cancellation.note
              : cancellation.reason === null
                ? null
                : t(cancelReasonKey(cancellation.reason)),
          }
        : null,
    };
  }
}
