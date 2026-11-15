import { Component } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Observable, Subject, of, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ar from "../../../../../assets/i18n/ar.json";
import en from "../../../../../assets/i18n/en.json";
import { LanguageService } from "@core/services/language.service";
import { ApiResponse, PaginationMeta } from "@shared/model/api_response.model";
import { BARBER_REPOSITORY } from "../../../barbers/repository/barber.repository";
import { BranchesService } from "../../../branches/service/branches.service";
import {
  BookingListItem,
  BookingStatus,
  BookingType,
  BookingsQuery,
  PaymentMethod,
  RefundStatus,
} from "../../model/booking.model";
import { BOOKING_REPOSITORY } from "../../repository/booking.repository";
import { BookingsList } from "./bookings-list";

/** Stands in for the details page, so following a booking link has somewhere to go. */
@Component({ standalone: true, template: "" })
class DetailsStub {}

const plain = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function booking(id: number, over: Partial<BookingListItem> = {}): BookingListItem {
  return {
    id,
    bookingNumber: `OD-${String(id).padStart(6, "0")}`,
    startAt: "2026-11-13T19:00:00",
    customer: { fullName: `Customer ${id}`, phoneNumber: "+201001234567" },
    items: [
      { nameAr: "قص شعر", nameEn: "Haircut" },
      { nameAr: "تحديد لحية", nameEn: "Beard trim" },
    ],
    barber: { fullName: "Karim Adel" },
    type: BookingType.Regular,
    status: BookingStatus.PendingReview,
    isInProgress: false,
    payment: { method: PaymentMethod.InstaPay, totalPrice: 340 },
    refund: null,
    ...over,
  };
}

function envelope(
  data: BookingListItem[],
  over: Partial<PaginationMeta> = {},
): ApiResponse<BookingListItem[]> {
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
      additionalData: { todayCount: 13, refundWaitingCount: 6 },
      ...over,
    },
    data,
  };
}

class FakeBookingRepo {
  queries: BookingsQuery[] = [];
  respond: (q: BookingsQuery) => Observable<ApiResponse<BookingListItem[]>> = () =>
    of(envelope([]));
  getBookings(q: BookingsQuery) {
    this.queries.push(structuredClone(q));
    return this.respond(q);
  }
  get last(): BookingsQuery {
    return this.queries[this.queries.length - 1];
  }
}

