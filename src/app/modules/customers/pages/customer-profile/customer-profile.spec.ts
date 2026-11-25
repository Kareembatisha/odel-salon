import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Observable, of, throwError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ar from "../../../../../assets/i18n/ar.json";
import en from "../../../../../assets/i18n/en.json";
import { LanguageService } from "@core/services/language.service";
import { ApiResponse } from "@shared/model/api_response.model";
import { BreadcrumbService } from "../../../../layout/main-layout/components/header/breadcrumb.service";
import { BookingStatus, BookingType, RefundStatus } from "../../../bookings/model/booking.model";
import { CustomerBooking, CustomerDetails } from "../../model/customer.model";
import { CUSTOMER_REPOSITORY } from "../../repository/customer.repository";
import { CustomerProfilePage } from "./customer-profile";

const plain = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function booking(id: number, over: Partial<CustomerBooking> = {}): CustomerBooking {
  return {
    id,
    bookingNumber: `OD-${String(id).padStart(6, "0")}`,
    startAt: "2026-10-09T18:00:00",
    items: [
      { nameAr: "قص شعر", nameEn: "Haircut" },
      { nameAr: "تهذيب اللحية", nameEn: "Beard trim" },
    ],
    barber: { fullName: "Karim Adel" },
    type: BookingType.Regular,
    branch: { nameAr: "مدينة نصر", nameEn: "Nasr City" },
    status: BookingStatus.Completed,
    isInProgress: false,
    totalPrice: 340,
    refund: null,
    cancelledByBranch: null,
    rating: null,
    ...over,
  };
}

function customer(over: Partial<CustomerDetails> = {}): CustomerDetails {
  return {
    id: 1203,
    fullName: "Ahmed Hassan",
    countryCode: "+20",
    phoneNumber: "+201001234567",
    email: "ahmed.hassan@gmail.com",
    imageUrl: null,
    createdAt: "2026-03-04T10:15:22",
    visitsCount: 12,
    missedCount: 1,
    lastMissedDate: "2026-09-03",
    bookingsCount: 14,
    latestBookings: [booking(455, { rating: 5 })],
    ...over,
  };
}

const ok = (data: CustomerDetails): ApiResponse<CustomerDetails> => ({
  status: true,
  statusCode: 200,
  message: "ok",
  errors: null,
  meta: null,
  data,
});

