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

import { LanguageService } from "@core/services/language.service";
import { AvatarComponent } from "@shared/components/avatar/avatar.component";
import { EmptyStateComponent } from "@shared/components/empty-state/empty-state.component";
import { FailedStateComponent } from "@shared/components/failed-state/failed-state.component";
import { SkeletonComponent } from "@shared/components/skeleton/skeleton.component";
import {
  StatusBadgeComponent,
  StatusBadgeVariant,
} from "@shared/components/status-badge/status-badge.component";
import { BreadcrumbService } from "../../../../layout/main-layout/components/header/breadcrumb.service";
import { localizedName } from "../../../barbers/utils/barber-labels.util";
import { BookingType, RefundStatus } from "../../../bookings/model/booking.model";
import {
  formatBookingDate,
  formatBookingTime,
  formatCairoDate,
} from "../../../bookings/utils/booking-dates.util";
import {
  bookingItemsLabel,
  bookingStatusKey,
  bookingStatusVariant,
  bookingTypeKey,
  bookingTypeVariant,
  refundStatusKey,
} from "../../../bookings/utils/booking-labels.util";
import { cairoToday } from "../../../offers/utils/offer-dates.util";
import { formatPrice } from "../../../services/utils/service-price.util";
import { CustomerDetails } from "../../model/customer.model";
import { CustomerDetailsService, CustomerLoadResult } from "../../service/customer-details.service";
import { lastVisitKey, lastVisitOf } from "../../utils/customer-labels.util";

const LIST_ROUTE = "/main/customers";

type ViewState = "loading" | "ready" | "notFound" | "failed";

/** One of the customer's latest bookings, formatted once per customer and language. */
export interface CustomerBookingRow {
  id: number;
  number: string;
  /** Regular bookings show no badge — only VIP and Home do. */
  typeLabel: string | null;
  typeVariant: StatusBadgeVariant;
  when: string;
  services: string;
  /** "Karim Adel · Nasr City". */
  where: string;
  amount: string;
  statusLabel: string;
  statusVariant: StatusBadgeVariant;
  /** "Cancelled by customer" / "Cancelled by branch" — Cancelled bookings only. */
  cancelledBy: string | null;
  /** "Refund waiting · EGP 96" — Cancelled / Expired / Missed bookings only. */
  refundText: string | null;
  refundWaiting: boolean;
  /** "EGP 70 fee" — missed bookings only. */
  feeText: string | null;
  /** "4" stars of a rated completed booking. */
  rating: string | null;
}

/** Everything the page shows, formatted once per customer and language. */
export interface CustomerView {
  name: string;
  phone: string;
  email: string;
  imageUrl: string | null;
  /** "Customer since Mar 4, 2026". */
  since: string;
  visits: string;
  missed: string;
  /** "Last missed: Sep 3, 2026" — null when the customer never missed a booking. */
  lastMissed: string | null;
  /** All bookings ("All bookings (14)"); the link is hidden when there are none. */
  bookingsCount: number;
  bookingsCountText: string;
  bookings: CustomerBookingRow[];
}

