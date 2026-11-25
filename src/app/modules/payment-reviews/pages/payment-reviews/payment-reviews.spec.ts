import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Observable, Subject, of, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ar from "../../../../../assets/i18n/ar.json";
import en from "../../../../../assets/i18n/en.json";
import { LanguageService } from "@core/services/language.service";
import { NotificationService } from "@core/services/notification.service";
import { ApiResponse, PaginationMeta } from "@shared/model/api_response.model";
import { AuthService } from "../../../auth/service/auth.service";
import { BookingStatus, BookingType, PaymentMethod } from "../../../bookings/model/booking.model";
import { BranchesService } from "../../../branches/service/branches.service";
import {
  PaymentReviewItem,
  PaymentReviewTab,
  PaymentReviewsQuery,
  RejectBookingRequest,
} from "../../model/payment-review.model";
import { PAYMENT_REVIEW_REPOSITORY } from "../../repository/payment-review.repository";
import { PaymentReviewsPage } from "./payment-reviews";

const plain = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

const PROOF = "https://api.odelsalon.com/payments/3f2a9c1e.jpg";

function review(id: number, over: Partial<PaymentReviewItem> = {}): PaymentReviewItem {
  return {
    id,
    status: BookingStatus.PendingReview,
    type: BookingType.Regular,
    startAt: "2026-11-13T21:30:00",
    customer: { fullName: `Customer ${id}`, phoneNumber: "+201017772310" },
    items: [
      { nameAr: "قص شعر", nameEn: "Haircut" },
      { nameAr: "تحديد لحية", nameEn: "Beard trim" },
    ],
    payment: { method: PaymentMethod.InstaPay, totalPrice: 340, proofUrl: PROOF },
    waitingMinutes: 12,
    isLate: false,
    ...over,
  };
}

function envelope(
  data: PaymentReviewItem[],
  over: Partial<PaginationMeta> = {},
  counters: Record<string, number> = {},
): ApiResponse<PaymentReviewItem[]> {
  return {
    status: true,
    statusCode: 200,
    message: "ok",
    errors: null,
    meta: {
      currentPage: 1,
      pageSize: 20,
      totalPages: 1,
      totalCount: data.length,
      hasPreviousPage: false,
      hasNextPage: false,
      additionalData: {
        toReviewCount: 5,
        approvedTodayCount: 2,
        rejectedTodayCount: 1,
        reviewTargetMinutes: 30,
        ...counters,
      },
      ...over,
    },
    data,
  };
}

const done = (): ApiResponse<null> => ({
  status: true,
  statusCode: 200,
  message: "ok",
  errors: null,
  meta: null,
  data: null,
});

class FakeRepo {
  queries: PaymentReviewsQuery[] = [];
  approved: number[] = [];
  rejected: Array<{ id: number; payload: RejectBookingRequest }> = [];
  respond: (q: PaymentReviewsQuery) => Observable<ApiResponse<PaymentReviewItem[]>> = () =>
    of(envelope([]));
  approve: () => Observable<ApiResponse<null>> = () => of(done());
  rejectWith: () => Observable<ApiResponse<null>> = () => of(done());
  getPaymentReviews(q: PaymentReviewsQuery) {
    this.queries.push(structuredClone(q));
    return this.respond(q);
  }
  approveBooking(id: number) {
    this.approved.push(id);
    return this.approve();
  }
  rejectBooking(id: number, payload: RejectBookingRequest) {
    this.rejected.push({ id, payload });
    return this.rejectWith();
  }
  get last(): PaymentReviewsQuery {
    return this.queries[this.queries.length - 1];
  }
}