describe("CustomerProfilePage", () => {
  let fixture: ComponentFixture<CustomerProfilePage>;
  let read: () => Observable<ApiResponse<CustomerDetails>>;
  let reads: number[];
  let routeId: string;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => plain(el().textContent);
  const bookingRows = () => Array.from(el().querySelectorAll<HTMLElement>("li.booking"));
  const link = (label: string) =>
    Array.from(el().querySelectorAll<HTMLAnchorElement>("a")).find((a) =>
      plain(a.textContent).includes(label),
    );

  async function open() {
    fixture = TestBed.createComponent(CustomerProfilePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    reads = [];
    routeId = "1203";
    read = () => of(ok(customer()));
    TestBed.configureTestingModule({
      imports: [CustomerProfilePage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        {
          provide: CUSTOMER_REPOSITORY,
          useValue: {
            getCustomerById: (id: number) => {
              reads.push(id);
              return read();
            },
          },
        },
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

  it("reads the customer of the route", async () => {
    await open();

    expect(reads).toEqual([1203]);
  });

  it("shows who the customer is: name, since (Cairo date), visits and missed", async () => {
    await open();

    expect(plain(el().querySelector("h1")?.textContent)).toBe("Ahmed Hassan");
    expect(text()).toContain("Customer since Mar 4, 2026");
    const stats = Array.from(el().querySelectorAll(".stat")).map((s) => plain(s.textContent));
    expect(stats[0]).toContain("12");
    expect(stats[1]).toContain("1");
    expect(stats[1]).toContain("Last missed: Sep 3, 2026");
  });

  it("leaves the last-missed hint out when the customer never missed", async () => {
    read = () => of(ok(customer({ missedCount: 0, lastMissedDate: null })));
    await open();

    expect(text()).not.toContain("Last missed");
  });

  it("has call and email links, the phone left-to-right", async () => {
    await open();

    const phone = el().querySelector<HTMLAnchorElement>('a[href="tel:+201001234567"]')!;
    expect(phone.getAttribute("dir")).toBe("ltr");
    expect(link("ahmed.hassan@gmail.com")!.getAttribute("href")).toBe(
      "mailto:ahmed.hassan@gmail.com",
    );
    expect(link("Call")).toBeDefined();
  });

  it("puts the customer's name in the breadcrumb", async () => {
    const set = vi.spyOn(TestBed.inject(BreadcrumbService), "setBreadcrumbs");

    await open();

    expect(set).toHaveBeenCalledWith([
      { label: "LAYOUT.NAV.CUSTOMERS", route: "/main/customers" },
      { label: "Ahmed Hassan" },
    ]);
  });

  describe("latest bookings", () => {
    it("links the booking number to its details and shows the services, amount and where", async () => {
      await open();
      const row = bookingRows()[0];

      expect(row.querySelector("a.number")!.getAttribute("href")).toBe("/main/bookings/455");
      expect(plain(row.textContent)).toContain("Haircut, Beard trim");
      expect(plain(row.textContent)).toContain("340");
      expect(plain(row.textContent)).toContain("Karim Adel · Nasr City");
      expect(plain(row.querySelector("app-status-badge")?.textContent)).toBe("Completed");
    });

    it("shows a rating only for a rated booking", async () => {
      read = () => of(ok(customer({ latestBookings: [booking(1, { rating: 4 }), booking(2)] })));
      await open();

      expect(bookingRows().map((r) => r.querySelector(".rating") !== null)).toEqual([true, false]);
    });

    it("badges VIP and Home bookings but not Regular ones", async () => {
      read = () =>
        of(
          ok(
            customer({
              latestBookings: [
                booking(1, { type: BookingType.Vip }),
                booking(2, { type: BookingType.Home }),
                booking(3),
              ],
            }),
          ),
        );
      await open();

      expect(bookingRows().map((r) => r.querySelectorAll("app-status-badge").length)).toEqual([
        2, 2, 1,
      ]);
    });

    it("says 'Started' for a booking in progress", async () => {
      read = () =>
        of(
          ok(
            customer({
              latestBookings: [booking(1, { status: BookingStatus.Confirmed, isInProgress: true })],
            }),
          ),
        );
      await open();

      expect(plain(bookingRows()[0].querySelector("app-status-badge")?.textContent)).toBe(
        "Started",
      );
    });

    it("says who cancelled a Cancelled booking and what is owed", async () => {
      read = () =>
        of(
          ok(
            customer({
              latestBookings: [
                booking(1, {
                  status: BookingStatus.Cancelled,
                  cancelledByBranch: true,
                  refund: { status: RefundStatus.Waiting, amount: 340, feeAmount: null },
                }),
                booking(2, {
                  status: BookingStatus.Cancelled,
                  cancelledByBranch: false,
                  refund: { status: RefundStatus.Sent, amount: 120, feeAmount: null },
                }),
              ],
            }),
          ),
        );
      await open();

      const [byBranch, byCustomer] = bookingRows().map((r) => plain(r.textContent));
      expect(byBranch).toContain("Cancelled by the branch");
      expect(byBranch).toContain("Refund waiting");
      expect(byCustomer).toContain("Cancelled by the customer");
      expect(byCustomer).toContain("Refund sent");
      expect(bookingRows()[0].querySelector(".refund--waiting")).not.toBeNull();
      expect(bookingRows()[1].querySelector(".refund--waiting")).toBeNull();
    });

    it("shows the fee of a missed booking", async () => {
      read = () =>
        of(
          ok(
            customer({
              latestBookings: [
                booking(1, {
                  status: BookingStatus.NoShow,
                  totalPrice: 350,
                  refund: { status: RefundStatus.Sent, amount: 280, feeAmount: 70 },
                }),
              ],
            }),
          ),
        );
      await open();

      expect(plain(bookingRows()[0].textContent)).toContain("70");
      expect(plain(bookingRows()[0].textContent)).toContain("280");
    });

    it("'All bookings (14)' opens the Bookings list filtered to this customer", async () => {
      await open();
      const all = link("All bookings (14)")!;

      expect(all.getAttribute("href")).toBe("/main/bookings?customerId=1203");
    });

    it("has no 'All bookings' link and says so for a customer without bookings", async () => {
      read = () => of(ok(customer({ bookingsCount: 0, latestBookings: [] })));
      await open();

      expect(link("All bookings")).toBeUndefined();
      expect(text()).toContain("This customer hasn’t booked yet.");
    });
  });

  describe("failures", () => {
    it("says the customer doesn't exist for a 404 (a body or an HTTP error), without a retry", async () => {
      read = () => throwError(() => ({ status: 404 }));
      await open();

      expect(text()).toContain("This customer doesn’t exist");
      expect(el().querySelector("app-failed-state")).toBeNull();
    });

    it("offers a retry when it couldn't load, and shows the customer after it", async () => {
      read = () => throwError(() => ({ status: 500 }));
      await open();
      expect(el().querySelector("app-failed-state")).not.toBeNull();

      read = () => of(ok(customer()));
      el().querySelector<HTMLButtonElement>("app-failed-state button")!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(plain(el().querySelector("h1")?.textContent)).toBe("Ahmed Hassan");
      expect(reads).toEqual([1203, 1203]);
    });

    it("goes back to the list for an id that isn't a positive whole number", async () => {
      routeId = "abc";
      const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);

      await open();

      expect(navigate).toHaveBeenCalledWith(["/main/customers"]);
      expect(reads).toEqual([]);
    });
  });

  it("switches to Arabic: labels, the since date and the stats follow", async () => {
    await open();

    TestBed.inject(LanguageService).setLang("ar");
    fixture.detectChanges();

    expect(text()).toContain("عميل منذ");
    expect(text()).toContain("كل الحجوزات");
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("dir");
    localStorage.removeItem("odl_lang");
  });
});
