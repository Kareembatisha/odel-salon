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
import { formatDuration, formatPrice } from "../../../services/utils/service-price.util";
import { BookingDetails, BookingStatus, RefundStatus } from "../../model/booking.model";
import { BookingDetailsService, BookingLoadResult } from "../../service/booking-details.service";
import { formatBookingDateLong, formatBookingTime } from "../../utils/booking-dates.util";
import {
  bookingStatusKey,
  bookingStatusVariant,
  bookingTypeKey,
  bookingTypeVariant,
  localizedItemName,
  paymentMethodIcon,
  paymentMethodKey,
  refundStatusKey,
  refundStatusVariant,
} from "../../utils/booking-labels.util";

const LIST_ROUTE = "/main/bookings";

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
  /** Confirmed but not started: "End session" will be possible once it starts. */
  endsAfterStart: boolean;
}

/**
 * Booking details (`/main/bookings/:id`) — read-only view of everything `GET /bookings/{id}` returns
 * (header, appointment, services & payment, customer, refund) plus the one action the contract has:
 * **End session** (`Booking.Manage`), shown when the server says `actions.canComplete`.
 *
 * "End session" asks for confirmation, then re-reads the booking so the status and the allowed
 * actions are the server's. It is re-read after a FAILURE too (404 / 409): what the page showed was
 * out of date. A missing booking gets its own message, not a retry.
 *
 * Not built, on purpose: "Refund sent" (`actions.canMarkRefunded` has no endpoint in the contract
 * yet) and the "Customer profile" link (there is no Customers module): the customer card shows the
 * name, a call link and the visit / missed counts.
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
  protected readonly saving = this.details.saving;

  /** Lazy on purpose: the route guard stays the real boundary. */
  protected readonly canManage = computed(() =>
    this.auth.hasPermission(PERMISSIONS.Booking.Manage),
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
      this.details.getBooking(this.id).subscribe((result) => this.apply(result, false));
    });
  }

  protected endMessage(): string {
    const view = this.view();
    return this.translate.instant("BOOKINGS.DETAILS.END_MESSAGE", {
      number: view?.number ?? "",
      name: view?.customerName ?? "",
    });
  }

  // ── Helpers ──────────────────────────────────────────
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
      endsAfterStart: b.status === BookingStatus.Confirmed && !b.actions.canComplete,
    };
  }
}