describe("PaymentReviewsPage", () => {
  let repo: FakeRepo;
  let fixture: ComponentFixture<PaymentReviewsPage>;
  let granted: string[];
  let branches: Array<{ id: number; nameAr: string; nameEn: string }>;
  let success: ReturnType<typeof vi.fn>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => plain(el().textContent);
  const cards = () => Array.from(el().querySelectorAll<HTMLElement>("ul.grid > li.review"));
  const tabs = () => Array.from(el().querySelectorAll<HTMLElement>('[role="tab"]'));
  const cardButton = (card: HTMLElement, label: "Reject" | "Approve") =>
    Array.from(card.querySelectorAll<HTMLButtonElement>(".review__actions button")).find((b) =>
      plain(b.textContent).includes(label),
    )!;
  const confirmDialog = () => el().querySelector<HTMLElement>('[role="alertdialog"]');
  const confirmButtons = () =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('[role="alertdialog"] app-button button'));
  const rejectBox = () => el().querySelector<HTMLTextAreaElement>(".dialog textarea");
  const rejectButtons = () =>
    Array.from(el().querySelectorAll<HTMLButtonElement>(".dialog__actions button"));
  const viewer = () => el().querySelector<HTMLElement>(".viewer");

  async function open(initial?: ApiResponse<PaymentReviewItem[]>) {
    if (initial) repo.respond = () => of(initial);
    fixture = TestBed.createComponent(PaymentReviewsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const sample = () =>
    envelope([
      review(489, { type: BookingType.Vip }),
      review(487, {
        payment: { method: PaymentMethod.MobileWallet, totalPrice: 260, proofUrl: PROOF },
        waitingMinutes: 39,
        isLate: true,
      }),
    ]);

  beforeEach(() => {
    repo = new FakeRepo();
    granted = ["Booking.View", "Booking.Review"];
    success = vi.fn();
    branches = [
      { id: 2, nameAr: "فرع ب", nameEn: "Branch B" },
      { id: 1, nameAr: "فرع أ", nameEn: "Branch A" },
    ];
    TestBed.configureTestingModule({
      imports: [PaymentReviewsPage, TranslateModule.forRoot()],
      providers: [
        { provide: PAYMENT_REVIEW_REPOSITORY, useValue: repo },
        { provide: BranchesService, useValue: { loadOptions: () => of(branches) } },
        { provide: AuthService, useValue: { hasPermission: (p: string) => granted.includes(p) } },
        { provide: NotificationService, useValue: { success, warning: vi.fn() } },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation("en", en);
    translate.setTranslation("ar", ar);
    translate.use("en");
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    localStorage.removeItem("odl_lang");
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("dir");
  });

  describe("opening", () => {
    it("opens the first (oldest) branch on the To review tab", async () => {
      await open(sample());

      expect(repo.queries).toHaveLength(1);
      expect(repo.last).toEqual({ branchId: 1, pageNumber: 1, pageSize: 20, tab: 0 });
      const select = el().querySelector<HTMLSelectElement>(
        'app-filter-select select[aria-label="Branch"]',
      )!;
      expect(select.value).toBe("1");
    });

    it("shows a skeleton, not an empty state, while the first load runs", () => {
      repo.respond = () => new Subject<ApiResponse<PaymentReviewItem[]>>();
      fixture = TestBed.createComponent(PaymentReviewsPage);
      fixture.detectChanges();

      expect(el().querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(text()).not.toContain("Nothing to review");
    });
  });

  describe("coming back to the page", () => {
    it("starts on To review, page 1 (the branch is kept)", async () => {
      await open(sample());
      const select = el().querySelector<HTMLSelectElement>(
        'app-filter-select select[aria-label="Branch"]',
      )!;
      select.value = "2";
      select.dispatchEvent(new Event("change"));
      await settle();
      tabs()[2].click(); // Rejected today
      await settle();
      expect(repo.last).toMatchObject({ branchId: 2, tab: PaymentReviewTab.RejectedToday });

      // Leave the page and come back.
      fixture.destroy();
      repo.queries = [];
      await open(sample());

      expect(repo.queries).toHaveLength(1);
      expect(repo.last).toEqual({ branchId: 2, pageNumber: 1, pageSize: 20, tab: 0 });
      expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
      expect(el().querySelector("#reviews-panel")?.getAttribute("aria-labelledby")).toBe(
        "reviews-tab-0",
      );
      expect(
        el().querySelector<HTMLSelectElement>('app-filter-select select[aria-label="Branch"]')!
          .value,
      ).toBe("2");
    });

    it("doesn't show the cards of the other tab while To review reloads", async () => {
      await open(sample());
      repo.respond = () =>
        of(envelope([review(480, { status: BookingStatus.Confirmed, waitingMinutes: null })]));
      tabs()[1].click(); // Approved today
      await settle();
      fixture.destroy();

      repo.respond = () => new Subject<ApiResponse<PaymentReviewItem[]>>();
      fixture = TestBed.createComponent(PaymentReviewsPage);
      fixture.detectChanges();

      expect(cards()).toHaveLength(0);
      expect(el().querySelector('[aria-busy="true"]')).not.toBeNull();
    });
  });

  describe("cards", () => {
    it("shows what the reviewer needs: id, customer, call link, services, method, amount due and start", async () => {
      await open(sample());
      const card = cards()[0];

      expect(plain(card.querySelector(".review__id")?.textContent)).toBe("#489");
      expect(plain(card.textContent)).toContain("Customer 489");
      expect(plain(card.textContent)).toContain("Haircut, Beard trim");
      expect(plain(card.textContent)).toContain("InstaPay");
      expect(plain(card.querySelector(".amount__value")?.textContent)).toBe("EGP 340");
      expect(plain(card.textContent)).toContain("Nov 13, 2026");
      expect(plain(card.textContent)).toContain("9:30 PM");
      const phone = card.querySelector<HTMLAnchorElement>("a.phone")!;
      expect(phone.getAttribute("href")).toBe("tel:+201017772310");
      expect(phone.getAttribute("dir")).toBe("ltr");
    });

    it("shows the wallet method with its icon", async () => {
      await open(sample());
      const card = cards()[1];

      expect(plain(card.textContent)).toContain("Mobile wallet");
      expect(card.querySelector("i.pi-mobile")).not.toBeNull();
      expect(plain(card.querySelector(".amount__value")?.textContent)).toBe("EGP 260");
    });

    it("badges only VIP and Home bookings", async () => {
      await open(sample());

      expect(plain(cards()[0].querySelector(".badge--vip")?.textContent)).toBe("VIP");
      expect(cards()[1].querySelector(".badge--vip, .badge--info")).toBeNull();
    });

    it("shows the screenshot with a descriptive alt and a button that names the booking", async () => {
      await open(sample());
      const proof = cards()[0].querySelector<HTMLButtonElement>("button.proof")!;
      const img = proof.querySelector("img")!;

      expect(img.getAttribute("src")).toBe(PROOF);
      expect(img.getAttribute("alt")).toBe("Payment proof of #489");
      expect(proof.getAttribute("aria-label")).toBe("View payment proof of #489");
      expect(img.getAttribute("loading")).toBe("lazy");
    });

    it("shows how long each proof has waited, and marks the late ones (not by colour alone)", async () => {
      await open(sample());
      const [fresh, late] = cards();

      expect(plain(fresh.querySelector(".wait")?.textContent)).toBe("Waiting 12 min");
      expect(fresh.classList.contains("review--late")).toBe(false);
      expect(fresh.querySelector(".badge--danger")).toBeNull();

      expect(plain(late.querySelector(".wait")?.textContent)).toBe("Waiting 39 min");
      expect(late.classList.contains("review--late")).toBe(true);
      expect(late.querySelector(".wait--late")).not.toBeNull();
      expect(plain(late.querySelector(".badge--danger")?.textContent)).toBe("Late");
    });

    it("writes a long wait in hours", async () => {
      await open(envelope([review(1, { waitingMinutes: 125, isLate: true })]));

      expect(plain(cards()[0].querySelector(".wait")?.textContent)).toBe("Waiting 2 h 5 min");
    });
  });

  describe("tabs and counters", () => {
    it("has the three tabs with the branch's counts", async () => {
      await open(sample());

      expect(
        tabs().map(
          (t) =>
            `${plain(t.querySelector(".tabs__label")?.textContent)} ${plain(t.querySelector(".tabs__count")?.textContent)}`,
        ),
      ).toEqual(["To review 5", "Approved today 2", "Rejected today 1"]);
      expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
    });

    it("shows no counts before the first response (never a misleading 0)", () => {
      repo.respond = () => new Subject<ApiResponse<PaymentReviewItem[]>>();
      fixture = TestBed.createComponent(PaymentReviewsPage);
      fixture.detectChanges();

      expect(el().querySelector(".tabs__count")).toBeNull();
      expect(el().querySelector(".target")).toBeNull();
    });

    it("shows the review-time target, and hides it when the server doesn't send one", async () => {
      await open(sample());
      expect(plain(el().querySelector(".target")?.textContent)).toBe("Review time 30 min");

      fixture.destroy();
      repo.respond = () => of(envelope([review(1)], {}, { reviewTargetMinutes: 0 }));
      await open();
      expect(el().querySelector(".target")).toBeNull();
    });

    it("loads another tab from page 1; reviewed tabs show the status and no actions", async () => {
      await open(sample());
      repo.respond = () =>
        of(envelope([review(480, { status: BookingStatus.Confirmed, waitingMinutes: null })]));

      tabs()[1].click();
      await settle();

      expect(repo.last).toMatchObject({ tab: PaymentReviewTab.ApprovedToday, pageNumber: 1 });
      expect(tabs()[1].getAttribute("aria-selected")).toBe("true");
      expect(plain(cards()[0].querySelector(".badge")?.textContent)).toBe("Confirmed");
      expect(cards()[0].querySelector(".wait")).toBeNull();
      expect(cards()[0].querySelector(".review__actions")).toBeNull();
    });

    it("points the panel at the selected tab (for screen readers)", async () => {
      await open(sample());
      tabs()[2].click();
      await settle();

      const panel = el().querySelector("#reviews-panel")!;
      expect(panel.getAttribute("role")).toBe("tabpanel");
      expect(panel.getAttribute("aria-labelledby")).toBe("reviews-tab-2");
    });

    it("switching branch asks for the other branch's queue", async () => {
      await open(sample());
      const select = el().querySelector<HTMLSelectElement>(
        'app-filter-select select[aria-label="Branch"]',
      )!;

      select.value = "2";
      select.dispatchEvent(new Event("change"));
      await settle();

      expect(repo.last.branchId).toBe(2);
    });
  });

  describe("refreshing", () => {
    it("shows when the queue was last brought up to date", async () => {
      await open(sample());

      expect(plain(el().querySelector(".updated")?.textContent)).toMatch(
        /^Updated \d{1,2}:\d{2}\s?(AM|PM)$/,
      );
    });

    it("reloads quietly from the Refresh button: the cards stay on screen", async () => {
      await open(sample());
      const hold = new Subject<ApiResponse<PaymentReviewItem[]>>();
      repo.respond = () => hold;

      Array.from(el().querySelectorAll<HTMLButtonElement>(".toolbar app-button button"))
        .find((b) => plain(b.textContent).includes("Refresh"))!
        .click();
      fixture.detectChanges();

      expect(repo.queries).toHaveLength(2);
      expect(cards()).toHaveLength(2);
      expect(el().querySelector('[aria-busy="true"]')).toBeNull();
      expect(el().querySelector(".toolbar i.pi-spin")).not.toBeNull();

      hold.next(envelope([review(1)]));
      hold.complete();
      await settle();
      expect(cards()).toHaveLength(1);
      expect(el().querySelector(".toolbar i.pi-spin")).toBeNull();
    });

    it("reloads by itself every minute", async () => {
      vi.useFakeTimers();
      await open(sample());
      expect(repo.queries).toHaveLength(1);

      vi.advanceTimersByTime(60_000);
      expect(repo.queries).toHaveLength(2);

      vi.advanceTimersByTime(60_000);
      expect(repo.queries).toHaveLength(3);
    });

    it("doesn't reload while the tab is hidden", async () => {
      vi.useFakeTimers();
      await open(sample());
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });

      vi.advanceTimersByTime(120_000);

      expect(repo.queries).toHaveLength(1);
    });

    it("reloads when the tab regains focus", async () => {
      await open(sample());

      window.dispatchEvent(new Event("focus"));

      expect(repo.queries).toHaveLength(2);
    });

    it("stops the timer when the page is left", async () => {
      vi.useFakeTimers();
      await open(sample());

      fixture.destroy();
      vi.advanceTimersByTime(180_000);

      expect(repo.queries).toHaveLength(1);
    });

    it("ignores a failed background reload: no error, the cards stay", async () => {
      await open(sample());
      repo.respond = () => throwError(() => ({ status: 500 }));

      window.dispatchEvent(new Event("focus"));
      await settle();

      expect(el().querySelector("app-failed-state")).toBeNull();
      expect(cards()).toHaveLength(2);
    });
  });

  describe("approving", () => {
    it("asks first, repeating the amount due so it can be compared with the screenshot", async () => {
      await open(sample());

      cardButton(cards()[0], "Approve").click();
      fixture.detectChanges();

      expect(confirmDialog()).not.toBeNull();
      expect(plain(confirmDialog()!.querySelector("h2")?.textContent)).toBe(
        "Approve this booking?",
      );
      expect(plain(confirmDialog()!.querySelector("p")?.textContent)).toBe(
        "#489 for Customer 489 will be confirmed. Amount due: EGP 340 via InstaPay.",
      );
      expect(repo.approved).toEqual([]);
    });

    it("does nothing when cancelled", async () => {
      await open(sample());
      cardButton(cards()[0], "Approve").click();
      fixture.detectChanges();

      confirmButtons()[0].click();
      fixture.detectChanges();

      expect(confirmDialog()).toBeNull();
      expect(repo.approved).toEqual([]);
    });

    it("approves, closes the dialog and reloads the queue", async () => {
      await open(sample());
      cardButton(cards()[0], "Approve").click();
      fixture.detectChanges();
      repo.respond = () =>
        of(envelope([review(487)], {}, { toReviewCount: 4, approvedTodayCount: 3 }));

      confirmButtons()[1].click();
      await settle();

      expect(repo.approved).toEqual([489]);
      expect(success).toHaveBeenCalledWith("PAYMENT_REVIEWS.APPROVED");
      expect(confirmDialog()).toBeNull();
      expect(repo.queries).toHaveLength(2);
      expect(cards().map((c) => plain(c.querySelector(".review__id")?.textContent))).toEqual([
        "#487",
      ]);
      expect(plain(tabs()[0].querySelector(".tabs__count")?.textContent)).toBe("4");
      expect(plain(tabs()[1].querySelector(".tabs__count")?.textContent)).toBe("3");
    });

    it("closes and reloads after a failure too (409: someone else got there first)", async () => {
      await open(sample());
      cardButton(cards()[0], "Approve").click();
      fixture.detectChanges();
      repo.approve = () => throwError(() => ({ status: 409 }));
      repo.respond = () => of(envelope([review(487)]));

      confirmButtons()[1].click();
      await settle();

      expect(success).not.toHaveBeenCalled();
      expect(confirmDialog()).toBeNull();
      expect(repo.queries).toHaveLength(2);
      expect(cards()).toHaveLength(1);
    });

    it("locks only the booking being saved", async () => {
      await open(sample());
      const hold = new Subject<ApiResponse<null>>();
      repo.approve = () => hold;
      cardButton(cards()[0], "Approve").click();
      fixture.detectChanges();

      confirmButtons()[1].click();
      fixture.detectChanges();

      expect(cardButton(cards()[0], "Reject").disabled).toBe(true);
      expect(cardButton(cards()[0], "Approve").getAttribute("aria-busy")).toBe("true");
      expect(cardButton(cards()[1], "Reject").disabled).toBe(false);
      expect(cardButton(cards()[1], "Approve").disabled).toBe(false);

      hold.next(done());
      hold.complete();
      await settle();
    });

    it("sends the request once even if confirmed twice while it runs", async () => {
      await open(sample());
      const hold = new Subject<ApiResponse<null>>();
      repo.approve = () => hold;
      cardButton(cards()[0], "Approve").click();
      fixture.detectChanges();

      confirmButtons()[1].click();
      confirmButtons()[1].click();

      expect(repo.approved).toEqual([489]);
      hold.next(done());
      hold.complete();
    });

    it("names the booking on each button for screen readers", async () => {
      await open(sample());

      expect(cardButton(cards()[0], "Approve").getAttribute("aria-label")).toBe(
        "Approve booking #489",
      );
      expect(cardButton(cards()[0], "Reject").getAttribute("aria-label")).toBe(
        "Reject booking #489",
      );
    });
  });

  describe("rejecting", () => {
    it("asks for the reason, and tells the reviewer the customer will see it", async () => {
      await open(sample());

      cardButton(cards()[0], "Reject").click();
      fixture.detectChanges();

      expect(rejectBox()).not.toBeNull();
      expect(text()).toContain("The customer will see this reason.");
      expect(el().querySelector("#reject-counter")?.textContent?.trim()).toBe("0/500");
      expect(rejectBox()!.getAttribute("maxlength")).toBe("500");
    });

    it("won't send without a reason", async () => {
      await open(sample());
      cardButton(cards()[0], "Reject").click();
      fixture.detectChanges();

      rejectButtons()[1].click();
      fixture.detectChanges();

      expect(repo.rejected).toEqual([]);
      expect(el().querySelector('.dialog [role="alert"]')?.textContent).toContain(
        "Write the reason for rejecting this booking.",
      );
    });

    it("rejects with the trimmed reason, closes and reloads", async () => {
      await open(sample());
      cardButton(cards()[1], "Reject").click();
      fixture.detectChanges();
      rejectBox()!.value = "  The transferred amount doesn't match the booking total.  ";
      rejectBox()!.dispatchEvent(new Event("input"));
      repo.respond = () => of(envelope([review(489)]));

      rejectButtons()[1].click();
      await settle();

      expect(repo.rejected).toEqual([
        { id: 487, payload: { reason: "The transferred amount doesn't match the booking total." } },
      ]);
      expect(success).toHaveBeenCalledWith("PAYMENT_REVIEWS.REJECTED");
      expect(rejectBox()).toBeNull();
      expect(repo.queries).toHaveLength(2);
      expect(cards()).toHaveLength(1);
    });

    it("cancels without sending", async () => {
      await open(sample());
      cardButton(cards()[0], "Reject").click();
      fixture.detectChanges();

      rejectButtons()[0].click();
      fixture.detectChanges();

      expect(rejectBox()).toBeNull();
      expect(repo.rejected).toEqual([]);
    });

    it("closes and reloads after a failure too", async () => {
      await open(sample());
      cardButton(cards()[0], "Reject").click();
      fixture.detectChanges();
      rejectBox()!.value = "Wrong amount";
      rejectBox()!.dispatchEvent(new Event("input"));
      repo.rejectWith = () => throwError(() => ({ status: 409 }));

      rejectButtons()[1].click();
      await settle();

      expect(success).not.toHaveBeenCalled();
      expect(rejectBox()).toBeNull();
      expect(repo.queries).toHaveLength(2);
    });

    it("starts empty for the next booking", async () => {
      await open(sample());
      cardButton(cards()[0], "Reject").click();
      fixture.detectChanges();
      rejectBox()!.value = "Wrong amount";
      rejectBox()!.dispatchEvent(new Event("input"));
      rejectButtons()[0].click();
      fixture.detectChanges();

      cardButton(cards()[1], "Reject").click();
      fixture.detectChanges();
      await settle();

      expect(rejectBox()!.value).toBe("");
    });
  });

  describe("the card", () => {
    const part = (card: HTMLElement, selector: string) => card.querySelector(selector);
    const infoOf = (card: HTMLElement) =>
      Array.from(card.querySelectorAll(".info__item")).map((i) => [
        plain(i.querySelector("dt")?.textContent),
        plain(i.querySelector("dd")?.textContent),
      ]);

    it("has a header, a two-column body and — for a reviewer — a footer", async () => {
      await open(sample());
      const card = cards()[0];

      expect(part(card, ".review__head")).not.toBeNull();
      expect(card.querySelector(".review__body > .proof")).not.toBeNull();
      expect(card.querySelector(".review__body > .review__details")).not.toBeNull();
      expect(part(card, "footer.review__actions")).not.toBeNull();
    });

    it("puts the id, the status badge and the waiting time in the header; Late only when late", async () => {
      await open(sample());
      const [onTime, late] = cards();

      expect(plain(onTime.querySelector(".review__id")?.textContent)).toBe("#489");
      expect(plain(onTime.querySelector(".review__state app-status-badge")?.textContent)).toBe(
        "Waiting for branch",
      );
      expect(plain(onTime.querySelector(".wait")?.textContent)).toContain("Waiting");
      expect(onTime.querySelector(".review__state")?.textContent).not.toContain("Late");
      expect(late.classList.contains("review--late")).toBe(true);
      expect(plain(late.querySelector(".review__state")?.textContent)).toContain("Late");
    });

    it("shows the status badge but no waiting time on the reviewed tabs", async () => {
      await open(sample());
      repo.respond = () =>
        of(
          envelope([
            review(5, { status: BookingStatus.Confirmed, waitingMinutes: null, isLate: false }),
          ]),
        );
      tabs()[1].click();
      await settle();

      const card = cards()[0];
      expect(plain(card.querySelector(".review__state app-status-badge")?.textContent)).toBe(
        "Confirmed",
      );
      expect(card.querySelector(".wait")).toBeNull();
    });

    it("makes the amount due the prominent figure, above the details", async () => {
      await open(sample());
      const details = cards()[0].querySelector(".review__details")!;

      expect(details.firstElementChild?.classList.contains("amount")).toBe(true);
      expect(plain(details.querySelector(".amount__label")?.textContent)).toBe("Amount due");
      expect(plain(details.querySelector(".amount__value")?.textContent)).toBe("EGP 340");
    });

    it("lays the details out as a grid: customer, phone, method, services, date, start time", async () => {
      await open(sample());

      expect(infoOf(cards()[0])).toEqual([
        ["Customer", "Customer 489"],
        ["Phone", "+201017772310"],
        ["Payment method", "InstaPay"],
        ["Services", "Haircut, Beard trim"],
        ["Date", expect.stringMatching(/\d{4}/)],
        ["Start time", expect.stringMatching(/\d/)],
      ]);
    });

    it("offers the zoom on the screenshot as a visible action", async () => {
      await open(sample());
      const proof = cards()[0].querySelector<HTMLButtonElement>(".proof")!;

      expect(plain(proof.querySelector(".proof__zoom")?.textContent)).toBe("Zoom");
      proof.click();
      await settle();
      expect(el().querySelector('[role="dialog"]')).not.toBeNull();
    });

    it("gives Reject and Approve the same size (both fill their grid cell)", async () => {
      await open(sample());
      const buttons = Array.from(
        cards()[0].querySelectorAll<HTMLElement>(".review__actions app-button button"),
      );

      expect(buttons).toHaveLength(2);
      for (const b of buttons) expect(b.classList.contains("btn--full")).toBe(true);
    });

    it("has a skeleton in the same two-column shape while loading", () => {
      repo.respond = () => new Subject<ApiResponse<PaymentReviewItem[]>>();
      fixture = TestBed.createComponent(PaymentReviewsPage);
      fixture.detectChanges();

      expect(el().querySelectorAll(".review .review__body").length).toBeGreaterThan(0);
      expect(el().querySelector(".review .proof")).toBeNull();
    });
  });

  describe("actions follow the cards on screen, not just the selected tab", () => {
    const footers = () => el().querySelectorAll(".review__actions").length;

    it("never shows them on another tab's cards while that tab loads (the reported flash)", async () => {
      await open(sample());
      repo.respond = () =>
        of(envelope([review(5, { status: BookingStatus.Rejected, waitingMinutes: null })]));
      tabs()[2].click(); // Rejected today: its cards, no buttons
      await settle();
      expect(cards()).toHaveLength(1);
      expect(footers()).toBe(0);

      // Back to To review, whose response is still on its way.
      const hold = new Subject<ApiResponse<PaymentReviewItem[]>>();
      repo.respond = () => hold;
      tabs()[0].click();
      fixture.detectChanges();

      expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
      expect(cards()).toHaveLength(0); // the rejected cards are gone, not shown under To review
      expect(footers()).toBe(0); // …and so are their buttons

      hold.next(sample());
      await settle();
      expect(cards()).toHaveLength(2);
      expect(footers()).toBe(2);
    });

    it("rejecting and then switching tab never flashes buttons on the cards in between", async () => {
      await open(sample());
      const hold = new Subject<ApiResponse<PaymentReviewItem[]>>();
      repo.respond = () => hold;

      tabs()[1].click(); // straight after a review, before anything has loaded
      fixture.detectChanges();
      tabs()[0].click();
      fixture.detectChanges();

      expect(cards()).toHaveLength(0);
      expect(footers()).toBe(0);
    });

    it("shows them again on To review, and only to a user who may review", async () => {
      granted = ["Booking.View"];
      await open(sample());

      expect(cards()).toHaveLength(2);
      expect(footers()).toBe(0);
    });

    it("never shows them on the reviewed tabs, even for a reviewer", async () => {
      await open(sample());
      repo.respond = () => of(envelope([review(5, { status: BookingStatus.Confirmed })]));
      tabs()[1].click();
      await settle();

      expect(cards()).toHaveLength(1);
      expect(footers()).toBe(0);
    });
  });

  describe("permission", () => {
    it("is read-only without Booking.Review: no Approve / Reject, the proof can still be opened", async () => {
      granted = ["Booking.View"];
      await open(sample());

      expect(el().querySelector(".review__actions")).toBeNull();
      cards()[0].querySelector<HTMLButtonElement>("button.proof")!.click();
      fixture.detectChanges();
      expect(viewer()).not.toBeNull();
    });

    it("can't start a review without the permission, even by calling the handlers", async () => {
      granted = ["Booking.View"];
      await open(sample());
      const page = fixture.componentInstance as unknown as {
        cards(): unknown[];
        askApprove(c: unknown): void;
        askReject(c: unknown): void;
      };

      page.askApprove(page.cards()[0]);
      page.askReject(page.cards()[0]);
      fixture.detectChanges();

      expect(confirmDialog()).toBeNull();
      expect(rejectBox()).toBeNull();
    });
  });

  describe("payment proof viewer", () => {
    it("opens the screenshot large, with the amount due to compare", async () => {
      await open(sample());

      cards()[0].querySelector<HTMLButtonElement>("button.proof")!.click();
      fixture.detectChanges();

      expect(viewer()!.querySelector("img")?.getAttribute("src")).toBe(PROOF);
      expect(plain(viewer()!.textContent)).toContain("#489 · EGP 340 due · InstaPay");
      expect(plain(viewer()!.textContent)).toContain("Open original");
    });

    it("closes from its close button", async () => {
      await open(sample());
      cards()[0].querySelector<HTMLButtonElement>("button.proof")!.click();
      fixture.detectChanges();

      viewer()!.querySelector<HTMLButtonElement>("button.viewer__close")!.click();
      fixture.detectChanges();

      expect(viewer()).toBeNull();
    });
  });

  describe("states and paging", () => {
    it("says there are no branches", async () => {
      branches = [];
      await open();

      expect(text()).toContain("No branches yet");
      expect(el().querySelector("app-tabs")).toBeNull();
      expect(repo.queries).toEqual([]);
    });

    it.each([
      [0, "Nothing to review"],
      [1, "No approvals today yet"],
      [2, "No rejections today"],
    ])("says so when tab %i is empty", async (tab, message) => {
      // The first tab is the one that opens; the others are reached by clicking their tab.
      await open(tab === 0 ? envelope([]) : sample());
      if (tab !== 0) {
        repo.respond = () => of(envelope([]));
        tabs()[tab].click();
        await settle();
      }

      expect(text()).toContain(message);
    });

    it("shows the failed state with a retry when the first load fails", async () => {
      repo.respond = () => throwError(() => ({ status: 500 }));
      await open();
      expect(el().querySelector("app-failed-state")).not.toBeNull();

      repo.respond = () => of(sample());
      el().querySelector<HTMLButtonElement>("app-failed-state button")!.click();
      await settle();

      expect(cards()).toHaveLength(2);
      expect(el().querySelector("app-failed-state")).toBeNull();
    });

    const page2 = () =>
      Array.from(el().querySelectorAll<HTMLButtonElement>("app-pagination button")).find(
        (b) => plain(b.textContent) === "2",
      )!;

    it("keeps the cards when a normal reload fails", async () => {
      await open(
        envelope([review(1), review(2)], { totalCount: 42, totalPages: 3, hasNextPage: true }),
      );
      repo.respond = () => throwError(() => ({ status: 500 }));

      page2().click(); // a reload of the SAME tab: its cards stay
      await settle();

      expect(cards()).toHaveLength(2);
      expect(el().querySelector("app-failed-state")).not.toBeNull();
    });

    it("pages the queue", async () => {
      await open(
        envelope([review(1), review(2)], { totalCount: 42, totalPages: 3, hasNextPage: true }),
      );

      const page2 = Array.from(
        el().querySelectorAll<HTMLButtonElement>("app-pagination button"),
      ).find((b) => plain(b.textContent) === "2")!;
      page2.click();
      await settle();

      expect(repo.last.pageNumber).toBe(2);
    });

    it("announces what the queue shows, politely", async () => {
      await open(envelope([review(1), review(2)], { totalCount: 7 }));
      const live = el().querySelector('[role="status"].sr-only')!;

      expect(live.getAttribute("aria-live")).toBe("polite");
      expect(plain(live.textContent)).toBe("Showing 2 of 7 payments");
    });
  });

  describe("Arabic", () => {
    it("renders the page, the tabs, the cards and the amounts in Arabic", async () => {
      TestBed.inject(LanguageService).setLang("ar");
      await open(sample());

      expect(el().querySelector("h1")?.textContent).toContain("مراجعة الدفع");
      expect(tabs().map((t) => plain(t.querySelector(".tabs__label")?.textContent))).toEqual([
        "قيد المراجعة",
        "تمت الموافقة اليوم",
        "مرفوضة اليوم",
      ]);
      const card = plain(cards()[0].textContent);
      expect(card).toContain("قص شعر، تحديد لحية");
      expect(card).toContain("إنستا باي");
      expect(card).toContain("المبلغ المطلوب");
      expect(plain(cards()[1].textContent)).toContain("متأخر");
      expect(plain(cards()[1].querySelector(".wait")?.textContent)).toContain("بالانتظار");
    });
  });
});
