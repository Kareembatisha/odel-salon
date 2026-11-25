import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Observable, Subject, of, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ar from "../../../../../assets/i18n/ar.json";
import en from "../../../../../assets/i18n/en.json";
import { LanguageService } from "@core/services/language.service";
import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import { BreadcrumbService } from "../../../../layout/main-layout/components/header/breadcrumb.service";
import { AuthService } from "../../../auth/service/auth.service";
import { BARBER_REPOSITORY } from "../../../barbers/repository/barber.repository";
import {
  BookingDetails,
  BookingStatus,
  BookingType,
  CancelReason,
  PaymentMethod,
  RefundStatus,
} from "../../model/booking.model";
import { BOOKING_REPOSITORY } from "../../repository/booking.repository";
import { BookingDetailsPage } from "./booking-details";

const plain = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function details(over: Partial<BookingDetails> = {}): BookingDetails {
  return {
    id: 482,
    bookingNumber: "OD-000482",
    status: BookingStatus.Confirmed,
    isInProgress: true,
    type: BookingType.Vip,
    startAt: "2026-11-13T19:00:00",
    durationMinutes: 50,
    barber: { id: 7, fullName: "Karim Adel", averageRating: 4.9 },
    chair: { id: 3, name: "VIP 1" },
    branch: { id: 1, nameAr: "مدينة نصر", nameEn: "Nasr City" },
    homeAddress: null,
    items: [
      { nameAr: "قص شعر", nameEn: "Haircut", durationMinutes: 30, price: 200 },
      { nameAr: "تحديد لحية", nameEn: "Beard trim", durationMinutes: 20, price: 140 },
    ],
    payment: { method: PaymentMethod.InstaPay, totalPrice: 340, subtotal: 340 },
    customer: {
      fullName: "Ahmed Hassan",
      phoneNumber: "+201001234567",
      id: 1203,
      visitsCount: 12,
      noShowCount: 1,
    },
    refund: null,
    cancellation: null,
    actions: { canComplete: true, canMarkRefunded: false, canCancel: false, canReassign: false },
    ...over,
  };
}

const ok = <T>(data: T): ApiResponse<T> => ({
  status: true,
  statusCode: 200,
  message: "ok",
  errors: null,
  meta: null,
  data,
});

class FakeRepo {
  reads: number[] = [];
  completes: number[] = [];
  noShows: number[] = [];
  refunds: number[] = [];
  cancels: Array<{ id: number; reason: string }> = [];
  reassigns: Array<{ id: number; barberId: number }> = [];
  read: () => Observable<ApiResponse<BookingDetails>> = () => of(ok(details()));
  complete: () => Observable<ApiResponse<null>> = () => of(ok(null));
  noShow: () => Observable<ApiResponse<null>> = () => of(ok(null));
  refund: () => Observable<ApiResponse<null>> = () => of(ok(null));
  cancel: () => Observable<ApiResponse<null>> = () => of(ok(null));
  reassign: () => Observable<ApiResponse<null>> = () => of(ok(null));
  markRefunded(id: number) {
    this.refunds.push(id);
    return this.refund();
  }
  markNoShow(id: number) {
    this.noShows.push(id);
    return this.noShow();
  }
  cancelBooking(id: number, reason: string) {
    this.cancels.push({ id, reason });
    return this.cancel();
  }
  reassignBarber(id: number, barberId: number) {
    this.reassigns.push({ id, barberId });
    return this.reassign();
  }
  getBookingById(id: number) {
    this.reads.push(id);
    return this.read();
  }
  completeBooking(id: number) {
    this.completes.push(id);
    return this.complete();
  }
}