describe("BookingsList", () => {
  let repo: FakeBookingRepo;
  let fixture: ComponentFixture<BookingsList>;
  let branches: Array<{ id: number; nameAr: string; nameEn: string }>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => plain(el().textContent);
  const tableRows = () => Array.from(el().querySelectorAll<HTMLElement>("tbody tr.dt__row"));
  const select = (label: string) =>
    el().querySelector<HTMLSelectElement>(`app-filter-select select[aria-label="${label}"]`)!;
  const dateInput = (label: string) =>
    el().querySelector<HTMLInputElement>(`app-date-filter input[aria-label="${label}"]`)!;
  const tabs = () => Array.from(el().querySelectorAll<HTMLElement>('[role="tab"]'));
  const chip = () => el().querySelector<HTMLButtonElement>("button.chip")!;
  const searchInput = () => el().querySelector<HTMLInputElement>("app-search-input input")!;

  async function open(initial?: ApiResponse<BookingListItem[]>) {
    if (initial) repo.respond = () => of(initial);
    fixture = TestBed.createComponent(BookingsList);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const choose = async (label: string, value: string) => {
    const s = select(label);
    s.value = value;
    s.dispatchEvent(new Event("change"));
    await settle();
  };
  const setDate = async (label: string, value: string) => {
    const i = dateInput(label);
    i.value = value;
    i.dispatchEvent(new Event("change"));
    await settle();
  };

  beforeEach(() => {
    repo = new FakeBookingRepo();
    branches = [
      { id: 2, nameAr: "فرع ب", nameEn: "Branch B" },
      { id: 1, nameAr: "فرع أ", nameEn: "Branch A" },
    ];
    TestBed.configureTestingModule({
      imports: [BookingsList, TranslateModule.forRoot()],
      providers: [
        provideRouter([{ path: "main/bookings/:id", component: DetailsStub }]),
        { provide: BOOKING_REPOSITORY, useValue: repo },
        {
          provide: BARBER_REPOSITORY,
          useValue: {
            getBarbers: (q: { branchId: number }) =>
              of({
                status: true,
                data:
                  q.branchId === 1
                    ? [
                        { id: 11, fullName: "Ali" },
                        { id: 12, fullName: "Omar" },
                      ]
                    : [{ id: 21, fullName: "Sara" }],
              }),
          },
        },
        { provide: BranchesService, useValue: { loadOptions: () => of(branches) } },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation("en", en);
    translate.setTranslation("ar", ar);
    translate.use("en");
  });

  // The language switch persists to localStorage and sets <html lang/dir>: leave no trace.
  afterEach(() => {
    localStorage.removeItem("odl_lang");
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("dir");
  });

  describe("opening", () => {
    it("opens on the first (oldest) branch, All tab, page 1", async () => {
      await open();

      expect(repo.queries).toHaveLength(1);
      expect(repo.last).toMatchObject({ branchId: 1, tab: 0, pageNumber: 1, pageSize: 20 });
      expect(select("Branch").value).toBe("1");
      expect(Array.from(select("Branch").options).map((o) => plain(o.textContent))).toEqual([
        "Branch A",
        "Branch B",
      ]);
    });

    it("shows a skeleton, not an empty state, while the first page is on its way", () => {
      repo.respond = () => new Subject<ApiResponse<BookingListItem[]>>();
      fixture = TestBed.createComponent(BookingsList);
      fixture.detectChanges();

      expect(el().querySelectorAll("tr.dt__row--skeleton").length).toBeGreaterThan(0);
      expect(text()).not.toContain("No bookings yet");
    });
  });

  describe("coming back to the page", () => {
    it("starts clean: filters, search, tab and page are reset, the widgets empty (the branch is kept)", async () => {
      await open(envelope([booking(1)]));
      await choose("Branch", "2");
      tabs()[3].click(); // Past
      await settle();
      await choose("Booking type", "1");
      await choose("Status", "4");
      chip().click();
      await settle();
      await setDate("From", "2026-11-01");
      searchInput().value = "ahmed";
      searchInput().dispatchEvent(new Event("input"));
      searchInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      await settle();
      expect(repo.last).toMatchObject({ tab: 3, type: 1, search: "ahmed" });

      // Leave the page and come back.
      fixture.destroy();
      repo.queries = [];
      await open(envelope([booking(2)]));

      expect(repo.queries).toHaveLength(1);
      expect(repo.last).toEqual({ branchId: 2, pageNumber: 1, pageSize: 20, tab: 0 });
      expect(select("Branch").value).toBe("2");
      expect(select("Booking type").value).toBe("");
      expect(select("Status").value).toBe("");
      expect(select("Barber").value).toBe("");
      expect(dateInput("From").value).toBe("");
      expect(searchInput().value).toBe("");
      expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
      expect(chip().getAttribute("aria-pressed")).toBe("false");
      expect(text()).not.toContain("Clear filters");
    });

    it("doesn't show the old filtered rows under the cleared widgets while it reloads", async () => {
      await open(envelope([booking(1), booking(2)]));
      await choose("Booking type", "1");
      fixture.destroy();

      repo.respond = () => new Subject<ApiResponse<BookingListItem[]>>();
      fixture = TestBed.createComponent(BookingsList);
      fixture.detectChanges();

      // Skeleton rows share the row class: only real data rows count.
      expect(tableRows().filter((r) => !r.classList.contains("dt__row--skeleton"))).toHaveLength(0);
      expect(text()).not.toContain("Customer 1");
      expect(el().querySelectorAll("tr.dt__row--skeleton").length).toBeGreaterThan(0);
    });

    it("clears a date-range error from before", async () => {
      await open(envelope([booking(1)]));
      await setDate("From", "2026-11-10");
      await setDate("To", "2026-11-05");
      expect(el().querySelector('[role="alert"]')).not.toBeNull();

      fixture.destroy();
      await open(envelope([booking(1)]));

      expect(el().querySelector('[role="alert"]')).toBeNull();
    });
  });

  describe("rows", () => {
    it("shows the booking number, when, customer, services, barber, amount and method", async () => {
      await open(envelope([booking(482)]));
      const row = tableRows()[0];

      expect(plain(row.textContent)).toContain("OD-000482");
      expect(plain(row.textContent)).toContain("Nov 13, 2026");
      expect(plain(row.textContent)).toContain("7:00 PM");
      expect(plain(row.textContent)).toContain("Customer 482");
      expect(plain(row.textContent)).toContain("Haircut, Beard trim");
      expect(plain(row.textContent)).toContain("Karim Adel");
      expect(plain(row.textContent)).toContain("EGP 340");
      expect(plain(row.textContent)).toContain("InstaPay");
      expect(plain(row.textContent)).toContain("Waiting for branch");
    });

    it("makes the phone a left-to-right call link that doesn't trigger the row", async () => {
      await open(envelope([booking(1)]));
      const phone = tableRows()[0].querySelector<HTMLAnchorElement>("a.phone")!;

      expect(phone.getAttribute("href")).toBe("tel:+201001234567");
      expect(phone.getAttribute("dir")).toBe("ltr");
    });

    it("badges only VIP and Home bookings, not Regular ones", async () => {
      await open(
        envelope([
          booking(1),
          booking(2, { type: BookingType.Vip }),
          booking(3, { type: BookingType.Home }),
        ]),
      );
      const [regular, vip, home] = tableRows();

      expect(regular.querySelectorAll(".badge")).toHaveLength(1); // the status only
      expect(plain(vip.querySelector(".badge--vip")?.textContent)).toBe("VIP");
      expect(plain(home.querySelector(".badge--info")?.textContent)).toBe("Home");
    });

    it("says 'Started' for a booking in progress", async () => {
      await open(envelope([booking(1, { status: BookingStatus.Confirmed, isInProgress: true })]));

      expect(plain(tableRows()[0].textContent)).toContain("Started");
      expect(plain(tableRows()[0].textContent)).not.toContain("Confirmed");
    });

    it("shows the refund of a missed booking with its fee, and a refund already sent", async () => {
      await open(
        envelope([
          booking(1, {
            status: BookingStatus.NoShow,
            refund: { status: RefundStatus.Waiting, amount: 96, feeAmount: 24 },
          }),
          booking(2, {
            status: BookingStatus.Cancelled,
            refund: { status: RefundStatus.Sent, amount: 120, feeAmount: null },
          }),
        ]),
      );
      const [missed, cancelled] = tableRows();

      expect(plain(missed.textContent)).toContain("Refund waiting · EGP 96");
      expect(plain(missed.textContent)).toContain("EGP 24 fee");
      expect(missed.querySelector(".refund--waiting")).not.toBeNull();
      expect(plain(cancelled.textContent)).toContain("Refund sent · EGP 120");
      expect(cancelled.querySelector(".refund--waiting")).toBeNull();
      expect(plain(cancelled.textContent)).not.toContain("fee");
    });

    it("shows no refund line for a booking without one", async () => {
      await open(envelope([booking(1, { status: BookingStatus.Completed })]));

      expect(tableRows()[0].querySelector(".refund")).toBeNull();
    });

    it("shows the wallet method with its icon", async () => {
      await open(
        envelope([
          booking(1, { payment: { method: PaymentMethod.MobileWallet, totalPrice: 99.5 } }),
        ]),
      );

      expect(plain(tableRows()[0].textContent)).toContain("Mobile wallet");
      expect(plain(tableRows()[0].textContent)).toContain("EGP 99.50");
      expect(tableRows()[0].querySelector("i.pi-mobile")).not.toBeNull();
    });

    it("renders the same booking as a card for the narrow layout", async () => {
      await open(envelope([booking(482)]));
      const card = el().querySelector<HTMLElement>(".dt__card")!;

      expect(plain(card.textContent)).toContain("OD-000482");
      expect(plain(card.textContent)).toContain("Customer 482");
      expect(plain(card.textContent)).toContain("EGP 340");
    });
  });

  describe("opening a booking", () => {
    it("opens the details page when a row is clicked", async () => {
      await open(envelope([booking(482)]));
      const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);

      tableRows()[0].click();

      expect(navigate).toHaveBeenCalledWith(["/main/bookings", 482]);
    });

    it("opens a card on the narrow layout too", async () => {
      await open(envelope([booking(482)]));
      const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);

      el().querySelector<HTMLElement>(".dt__card")!.click();

      expect(navigate).toHaveBeenCalledWith(["/main/bookings", 482]);
    });

    it("makes the booking number a real link (keyboard and screen readers)", async () => {
      await open(envelope([booking(482)]));
      const link = tableRows()[0].querySelector<HTMLAnchorElement>("a.number")!;

      expect(link.getAttribute("href")).toBe("/main/bookings/482");
      expect(plain(link.textContent)).toBe("OD-000482");
    });

    it("navigates once, not twice, when the number link itself is clicked", async () => {
      await open(envelope([booking(482)]));
      const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);

      tableRows()[0].querySelector<HTMLAnchorElement>("a.number")!.click();

      expect(navigate).not.toHaveBeenCalled(); // the link does it; the row doesn't repeat it
    });
  });

  describe("tabs and counters", () => {
    it("has the four period tabs, All selected, and the branch's count on Today", async () => {
      await open(envelope([booking(1)]));

      expect(tabs().map((t) => plain(t.querySelector(".tabs__label")?.textContent))).toEqual([
        "All",
        "Today",
        "Upcoming",
        "Past",
      ]);
      expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
      expect(plain(tabs()[1].querySelector(".tabs__count")?.textContent)).toBe("13");
      expect(tabs()[0].querySelector(".tabs__count")).toBeNull();
      expect(tabs()[2].querySelector(".tabs__count")).toBeNull();
    });

    it("shows no counts before the first response (never a misleading 0)", () => {
      repo.respond = () => new Subject<ApiResponse<BookingListItem[]>>();
      fixture = TestBed.createComponent(BookingsList);
      fixture.detectChanges();

      expect(el().querySelector(".tabs__count")).toBeNull();
      expect(el().querySelector(".chip__count")).toBeNull();
    });

    it("loads another tab from page 1 and keeps the counters", async () => {
      await open(envelope([booking(1)]));

      tabs()[2].click(); // Upcoming
      await settle();

      expect(repo.last).toMatchObject({ tab: 2, pageNumber: 1, branchId: 1 });
      expect(tabs()[2].getAttribute("aria-selected")).toBe("true");
      expect(plain(tabs()[1].querySelector(".tabs__count")?.textContent)).toBe("13");
    });

    it("points the panel at the selected tab (for screen readers)", async () => {
      await open(envelope([booking(1)]));
      tabs()[3].click(); // Past
      await settle();

      const panel = el().querySelector("#bookings-panel")!;
      expect(panel.getAttribute("role")).toBe("tabpanel");
      expect(panel.getAttribute("aria-labelledby")).toBe("bookings-tab-3");
    });
  });

  describe("filters", () => {
    it("searches by what is typed (on Enter) and ignores a change that changes nothing", async () => {
      await open(envelope([booking(1)]));

      searchInput().value = "  OD-000482 ";
      searchInput().dispatchEvent(new Event("input"));
      searchInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      await settle();
      expect(repo.last).toMatchObject({ search: "OD-000482", pageNumber: 1 });

      const before = repo.queries.length;
      searchInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      await settle();
      expect(repo.queries).toHaveLength(before);
    });

    it("offers the branch's barbers (and 'All barbers') and filters by one", async () => {
      await open(envelope([booking(1)]));

      expect(Array.from(select("Barber").options).map((o) => plain(o.textContent))).toEqual([
        "All barbers",
        "Ali",
        "Omar",
      ]);

      await choose("Barber", "12");
      expect(repo.last.barberId).toBe(12);

      await choose("Barber", "");
      expect(repo.last.barberId).toBeUndefined();
    });

    it("filters by type, including Regular (0)", async () => {
      await open(envelope([booking(1)]));

      await choose("Booking type", "2");
      expect(repo.last.type).toBe(BookingType.Home);
      await choose("Booking type", "0");
      expect(repo.last.type).toBe(BookingType.Regular);
      await choose("Booking type", "");
      expect(repo.last.type).toBeUndefined();
    });

    it("filters by status, including Waiting for branch (0)", async () => {
      await open(envelope([booking(1)]));

      await choose("Status", "5");
      expect(repo.last.statuses).toEqual([BookingStatus.NoShow]);
      await choose("Status", "0");
      expect(repo.last.statuses).toEqual([BookingStatus.PendingReview]);
      await choose("Status", "");
      expect(repo.last.statuses).toBeUndefined();
    });

    it("shows the current filters in the controls", async () => {
      await open(envelope([booking(1)]));
      await choose("Booking type", "1");
      await choose("Status", "4");

      expect(select("Booking type").value).toBe("1");
      expect(select("Status").value).toBe("4");
    });

    it("the refund chip shows the owed count and toggles the Waiting filter (value 0)", async () => {
      await open(envelope([booking(1)]));

      expect(plain(chip().textContent)).toContain("Refund waiting");
      expect(plain(chip().querySelector(".chip__count")?.textContent)).toBe("6");
      expect(chip().getAttribute("aria-pressed")).toBe("false");

      chip().click();
      await settle();
      expect(repo.last.refundStatus).toBe(RefundStatus.Waiting);
      expect(chip().getAttribute("aria-pressed")).toBe("true");
      expect(chip().classList.contains("chip--active")).toBe(true);

      chip().click();
      await settle();
      expect(repo.last.refundStatus).toBeUndefined();
      expect(chip().getAttribute("aria-pressed")).toBe("false");
    });

    it("keeps the chip's count while the refund filter is on", async () => {
      await open(envelope([booking(1)]));
      chip().click();
      await settle();

      expect(plain(chip().querySelector(".chip__count")?.textContent)).toBe("6");
    });
  });

  describe("date range", () => {
    it("filters from a date and to a date", async () => {
      await open(envelope([booking(1)]));

      await setDate("From", "2026-11-01");
      expect(repo.last.dateFrom).toBe("2026-11-01");

      await setDate("To", "2026-11-12");
      expect(repo.last).toMatchObject({ dateFrom: "2026-11-01", dateTo: "2026-11-12" });
    });

    it("bounds each picker by the other date", async () => {
      await open(envelope([booking(1)]));
      await setDate("From", "2026-11-01");
      await setDate("To", "2026-11-12");

      expect(dateInput("To").getAttribute("min")).toBe("2026-11-01");
      expect(dateInput("From").getAttribute("max")).toBe("2026-11-12");
    });

    it("refuses an end date before the start date: a visible error and no request", async () => {
      await open(envelope([booking(1)]));
      await setDate("From", "2026-11-10");
      const before = repo.queries.length;

      await setDate("To", "2026-11-05");

      expect(repo.queries).toHaveLength(before);
      expect(el().querySelector('[role="alert"]')?.textContent).toContain(
        "The end date can’t be before the start date.",
      );
      expect(dateInput("To").getAttribute("aria-invalid")).toBe("true");
    });

    it("clears that error once a valid date is chosen", async () => {
      await open(envelope([booking(1)]));
      await setDate("From", "2026-11-10");
      await setDate("To", "2026-11-05");

      await setDate("To", "2026-11-12");

      expect(el().querySelector('[role="alert"]')).toBeNull();
      expect(repo.last.dateTo).toBe("2026-11-12");
    });

    it("drops the end date when a later start date makes it meaningless", async () => {
      await open(envelope([booking(1)]));
      await setDate("From", "2026-11-01");
      await setDate("To", "2026-11-05");

      await setDate("From", "2026-11-20");

      expect(repo.last.dateFrom).toBe("2026-11-20");
      expect(repo.last.dateTo).toBeUndefined();
    });

    it("clears a date with the field's own clear control", async () => {
      await open(envelope([booking(1)]));
      await setDate("From", "2026-11-01");

      await setDate("From", "");

      expect(repo.last.dateFrom).toBeUndefined();
    });
  });

  describe("clearing and branches", () => {
    it("offers 'Clear filters' only while something is filtered, and resets everything", async () => {
      await open(envelope([booking(1)]));
      const clear = () =>
        Array.from(el().querySelectorAll("app-button button")).find((b) =>
          plain(b.textContent).includes("Clear filters"),
        ) as HTMLButtonElement | undefined;
      expect(clear()).toBeUndefined();

      tabs()[3].click();
      await choose("Booking type", "1");
      expect(clear()).toBeDefined();

      clear()!.click();
      await settle();

      expect(repo.last).toEqual({ branchId: 1, pageNumber: 1, pageSize: 20, tab: 0 });
      expect(select("Booking type").value).toBe("");
      expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
      expect(clear()).toBeUndefined();
    });

    it("switching branch shows its barbers and drops the barber filter, keeping the others", async () => {
      await open(envelope([booking(1)]));
      await choose("Barber", "12");
      await choose("Booking type", "1");

      await choose("Branch", "2");

      expect(repo.last).toMatchObject({ branchId: 2, type: BookingType.Vip });
      expect(repo.last.barberId).toBeUndefined();
      expect(Array.from(select("Barber").options).map((o) => plain(o.textContent))).toEqual([
        "All barbers",
        "Sara",
      ]);
    });
  });

  describe("paging", () => {
    it("shows the range and goes to another page", async () => {
      await open(
        envelope([booking(1), booking(2)], {
          totalCount: 42,
          totalPages: 3,
          hasNextPage: true,
        }),
      );

      expect(plain(el().querySelector(".dt__range")?.textContent)).toContain("1–20");
      expect(plain(el().querySelector(".dt__range")?.textContent)).toContain("42");
      const page2 = Array.from(el().querySelectorAll<HTMLButtonElement>(".dt__pager button")).find(
        (b) => plain(b.textContent) === "2",
      )!;
      page2.click();
      await settle();

      expect(repo.last.pageNumber).toBe(2);
    });
  });

  describe("states", () => {
    it("says there are no branches, and loads nothing", async () => {
      branches = [];
      await open();

      expect(text()).toContain("No branches yet");
      expect(el().querySelector("app-tabs")).toBeNull();
      expect(repo.queries).toEqual([]);
    });

    it("says there are no bookings yet when nothing is filtered", async () => {
      await open(envelope([]));

      expect(text()).toContain("No bookings yet");
      expect(text()).not.toContain("Clear filters");
    });

    it("says nothing matches when a filter is on, and offers to clear it", async () => {
      await open(envelope([]));
      await choose("Booking type", "1");

      expect(text()).toContain("No bookings match");
      expect(text()).toContain("Clear filters");
    });

    it("shows the failed state with a retry when the first load fails", async () => {
      repo.respond = () => throwError(() => ({ status: 500 }));
      await open();
      expect(el().querySelector("app-failed-state")).not.toBeNull();
      expect(tableRows()).toHaveLength(0);

      repo.respond = () => of(envelope([booking(1)]));
      el().querySelector<HTMLButtonElement>("app-failed-state button")!.click();
      await settle();

      expect(tableRows()).toHaveLength(1);
      expect(el().querySelector("app-failed-state")).toBeNull();
    });

    it("keeps the rows on screen when a later reload fails", async () => {
      await open(envelope([booking(1), booking(2)]));

      repo.respond = () => throwError(() => ({ status: 500 }));
      tabs()[1].click();
      await settle();

      expect(tableRows()).toHaveLength(2);
      expect(el().querySelector("app-failed-state")).not.toBeNull();
    });
  });

  describe("accessibility", () => {
    it("announces what the list shows after a load (politely)", async () => {
      await open(envelope([booking(1), booking(2)], { totalCount: 42 }));
      const live = el().querySelector('[role="status"].sr-only')!;

      expect(live.getAttribute("aria-live")).toBe("polite");
      expect(plain(live.textContent)).toBe("Showing 2 of 42 bookings");
    });

    it("announces an empty result, and nothing while loading", async () => {
      await open(envelope([]));
      expect(plain(el().querySelector('[role="status"].sr-only')?.textContent)).toBe(
        "No bookings found",
      );

      repo.respond = () => new Subject<ApiResponse<BookingListItem[]>>();
      tabs()[1].click();
      fixture.detectChanges();
      expect(plain(el().querySelector('[role="status"].sr-only')?.textContent)).toBe("");
    });

    it("gives the table a caption and the tab list a name", async () => {
      await open(envelope([booking(1)]));

      expect(plain(el().querySelector("table caption")?.textContent)).toBe("Bookings");
      expect(el().querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe(
        "Bookings by period",
      );
    });
  });

  describe("Arabic", () => {
    it("renders the page, tabs, statuses and amounts in Arabic", async () => {
      TestBed.inject(LanguageService).setLang("ar");
      await open(
        envelope([
          booking(1, {
            status: BookingStatus.NoShow,
            refund: { status: RefundStatus.Waiting, amount: 96, feeAmount: 24 },
          }),
        ]),
      );

      expect(el().querySelector("h1")?.textContent).toContain("الحجوزات");
      expect(tabs().map((t) => plain(t.querySelector(".tabs__label")?.textContent))).toEqual([
        "الكل",
        "اليوم",
        "القادمة",
        "السابقة",
      ]);
      const row = plain(tableRows()[0].textContent);
      expect(row).toContain("لم يحضر");
      expect(row).toContain("قص شعر، تحديد لحية");
      expect(row).toContain("إنستا باي");
      expect(row).toContain("استرداد معلّق");
      expect(row).toContain("نوفمبر");
    });
  });
});
