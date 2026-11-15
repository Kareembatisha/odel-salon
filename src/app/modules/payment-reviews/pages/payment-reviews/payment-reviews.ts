import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  NgZone,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { TranslateModule, TranslateService } from "@ngx-translate/core";

import { PERMISSIONS } from "@core/auth/permissions";
import { LanguageService } from "@core/services/language.service";
import { AppButtonComponent } from "@shared/components/app-button/app-button.component";
import { ConfirmModalComponent } from "@shared/components/confirm-modal/confirm-modal.component";
import { EmptyStateComponent } from "@shared/components/empty-state/empty-state.component";
import { FailedStateComponent } from "@shared/components/failed-state/failed-state.component";
import {
  FilterOption,
  FilterSelectComponent,
} from "@shared/components/filter-select/filter-select.component";
import { PageHeaderComponent } from "@shared/components/page-header/page-header.component";
import { PaginationComponent } from "@shared/components/pagination/pagination.component";
import { SkeletonComponent } from "@shared/components/skeleton/skeleton.component";
import {
  StatusBadgeComponent,
  StatusBadgeVariant,
} from "@shared/components/status-badge/status-badge.component";
import { TabItem, TabsComponent } from "@shared/components/tabs/tabs.component";
import { AuthService } from "../../../auth/service/auth.service";
import { localizedName } from "../../../barbers/utils/barber-labels.util";
import { formatBookingDate, formatBookingTime } from "../../../bookings/utils/booking-dates.util";
import {
  bookingItemsLabel,
  bookingStatusKey,
  bookingStatusVariant,
  bookingTypeKey,
  bookingTypeVariant,
  paymentMethodIcon,
  paymentMethodKey,
} from "../../../bookings/utils/booking-labels.util";
import { BookingType } from "../../../bookings/model/booking.model";
import { formatDuration, formatPrice } from "../../../services/utils/service-price.util";
import {
  PaymentReviewItem,
  PaymentReviewTab,
  REJECT_REASON_MAX_LENGTH,
} from "../../model/payment-review.model";
import { PaymentReviewsService } from "../../service/payment-reviews.service";
import { ProofViewerComponent } from "../../components/proof-viewer/proof-viewer.component";
import { RejectDialogComponent } from "../../components/reject-dialog/reject-dialog.component";

/** The one panel the tabs control (`aria-controls` / `aria-labelledby`). */
const PANEL_ID = "reviews-panel";

/** How often the queue reloads quietly while the tab is visible (ms). */
export const REVIEWS_AUTO_REFRESH_MS = 60_000;

/** Each tab's `PAYMENT_REVIEWS.TAB.*` label key and badge counter, in display order. */
const TABS: ReadonlyArray<[PaymentReviewTab, string]> = [
  [PaymentReviewTab.ToReview, "PAYMENT_REVIEWS.TAB.TO_REVIEW"],
  [PaymentReviewTab.ApprovedToday, "PAYMENT_REVIEWS.TAB.APPROVED_TODAY"],
  [PaymentReviewTab.RejectedToday, "PAYMENT_REVIEWS.TAB.REJECTED_TODAY"],
];

/** Empty-state texts per tab. */
const EMPTY_KEYS: Record<PaymentReviewTab, [string, string]> = {
  [PaymentReviewTab.ToReview]: [
    "PAYMENT_REVIEWS.EMPTY.TO_REVIEW_TITLE",
    "PAYMENT_REVIEWS.EMPTY.TO_REVIEW_TEXT",
  ],
  [PaymentReviewTab.ApprovedToday]: [
    "PAYMENT_REVIEWS.EMPTY.APPROVED_TITLE",
    "PAYMENT_REVIEWS.EMPTY.APPROVED_TEXT",
  ],
  [PaymentReviewTab.RejectedToday]: [
    "PAYMENT_REVIEWS.EMPTY.REJECTED_TITLE",
    "PAYMENT_REVIEWS.EMPTY.REJECTED_TEXT",
  ],
};

const SKELETON_CARDS = [1, 2, 3, 4];

/** Everything one review card shows, worked out once per response and language. */
export interface ReviewCard {
  id: number;
  /** `#489` — the list has no booking number, only the id. */
  idLabel: string;
  /** Regular bookings show no badge — only VIP and Home do. */
  typeLabel: string | null;
  typeVariant: StatusBadgeVariant;
  startDate: string;
  startTime: string;
  customerName: string;
  customerPhone: string;
  services: string;
  methodLabel: string;
  methodIcon: string;
  /** The amount DUE — what the screenshot has to be compared with. */
  amount: string;
  proofUrl: string;
  /** "12 min" / "1 h 5 min" — ToReview only. */
  waiting: string | null;
  isLate: boolean;
  /** Current status of the booking (shown on the reviewed tabs). */
  statusLabel: string;
  statusVariant: StatusBadgeVariant;
}