describe("BookingDetailsPage", () => {
  let repo: FakeRepo;
  let fixture: ComponentFixture<BookingDetailsPage>;
  let granted: string[];
  let routeId: string;
  let success: ReturnType<typeof vi.fn>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => plain(el().textContent);
  const card = (id: string) => plain(el().querySelector(`#${id}`)?.closest("section")?.textContent);
  /** Direct children's text joined with a space — flex items have no whitespace between them. */
  const parts = (node: Element) =>
    Array.from(node.children)
      .map((c) => plain(c.textContent))
      .join(" ");
  /** "label value" for every fact of a card. */
  const facts = (id: string) =>
    Array.from(el().querySelector(`#${id}`)!.closest("section")!.querySelectorAll(".fact")).map(
      (f) =>
        `${plain(f.querySelector("dt")?.textContent)} ${plain(f.querySelector("dd")?.textContent)}`,
    );
  const endButton = () =>
    Array.from(el().querySelectorAll<HTMLButtonElement>("app-page-header app-button button")).find(
      (b) => plain(b.textContent).includes("End session"),
    );
  const dialog = () => el().querySelector<HTMLElement>('[role="alertdialog"]');
  const dialogButtons = () =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('[role="alertdialog"] app-button button'));

  async function open() {
    fixture = TestBed.createComponent(BookingDetailsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    repo = new FakeRepo();
    granted = ["Booking.View", "Booking.Manage", "Customer.View"];
    routeId = "482";
    success = vi.fn();

    TestBed.configureTestingModule({
      imports: [BookingDetailsPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BOOKING_REPOSITORY, useValue: repo },
        {
          provide: BARBER_REPOSITORY,
          useValue: {
            // Two active barbers of the booking's branch (one is the booking's own) + another branch's.
            getBarbers: () =>
              of(
                ok([
                  { id: 7, fullName: "Karim Adel", branchId: 1 },
                  { id: 8, fullName: "Youssef Samir", branchId: 1 },
                ]),
              ),
          },
        },
        { provide: AuthService, useValue: { hasPermission: (p: string) => granted.includes(p) } },
        { provide: NotificationService, useValue: { success, warning: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              get paramMap() {
                return convertToParamMap({ id: routeId });
              },
            },
          },
        },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation("en", en);
    translate.setTranslation("ar", ar);
    translate.use("en");
  });

  afterEach(() => {
    localStorage.removeItem("odl_lang");
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("dir");
  });

  describe("header", () => {
    it("reads the booking from the route and shows its number, date and time", async () => {
      await open();

      expect(repo.reads).toEqual([482]);
      expect(el().querySelector("h1")?.textContent).toContain("OD-000482");
      expect(plain(el().querySelector("app-page-header")?.textContent)).toContain(
        "Friday, November 13, 2026 · 7:00 PM",
      );
    });

    it("shows the status, the type and the duration", async () => {
      await open();
      const summary = plain(el().querySelector(".summary")?.textContent);

      expect(summary).toContain("Started");
      expect(summary).toContain("VIP");
      expect(summary).toContain("50 min");
    });

    it("shows the plain status when the booking isn't in progress", async () => {
      repo.read = () => of(ok(details({ isInProgress: false, type: BookingType.Regular })));
      await open();
      const summary = plain(el().querySelector(".summary")?.textContent);

      expect(summary).toContain("Confirmed");
      expect(summary).toContain("Regular");
      expect(summary).not.toContain("Started");
    });

    it("links back to the bookings list", async () => {
      await open();

      expect(el().querySelector<HTMLAnchorElement>("a.back")?.getAttribute("href")).toBe(
        "/main/bookings",
      );
    });

    it("puts the booking number in the breadcrumb", async () => {
      const set = vi.spyOn(TestBed.inject(BreadcrumbService), "setBreadcrumbs");
      await open();

      expect(set).toHaveBeenCalledWith([
        { label: "LAYOUT.NAV.BOOKINGS", route: "/main/bookings" },
        { label: "OD-000482" },
      ]);
    });
  });

  describe("appointment", () => {
    it("shows the barber with the rating, the chair and the branch", async () => {
      await open();
      const text = card("sec-appointment");

      expect(text).toContain("Karim Adel");
      expect(text).toContain("4.9");
      expect(text).toContain("VIP 1");
      expect(text).toContain("Nasr City");
      expect(text).not.toContain("Home address");
    });

    it("says 'No reviews yet' while the barber has no rating", async () => {
      repo.read = () =>
        of(ok(details({ barber: { id: 7, fullName: "Karim Adel", averageRating: null } })));
      await open();

      expect(card("sec-appointment")).toContain("No reviews yet");
    });

    it("shows the address and no chair for a Home booking", async () => {
      repo.read = () =>
        of(
          ok(
            details({ type: BookingType.Home, chair: null, homeAddress: "27 Mostafa El Nahas St" }),
          ),
        );
      await open();
      const text = card("sec-appointment");

      expect(text).toContain("Home address");
      expect(text).toContain("27 Mostafa El Nahas St");
      expect(text).not.toContain("Chair");
    });
  });

  describe("services and payment", () => {
    it("lists each service with its duration and price", async () => {
      await open();
      const items = Array.from(el().querySelectorAll(".item")).map(parts);

      expect(items).toEqual(["Haircut 30 min EGP 200", "Beard trim 20 min EGP 140"]);
    });

    it("shows the subtotal, the payment method and the total", async () => {
      await open();
      const rows = Array.from(el().querySelectorAll(".totals__row")).map(parts);

      expect(rows).toEqual(["Subtotal EGP 340", "Payment method InstaPay", "Total EGP 340"]);
      expect(el().querySelector(".totals i.pi-at")).not.toBeNull();
    });

    it("shows the wallet method with its icon", async () => {
      repo.read = () =>
        of(
          ok(
            details({
              payment: { method: PaymentMethod.MobileWallet, totalPrice: 340, subtotal: 340 },
            }),
          ),
        );
      await open();

      expect(card("sec-payment")).toContain("Mobile wallet");
      expect(el().querySelector(".totals i.pi-mobile")).not.toBeNull();
    });
  });

  describe("customer", () => {
    it("shows the name, the phone, the completed visits and the missed bookings", async () => {
      await open();
      expect(facts("sec-customer")).toEqual([
        "Name Ahmed Hassan",
        "Phone +201001234567",
        "Completed visits 12",
        "Missed bookings 1",
      ]);
    });

    it("makes the phone a left-to-right call link, and offers a Call button", async () => {
      await open();
      const links = Array.from(
        el().querySelectorAll<HTMLAnchorElement>("#sec-customer ~ * a, section a"),
      ).filter((a) => a.getAttribute("href")?.startsWith("tel:"));

      expect(links.length).toBeGreaterThanOrEqual(2);
      expect(links.every((a) => a.getAttribute("href") === "tel:+201001234567")).toBe(true);
      expect(el().querySelector('a.link[dir="ltr"]')).not.toBeNull();
      expect(plain(el().querySelector("a.call")?.textContent)).toBe("Call");
    });

    it("links to the customer's profile", async () => {
      await open();

      const link = Array.from(el().querySelectorAll("a")).find((a) =>
        a.getAttribute("href")?.startsWith("/main/customers/"),
      );

      expect(link?.getAttribute("href")).toBe("/main/customers/1203");
      expect(plain(link?.textContent)).toBe("Customer profile");
    });

    it("hides the profile link without Customer.View", async () => {
      granted = ["Booking.View", "Booking.Manage"];
      await open();

      expect(
        Array.from(el().querySelectorAll("a")).some((a) =>
          (a.getAttribute("href") ?? "").startsWith("/main/customers"),
        ),
      ).toBe(false);
    });
  });

  describe("refund", () => {
    it("is not shown for a booking without one", async () => {
      await open();

      expect(el().querySelector("#sec-refund")).toBeNull();
    });

    it("shows the status, the amount and the missed-booking fee", async () => {
      repo.read = () =>
        of(
          ok(
            details({
              status: BookingStatus.NoShow,
              isInProgress: false,
              refund: { status: RefundStatus.Waiting, amount: 96, feeAmount: 24 },
              actions: {
                canComplete: false,
                canMarkRefunded: true,
                canCancel: false,
                canReassign: false,
              },
            }),
          ),
        );
      await open();
      const text = card("sec-refund");

      expect(text).toContain("Refund waiting");
      expect(text).toContain("EGP 96");
      expect(text).toContain("Missed-booking fee");
      expect(text).toContain("EGP 24");
    });

    it("leaves out the fee when there is none", async () => {
      repo.read = () =>
        of(
          ok(
            details({
              status: BookingStatus.Cancelled,
              isInProgress: false,
              refund: { status: RefundStatus.Sent, amount: 340, feeAmount: null },
              actions: {
                canComplete: false,
                canMarkRefunded: false,
                canCancel: false,
                canReassign: false,
              },
            }),
          ),
        );
      await open();

      expect(card("sec-refund")).toContain("Refund sent");
      expect(card("sec-refund")).not.toContain("Missed-booking fee");
    });
  });

  describe("Refund sent", () => {
    const owed = (over: Partial<BookingDetails> = {}) =>
      details({
        status: BookingStatus.Cancelled,
        isInProgress: false,
        refund: { status: RefundStatus.Waiting, amount: 340, feeAmount: null },
        actions: {
          canComplete: false,
          canMarkRefunded: true,
          canCancel: false,
          canReassign: false,
        },
        ...over,
      });
    const refundButton = () =>
      Array.from(
        el().querySelectorAll<HTMLButtonElement>(
          'section[aria-labelledby="sec-refund"] app-button button',
        ),
      ).find((b) => plain(b.textContent).includes("Refund sent"));

    it("is offered in the refund card while a refund is owed (canMarkRefunded)", async () => {
      repo.read = () => of(ok(owed()));
      await open();

      expect(refundButton()).toBeDefined();
      expect(card("sec-refund")).toContain("outside the app");
    });

    it("is hidden when the server doesn't allow it, or without Booking.Manage", async () => {
      repo.read = () =>
        of(
          ok(
            owed({
              actions: {
                canComplete: false,
                canMarkRefunded: false,
                canCancel: false,
                canReassign: false,
              },
            }),
          ),
        );
      await open();
      expect(refundButton()).toBeUndefined();

      granted = ["Booking.View"];
      repo.read = () => of(ok(owed()));
      await open();
      expect(refundButton()).toBeUndefined();
    });

    it("asks first, naming the amount and the customer, and records nothing until confirmed", async () => {
      repo.read = () => of(ok(owed()));
      await open();

      refundButton()!.click();
      fixture.detectChanges();

      expect(plain(dialog()!.querySelector("h2")?.textContent)).toBe("Mark the refund as sent?");
      expect(plain(dialog()!.textContent)).toContain("EGP 340");
      expect(plain(dialog()!.textContent)).toContain("Ahmed Hassan");
      expect(plain(dialog()!.textContent)).toContain("OD-000482");
      expect(repo.refunds).toEqual([]);
    });

    it("records the refund, toasts, closes the dialog and re-reads the booking", async () => {
      repo.read = () => of(ok(owed()));
      await open();
      refundButton()!.click();
      fixture.detectChanges();

      dialogButtons()[1].click();
      await settle();

      expect(repo.refunds).toEqual([482]);
      expect(repo.reads).toEqual([482, 482]);
      expect(success).toHaveBeenCalledWith("BOOKINGS.REFUND_MARKED");
      expect(dialog()).toBeNull();
    });

    it("re-reads after a failure too (409: already marked)", async () => {
      repo.read = () => of(ok(owed()));
      await open();
      repo.refund = () => throwError(() => ({ status: 409 }));
      refundButton()!.click();
      fixture.detectChanges();

      dialogButtons()[1].click();
      await settle();

      expect(success).not.toHaveBeenCalled();
      expect(repo.reads).toEqual([482, 482]);
    });

    it("keeps the refund owed when the dialog is dismissed", async () => {
      repo.read = () => of(ok(owed()));
      await open();
      refundButton()!.click();
      fixture.detectChanges();

      dialogButtons()[0].click();
      fixture.detectChanges();

      expect(dialog()).toBeNull();
      expect(repo.refunds).toEqual([]);
    });
  });

  describe("End session", () => {
    it("is offered when the server allows it and the user can manage bookings", async () => {
      await open();

      expect(endButton()).toBeDefined();
    });

    it("is hidden without Booking.Manage", async () => {
      granted = ["Booking.View"];
      await open();

      expect(endButton()).toBeUndefined();
      expect(text()).not.toContain("You can end the session or mark it as missed once it starts.");
    });

    it("is hidden when the server doesn't allow it", async () => {
      repo.read = () =>
        of(
          ok(
            details({
              status: BookingStatus.Completed,
              isInProgress: false,
              actions: {
                canComplete: false,
                canMarkRefunded: false,
                canCancel: false,
                canReassign: false,
              },
            }),
          ),
        );
      await open();

      expect(endButton()).toBeUndefined();
    });

    it("explains that a Confirmed booking can be ended once it starts", async () => {
      repo.read = () =>
        of(
          ok(
            details({
              isInProgress: false,
              actions: {
                canComplete: false,
                canMarkRefunded: false,
                canCancel: false,
                canReassign: false,
              },
            }),
          ),
        );
      await open();

      expect(endButton()).toBeUndefined();
      expect(plain(el().querySelector(".hint")?.textContent)).toBe(
        "You can end the session or mark it as missed once it starts.",
      );
    });

    it("says nothing about it for a booking that was never confirmed", async () => {
      repo.read = () =>
        of(
          ok(
            details({
              status: BookingStatus.PendingReview,
              isInProgress: false,
              actions: {
                canComplete: false,
                canMarkRefunded: false,
                canCancel: false,
                canReassign: false,
              },
            }),
          ),
        );
      await open();

      expect(el().querySelector(".hint")).toBeNull();
    });

    it("asks for confirmation first, naming the booking and the customer", async () => {
      await open();

      endButton()!.click();
      fixture.detectChanges();

      expect(dialog()).not.toBeNull();
      expect(plain(dialog()!.querySelector("h2")?.textContent)).toBe("End this session?");
      expect(plain(dialog()!.querySelector("p")?.textContent)).toBe(
        "OD-000482 for Ahmed Hassan will be marked as completed.",
      );
      expect(repo.completes).toEqual([]);
    });

    it("does nothing when the confirmation is cancelled", async () => {
      await open();
      endButton()!.click();
      fixture.detectChanges();

      dialogButtons()[0].click(); // Cancel
      fixture.detectChanges();

      expect(dialog()).toBeNull();
      expect(repo.completes).toEqual([]);
    });

    it("ends the session, closes the dialog and shows the booking as Completed", async () => {
      await open();
      repo.read = () =>
        of(
          ok(
            details({
              status: BookingStatus.Completed,
              isInProgress: false,
              actions: {
                canComplete: false,
                canMarkRefunded: false,
                canCancel: false,
                canReassign: false,
              },
            }),
          ),
        );
      endButton()!.click();
      fixture.detectChanges();

      dialogButtons()[1].click(); // End session
      await settle();

      expect(repo.completes).toEqual([482]);
      expect(repo.reads).toEqual([482, 482]); // opened + re-read after the action
      expect(success).toHaveBeenCalledWith("BOOKINGS.SESSION_ENDED");
      expect(dialog()).toBeNull();
      expect(plain(el().querySelector(".summary")?.textContent)).toContain("Completed");
      expect(endButton()).toBeUndefined();
    });

    it("sends the request once even if confirmed twice while it is running", async () => {
      await open();
      const hold = new Subject<ApiResponse<null>>();
      repo.complete = () => hold;
      endButton()!.click();
      fixture.detectChanges();

      (fixture.componentInstance as unknown as { confirmEnd(): void }).confirmEnd();
      (fixture.componentInstance as unknown as { confirmEnd(): void }).confirmEnd();

      expect(repo.completes).toEqual([482]);
      hold.next(ok(null));
      hold.complete();
    });

    it("re-reads the booking after a failure too (409): what the page showed was out of date", async () => {
      await open();
      repo.complete = () => throwError(() => ({ status: 409 }));
      repo.read = () =>
        of(
          ok(
            details({
              isInProgress: false,
              actions: {
                canComplete: false,
                canMarkRefunded: false,
                canCancel: false,
                canReassign: false,
              },
            }),
          ),
        );
      endButton()!.click();
      fixture.detectChanges();

      dialogButtons()[1].click();
      await settle();

      expect(success).not.toHaveBeenCalled();
      expect(dialog()).toBeNull();
      expect(repo.reads).toEqual([482, 482]);
      expect(endButton()).toBeUndefined(); // the fresh data no longer allows it
    });

    it("shows 'doesn't exist' when the booking is gone by the time of the re-read (404)", async () => {
      await open();
      repo.complete = () => throwError(() => ({ status: 404 }));
      repo.read = () => throwError(() => ({ status: 404 }));
      endButton()!.click();
      fixture.detectChanges();

      dialogButtons()[1].click();
      await settle();

      expect(text()).toContain("This booking doesn’t exist");
      expect(el().querySelector("h1")).toBeNull();
    });

    it("keeps what is on screen when only the re-read fails", async () => {
      await open();
      repo.complete = () => throwError(() => ({ status: 500 }));
      repo.read = () => throwError(() => ({ status: 500 }));
      endButton()!.click();
      fixture.detectChanges();

      dialogButtons()[1].click();
      await settle();

      expect(el().querySelector("h1")?.textContent).toContain("OD-000482");
      expect(el().querySelector("app-failed-state")).toBeNull();
    });

    it("can't be started without the permission, even by calling the handler", async () => {
      granted = ["Booking.View"];
      await open();

      (fixture.componentInstance as unknown as { askEnd(): void }).askEnd();
      fixture.detectChanges();

      expect(dialog()).toBeNull();
    });
  });

  describe("states", () => {
    it("shows a skeleton while loading", () => {
      repo.read = () => new Subject<ApiResponse<BookingDetails>>();
      fixture = TestBed.createComponent(BookingDetailsPage);
      fixture.detectChanges();

      expect(el().querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(el().querySelector("h1")).toBeNull();
    });

    it("says the booking doesn't exist (404) and links back — no retry", async () => {
      repo.read = () => throwError(() => ({ status: 404 }));
      await open();

      expect(text()).toContain("This booking doesn’t exist");
      expect(el().querySelector("app-failed-state")).toBeNull();
      expect(el().querySelector("a.back")).not.toBeNull();
    });

    it("also treats a status:false 404 body as missing", async () => {
      repo.read = () => of({ ...ok(null as never), status: false, statusCode: 404 });
      await open();

      expect(text()).toContain("This booking doesn’t exist");
    });

    it("shows the failed state with a retry for any other failure", async () => {
      repo.read = () => throwError(() => ({ status: 500 }));
      await open();
      expect(el().querySelector("app-failed-state")).not.toBeNull();

      repo.read = () => of(ok(details()));
      el().querySelector<HTMLButtonElement>("app-failed-state button")!.click();
      await settle();

      expect(el().querySelector("h1")?.textContent).toContain("OD-000482");
      expect(el().querySelector("app-failed-state")).toBeNull();
    });

    it.each(["abc", "0", "-3", "1.5", ""])(
      "sends an invalid id (%j) back to the list without a request",
      async (bad) => {
        routeId = bad;
        const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);

        await open();

        expect(repo.reads).toEqual([]);
        expect(navigate).toHaveBeenCalledWith(["/main/bookings"]);
      },
    );
  });

  describe("Arabic", () => {
    it("renders the page in Arabic: date, labels, branch, status and amounts", async () => {
      TestBed.inject(LanguageService).setLang("ar");
      await open();

      expect(plain(el().querySelector("app-page-header")?.textContent)).toContain("الجمعة");
      expect(text()).toContain("الموعد");
      expect(text()).toContain("الخدمات والدفع");
      expect(card("sec-appointment")).toContain("مدينة نصر");
      expect(plain(el().querySelector(".summary")?.textContent)).toContain("بدأ");
      const items = Array.from(el().querySelectorAll(".item")).map(parts);
      expect(items[0]).toContain("قص شعر");
      expect(card("sec-payment")).toContain("إنستا باي");
      expect(endButton()).toBeUndefined(); // its label is Arabic now
      expect(text()).toContain("إنهاء الجلسة");
    });
  });

  // ── The branch's other actions ─────────────────────────────────────────
  const cancellable = (over: Partial<BookingDetails> = {}) =>
    details({
      status: BookingStatus.PendingReview,
      isInProgress: false,
      actions: { canComplete: false, canMarkRefunded: false, canCancel: true, canReassign: true },
      ...over,
    });
  const headerButton = (label: string) =>
    Array.from(el().querySelectorAll<HTMLButtonElement>("app-page-header app-button button")).find(
      (b) => plain(b.textContent).includes(label),
    );
  const dialogOf = () => el().querySelector<HTMLElement>('[role="dialog"]');
  const dialogActions = () =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('[role="dialog"] .dialog__actions button'));
  const typeReason = (value: string) => {
    const box = el().querySelector<HTMLTextAreaElement>("textarea")!;
    box.value = value;
    box.dispatchEvent(new Event("input"));
    fixture.detectChanges();
  };

  describe("mark as missed", () => {
    it("is offered next to End session when the booking has started", async () => {
      await open();

      expect(headerButton("End session")).toBeDefined();
      expect(headerButton("Mark as missed")).toBeDefined();
    });

    it("is hidden without Booking.Manage and when the server doesn't allow it", async () => {
      granted = ["Booking.View"];
      await open();
      expect(headerButton("Mark as missed")).toBeUndefined();

      granted = ["Booking.View", "Booking.Manage"];
      repo.read = () => of(ok(cancellable()));
      await open();
      expect(headerButton("Mark as missed")).toBeUndefined();
    });

    it("asks first, then marks it missed and re-reads", async () => {
      await open();
      headerButton("Mark as missed")!.click();
      fixture.detectChanges();

      expect(plain(dialog()!.querySelector("h2")?.textContent)).toBe("Mark as missed?");
      expect(repo.noShows).toEqual([]);

      dialogButtons()[1].click();
      await settle();

      expect(repo.noShows).toEqual([482]);
      expect(repo.reads).toEqual([482, 482]);
      expect(success).toHaveBeenCalledWith("BOOKINGS.MARKED_NO_SHOW");
      expect(dialog()).toBeNull();
    });

    it("re-reads after a failure too (409)", async () => {
      await open();
      repo.noShow = () => throwError(() => ({ status: 409 }));
      headerButton("Mark as missed")!.click();
      fixture.detectChanges();

      dialogButtons()[1].click();
      await settle();

      expect(success).not.toHaveBeenCalled();
      expect(repo.reads).toEqual([482, 482]);
    });
  });

  describe("cancel booking", () => {
    it("is offered only while the server says canCancel and with Booking.Manage", async () => {
      await open();
      expect(headerButton("Cancel booking")).toBeUndefined();

      repo.read = () => of(ok(cancellable()));
      await open();
      expect(headerButton("Cancel booking")).toBeDefined();

      granted = ["Booking.View"];
      await open();
      expect(headerButton("Cancel booking")).toBeUndefined();
    });

    it("needs a reason, then cancels with it and re-reads", async () => {
      repo.read = () => of(ok(cancellable()));
      await open();
      headerButton("Cancel booking")!.click();
      fixture.detectChanges();

      expect(plain(dialogOf()!.querySelector("h2")?.textContent)).toBe("Cancel this booking?");

      dialogActions()[1].click(); // no reason yet
      fixture.detectChanges();
      expect(repo.cancels).toEqual([]);

      typeReason("  The barber is sick  ");
      dialogActions()[1].click();
      await settle();

      expect(repo.cancels).toEqual([{ id: 482, reason: "The barber is sick" }]);
      expect(repo.reads).toEqual([482, 482]);
      expect(success).toHaveBeenCalledWith("BOOKINGS.CANCELLED");
      expect(dialogOf()).toBeNull();
    });

    it("keeps the booking when the dialog is dismissed", async () => {
      repo.read = () => of(ok(cancellable()));
      await open();
      headerButton("Cancel booking")!.click();
      fixture.detectChanges();

      dialogActions()[0].click(); // Keep booking
      fixture.detectChanges();

      expect(dialogOf()).toBeNull();
      expect(repo.cancels).toEqual([]);
    });
  });

  describe("change barber", () => {
    it("lists the other active barbers of the booking's branch and moves the booking", async () => {
      repo.read = () => of(ok(cancellable()));
      await open();
      headerButton("Change barber")!.click();
      await settle();

      const names = Array.from(el().querySelectorAll(".option__label")).map((n) =>
        plain(n.textContent),
      );
      expect(names).toEqual(["Youssef Samir"]); // not Karim Adel (id 7): that's the booking's own barber

      dialogActions()[1].click(); // nothing chosen yet: Confirm is off
      expect(repo.reassigns).toEqual([]);

      el().querySelector<HTMLInputElement>('input[type="radio"]')!.click();
      fixture.detectChanges();
      dialogActions()[1].click();
      await settle();

      expect(repo.reassigns).toEqual([{ id: 482, barberId: 8 }]);
      expect(repo.reads).toEqual([482, 482]);
      expect(success).toHaveBeenCalledWith("BOOKINGS.BARBER_CHANGED");
    });

    it("is hidden when the booking can't be cancelled either (ended / not open)", async () => {
      await open();

      expect(headerButton("Change barber")).toBeUndefined();
    });
  });

  describe("cancellation card", () => {
    it("is not shown for a booking that wasn't cancelled", async () => {
      await open();

      expect(el().querySelector("#sec-cancellation")).toBeNull();
    });

    it("says the branch cancelled it, who, when and why", async () => {
      repo.read = () =>
        of(
          ok(
            details({
              status: BookingStatus.Cancelled,
              isInProgress: false,
              refund: { status: RefundStatus.Waiting, amount: 340, feeAmount: null },
              cancellation: {
                cancelledAt: "2026-11-20T15:30:00",
                cancelledByBranch: true,
                cancelledByName: "Mona Ibrahim",
                reason: null,
                note: "The barber is sick and no other barber is available",
              },
              actions: {
                canComplete: false,
                canMarkRefunded: true,
                canCancel: false,
                canReassign: false,
              },
            }),
          ),
        );
      await open();

      expect(facts("sec-cancellation")).toEqual([
        "Cancelled by The branch · Mona Ibrahim",
        "Cancelled on Nov 20, 2026, 5:30 PM", // UTC 15:30 → Cairo (UTC+2)
        "Reason The barber is sick and no other barber is available",
      ]);
    });

    it("says the customer cancelled it, with the reason they picked", async () => {
      repo.read = () =>
        of(
          ok(
            details({
              status: BookingStatus.Cancelled,
              isInProgress: false,
              cancellation: {
                cancelledAt: "2026-11-12T09:00:00",
                cancelledByBranch: false,
                cancelledByName: null,
                reason: CancelReason.WantAnotherTime,
                note: null,
              },
              actions: {
                canComplete: false,
                canMarkRefunded: false,
                canCancel: false,
                canReassign: false,
              },
            }),
          ),
        );
      await open();

      expect(facts("sec-cancellation")[0]).toBe("Cancelled by The customer");
      expect(facts("sec-cancellation")[2]).toBe("Reason Wants another time");
    });

    it("leaves the reason out when the customer gave none", async () => {
      repo.read = () =>
        of(
          ok(
            details({
              status: BookingStatus.Cancelled,
              isInProgress: false,
              cancellation: {
                cancelledAt: "2026-11-12T09:00:00",
                cancelledByBranch: false,
                cancelledByName: null,
                reason: null,
                note: null,
              },
              actions: {
                canComplete: false,
                canMarkRefunded: false,
                canCancel: false,
                canReassign: false,
              },
            }),
          ),
        );
      await open();

      expect(facts("sec-cancellation")).toHaveLength(2);
    });
  });
});