/**
 * Customer profile (`/main/customers/:id`) — read-only view of `GET /customers/{id}`: who the
 * customer is (name, phone, email, since), how often they came (visits) and missed, and their
 * latest 5 bookings. Everything covers ALL branches (the branch selector doesn't filter it).
 *
 * "All bookings (N)" opens the Bookings list filtered to this customer (`?customerId=`). A booking
 * opens its details page. A missing customer gets its own message, not a retry.
 *
 * Not built, on purpose (the contract says so): total paid, points, addresses, blocking.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-customer-profile",
  standalone: true,
  imports: [
    RouterLink,
    TranslateModule,
    AvatarComponent,
    StatusBadgeComponent,
    SkeletonComponent,
    FailedStateComponent,
    EmptyStateComponent,
  ],
  templateUrl: "./customer-profile.html",
  styleUrl: "./customer-profile.scss",
})
export class CustomerProfilePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly details = inject(CustomerDetailsService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private readonly breadcrumbs = inject(BreadcrumbService);

  protected readonly id = Number(this.route.snapshot.paramMap.get("id"));

  protected readonly customer = signal<CustomerDetails | null>(null);
  protected readonly state = signal<ViewState>("loading");

  protected readonly view = computed<CustomerView | null>(() => {
    const c = this.customer();
    return c ? this.toView(c, this.language.currentLang()) : null;
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
    this.details.getCustomer(this.id).subscribe((result) => this.apply(result));
  }

  // ── Helpers ──────────────────────────────────────────
  private apply(result: CustomerLoadResult): void {
    switch (result.kind) {
      case "ok":
        this.customer.set(result.customer);
        this.state.set("ready");
        // The route's static breadcrumb says "Customer profile"; swap in the customer's name.
        this.breadcrumbs.setBreadcrumbs([
          { label: "LAYOUT.NAV.CUSTOMERS", route: LIST_ROUTE },
          { label: result.customer.fullName },
        ]);
        return;
      case "notFound":
        this.customer.set(null);
        this.state.set("notFound");
        return;
      case "failed":
        this.state.set("failed");
    }
  }

  private toView(c: CustomerDetails, lang: string): CustomerView {
    const t = (key: string, params?: object): string => this.translate.instant(key, params);
    const currency = t("SERVICES.CURRENCY");
    const locale = lang === "ar" ? "ar-EG" : "en-US";
    const number = (value: number): string => new Intl.NumberFormat(locale).format(value);
    const today = cairoToday();
    const day = (value: string): string => {
      const visit = lastVisitOf(value, today);
      return visit.kind === "date"
        ? formatBookingDate(`${visit.day}T00:00:00`, lang)
        : t(lastVisitKey(visit));
    };

    return {
      name: c.fullName,
      phone: c.phoneNumber,
      email: c.email,
      imageUrl: c.imageUrl,
      since: formatCairoDate(c.createdAt, lang),
      visits: number(c.visitsCount),
      missed: number(c.missedCount),
      lastMissed: c.lastMissedDate ? day(c.lastMissedDate) : null,
      bookingsCount: c.bookingsCount,
      bookingsCountText: number(c.bookingsCount),
      bookings: c.latestBookings.map((b) => {
        const refund = b.refund;
        return {
          id: b.id,
          number: b.bookingNumber,
          typeLabel: b.type === BookingType.Regular ? null : t(bookingTypeKey(b.type)),
          typeVariant: bookingTypeVariant(b.type),
          when: `${formatBookingDate(b.startAt, lang)} · ${formatBookingTime(b.startAt, lang)}`,
          services: bookingItemsLabel(b.items, lang),
          where: `${b.barber.fullName} · ${localizedName(b.branch, lang)}`,
          amount: formatPrice(b.totalPrice, lang, currency),
          statusLabel: t(bookingStatusKey(b.status, b.isInProgress)),
          statusVariant: bookingStatusVariant(b.status, b.isInProgress),
          cancelledBy:
            b.cancelledByBranch === null
              ? null
              : t(
                  b.cancelledByBranch
                    ? "CUSTOMERS.PROFILE.BY_BRANCH"
                    : "CUSTOMERS.PROFILE.BY_CUSTOMER",
                ),
          refundText: refund
            ? t("BOOKINGS.REFUND_LINE", {
                status: t(refundStatusKey(refund.status)),
                amount: formatPrice(refund.amount, lang, currency),
              })
            : null,
          refundWaiting: refund?.status === RefundStatus.Waiting,
          feeText:
            refund?.feeAmount != null
              ? t("BOOKINGS.FEE", { amount: formatPrice(refund.feeAmount, lang, currency) })
              : null,
          rating: b.rating === null ? null : number(b.rating),
        };
      }),
    };
  }
}