/**
 * PaymentReviewsPage — the queue of bookings waiting for a payment review in ONE branch (the first
 * by default): the customer's transfer screenshot next to the amount due, and Approve / Reject.
 *
 * - Tabs: To review / Approved today / Rejected today, each with the branch's count; the review-time
 *   target ("Review time 30 min") and "late" proofs come from the backend.
 * - It is time-critical, so it reloads QUIETLY (rows stay, nothing flashes): every minute while the
 *   tab is visible, when the tab regains focus, and from the Refresh button, which shows when the
 *   rows were last brought up to date.
 * - Approve asks for confirmation (the dialog repeats the amount due). Reject asks for a REASON — it
 *   is required, max 500 characters, and the customer sees it. Both need `Booking.Review`; without
 *   it the page is read-only. Only the booking being saved is locked; after a save (or a 409 / 404:
 *   someone else got there first) the queue reloads.
 * - Clicking the screenshot opens it large.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-payment-reviews",
  standalone: true,
  imports: [
    TranslateModule,
    PageHeaderComponent,
    TabsComponent,
    FilterSelectComponent,
    PaginationComponent,
    StatusBadgeComponent,
    SkeletonComponent,
    EmptyStateComponent,
    FailedStateComponent,
    AppButtonComponent,
    ConfirmModalComponent,
    ProofViewerComponent,
    RejectDialogComponent,
  ],
  templateUrl: "./payment-reviews.html",
  styleUrl: "./payment-reviews.scss",
})
export class PaymentReviewsPage implements OnInit {
  private readonly service = inject(PaymentReviewsService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);

  protected readonly panelId = PANEL_ID;
  protected readonly skeletons = SKELETON_CARDS;
  protected readonly ToReview = PaymentReviewTab.ToReview;

  protected readonly items = this.service.items;
  protected readonly meta = this.service.meta;
  protected readonly tab = this.service.tab;
  protected readonly loading = this.service.loading;
  protected readonly refreshing = this.service.refreshing;
  protected readonly hasError = this.service.hasError;
  protected readonly branchId = this.service.branchId;
  protected readonly noBranches = this.service.noBranches;
  protected readonly counters = this.service.counters;
  protected readonly pendingIds = this.service.pendingIds;

  /** The skeleton shows while the branches or the first load are on their way. */
  protected readonly busy = computed(
    () => this.service.branchesLoading() || (this.loading() && !this.items().length),
  );

  /** Lazy on purpose: the route guard stays the real boundary. */
  protected readonly canReview = computed(() =>
    this.auth.hasPermission(PERMISSIONS.Booking.Review),
  );

  /** Booking whose proof is open large / is being approved / is being rejected. */
  protected readonly proofTarget = signal<ReviewCard | null>(null);
  protected readonly approveTarget = signal<ReviewCard | null>(null);
  protected readonly rejectTarget = signal<ReviewCard | null>(null);

  protected readonly tabs = computed<TabItem[]>(() => {
    this.language.currentLang();
    const c = this.counters();
    const counts = c
      ? [c.toReviewCount, c.approvedTodayCount, c.rejectedTodayCount]
      : [null, null, null];
    return TABS.map(([value, key], index) => ({
      value: String(value),
      label: this.translate.instant(key),
      count: counts[index],
    }));
  });

  protected readonly branchOptions = computed<FilterOption[]>(() => {
    const lang = this.language.currentLang();
    return this.service
      .branches()
      .map((b) => ({ value: String(b.id), label: localizedName(b, lang) }));
  });

  /** "Review time 30 min" — hidden until the backend says (0 = unknown). */
  protected readonly reviewTarget = computed(() => {
    this.language.currentLang();
    const minutes = this.counters()?.reviewTargetMinutes ?? 0;
    return minutes > 0
      ? this.translate.instant("PAYMENT_REVIEWS.REVIEW_TARGET", { minutes })
      : null;
  });

  /** "Updated 12:05 PM" in salon time — the waiting minutes are only as fresh as this. */
  protected readonly updatedLabel = computed(() => {
    const at = this.service.updatedAt();
    if (at === null) return null;
    const lang = this.language.currentLang();
    const time = new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-US", {
      timeZone: "Africa/Cairo",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(at);
    return this.translate.instant("PAYMENT_REVIEWS.UPDATED_AT", { time });
  });

  protected readonly emptyTitle = computed(() => {
    this.language.currentLang();
    return this.translate.instant(EMPTY_KEYS[this.tab()][0]);
  });
  protected readonly emptyText = computed(() => {
    this.language.currentLang();
    return this.translate.instant(EMPTY_KEYS[this.tab()][1]);
  });

  protected readonly cards = computed<ReviewCard[]>(() => {
    const lang = this.language.currentLang();
    const currency = this.translate.instant("SERVICES.CURRENCY");
    const units = {
      h: this.translate.instant("SERVICES.UNITS.H"),
      min: this.translate.instant("SERVICES.UNITS.MIN"),
    };
    return this.items().map((i) => this.toCard(i, lang, currency, units));
  });

  /** Screen-reader summary of what the queue shows, spoken (politely) after every load. */
  protected readonly announcement = computed(() => {
    const meta = this.meta();
    if (this.loading() || this.hasError() || meta === null) return "";
    this.language.currentLang();
    return this.translate.instant(
      meta.totalCount === 0 ? "PAYMENT_REVIEWS.RESULTS_NONE" : "PAYMENT_REVIEWS.RESULTS",
      { count: this.items().length, total: meta.totalCount },
    );
  });

  /** Longest reason the API accepts (read when the dialog binds, not at construction). */
  protected get rejectMaxLength(): number {
    return REJECT_REASON_MAX_LENGTH;
  }

  ngOnInit(): void {
    this.service.initialize();

    // Waiting times keep growing and unreviewed bookings expire: reload quietly every minute. The
    // timer runs OUTSIDE the Angular zone (a never-ending interval would keep the app "unstable"
    // for ever) and steps back in only for the reload.
    const timer = this.zone.runOutsideAngular(() =>
      setInterval(() => this.zone.run(() => this.autoRefresh()), REVIEWS_AUTO_REFRESH_MS),
    );
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  // The queue may have moved on while the tab was in the background.
  @HostListener("window:focus")
  @HostListener("document:visibilitychange")
  protected autoRefresh(): void {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    this.service.refresh();
  }

  // ── Navigation ───────────────────────────────────────
  protected onBranch(value: string): void {
    if (value === "") return;
    this.service.selectBranch(Number(value));
  }

  protected onTab(value: string): void {
    this.service.setTab(Number(value) as PaymentReviewTab);
  }

  protected onPage(page: number): void {
    this.service.setPage(page);
  }

  protected reload(): void {
    this.service.load();
  }

  protected refresh(): void {
    this.service.refresh();
  }

  // ── Reviewing ────────────────────────────────────────
  protected isPending(id: number): boolean {
    return this.pendingIds().has(id);
  }

  protected askApprove(card: ReviewCard): void {
    if (!this.canReview() || this.isPending(card.id)) return;
    this.approveTarget.set(card);
  }

  protected askReject(card: ReviewCard): void {
    if (!this.canReview() || this.isPending(card.id)) return;
    this.rejectTarget.set(card);
  }

  protected confirmApprove(): void {
    const card = this.approveTarget();
    if (!card || this.isPending(card.id)) return;
    this.service.approve(card.id).subscribe(() => this.approveTarget.set(null));
  }

  protected confirmReject(reason: string): void {
    const card = this.rejectTarget();
    if (!card || this.isPending(card.id)) return;
    this.service.reject(card.id, reason).subscribe(() => this.rejectTarget.set(null));
  }

  // ── Dialog texts ─────────────────────────────────────
  protected approveMessage(): string {
    const card = this.approveTarget();
    return this.translate.instant("PAYMENT_REVIEWS.APPROVE_MESSAGE", {
      id: card?.idLabel ?? "",
      name: card?.customerName ?? "",
      amount: card?.amount ?? "",
      method: card?.methodLabel ?? "",
    });
  }

  protected proofCaption(card: ReviewCard): string {
    return this.translate.instant("PAYMENT_REVIEWS.PROOF_CAPTION", {
      id: card.idLabel,
      amount: card.amount,
      method: card.methodLabel,
    });
  }

  protected proofAlt(card: ReviewCard): string {
    return this.translate.instant("PAYMENT_REVIEWS.PROOF_ALT", { id: card.idLabel });
  }

  protected waitingLabel(card: ReviewCard): string {
    return this.translate.instant("PAYMENT_REVIEWS.WAITING", { time: card.waiting });
  }

  // ── Helpers ──────────────────────────────────────────
  private toCard(
    i: PaymentReviewItem,
    lang: string,
    currency: string,
    units: { h: string; min: string },
  ): ReviewCard {
    const t = (key: string): string => this.translate.instant(key);

    return {
      id: i.id,
      idLabel: `#${i.id}`,
      typeLabel: i.type === BookingType.Regular ? null : t(bookingTypeKey(i.type)),
      typeVariant: bookingTypeVariant(i.type),
      startDate: formatBookingDate(i.startAt, lang),
      startTime: formatBookingTime(i.startAt, lang),
      customerName: i.customer.fullName,
      customerPhone: i.customer.phoneNumber,
      services: bookingItemsLabel(i.items, lang),
      methodLabel: t(paymentMethodKey(i.payment.method)),
      methodIcon: paymentMethodIcon(i.payment.method),
      amount: formatPrice(i.payment.totalPrice, lang, currency),
      proofUrl: i.payment.proofUrl,
      waiting: i.waitingMinutes === null ? null : formatDuration(i.waitingMinutes, units),
      isLate: i.isLate,
      statusLabel: t(bookingStatusKey(i.status)),
      statusVariant: bookingStatusVariant(i.status),
    };
  }
}
