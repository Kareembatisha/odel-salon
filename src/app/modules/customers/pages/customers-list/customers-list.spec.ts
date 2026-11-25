import { Component } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Observable, of, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ar from "../../../../../assets/i18n/ar.json";
import en from "../../../../../assets/i18n/en.json";
import { LanguageService } from "@core/services/language.service";
import { ApiResponse, PaginationMeta } from "@shared/model/api_response.model";
import { BranchesService } from "../../../branches/service/branches.service";
import { cairoToday } from "../../../offers/utils/offer-dates.util";
import { CustomerListItem, CustomersQuery } from "../../model/customer.model";
import { CUSTOMER_REPOSITORY } from "../../repository/customer.repository";
import { CustomersList } from "./customers-list";

@Component({ standalone: true, template: "" })
class ProfileStub {}

const plain = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function customer(id: number, over: Partial<CustomerListItem> = {}): CustomerListItem {
  return {
    id,
    fullName: `Customer ${id}`,
    countryCode: "+20",
    phoneNumber: "+201001234567",
    visitsCount: 12,
    lastVisitDate: "2026-11-01",
    missedCount: 0,
    ...over,
  };
}

function envelope(
  data: CustomerListItem[],
  over: Partial<PaginationMeta> = {},
): ApiResponse<CustomerListItem[]> {
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
        allCount: 1240,
        visitedThisMonthCount: 312,
        hasMissedBookingsCount: 47,
        notBackIn60DaysCount: 158,
      },
      ...over,
    },
    data,
  };
}

class FakeRepo {
  queries: CustomersQuery[] = [];
  respond: (q: CustomersQuery) => Observable<ApiResponse<CustomerListItem[]>> = () =>
    of(envelope([]));
  getCustomers(q: CustomersQuery) {
    this.queries.push(structuredClone(q));
    return this.respond(q);
  }
  get last(): CustomersQuery {
    return this.queries[this.queries.length - 1];
  }
}

describe("CustomersList", () => {
  let repo: FakeRepo;
  let fixture: ComponentFixture<CustomersList>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => plain(el().textContent);
  const tableRows = () => Array.from(el().querySelectorAll<HTMLElement>("tbody tr.dt__row"));
  // The customer cell has an avatar (initials + a screen-reader name): read the visible name only.
  const cells = (row: HTMLElement) =>
    Array.from(row.querySelectorAll("td")).map((c) =>
      plain(c.querySelector(".cell-text.strong")?.textContent ?? c.textContent),
    );
  const tabs = () => Array.from(el().querySelectorAll<HTMLElement>('[role="tab"]'));
  const select = (label: string) =>
    el().querySelector<HTMLSelectElement>(`app-filter-select select[aria-label="${label}"]`)!;
  const searchInput = () => el().querySelector<HTMLInputElement>("app-search-input input")!;

  async function open(initial?: ApiResponse<CustomerListItem[]>) {
    if (initial) repo.respond = () => of(initial);
    fixture = TestBed.createComponent(CustomersList);
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
    TestBed.configureTestingModule({
      imports: [CustomersList, TranslateModule.forRoot()],
      providers: [
        provideRouter([{ path: "main/customers/:id", component: ProfileStub }]),
        { provide: CUSTOMER_REPOSITORY, useValue: repo },
        {
          provide: BranchesService,
          useValue: {
            loadOptions: () =>
              of([
                { id: 2, nameAr: "فرع ب", nameEn: "Branch B" },
                { id: 1, nameAr: "فرع أ", nameEn: "Branch A" },
              ]),
          },
        },
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
    it("opens on the All tab for ALL branches, page 1", async () => {
      await open();

      expect(repo.queries).toHaveLength(1);
      expect(repo.last).toMatchObject({ tab: 0, pageNumber: 1, pageSize: 20 });
      expect(repo.last.branchId).toBeUndefined();
      expect(select("Branch").value).toBe("");
    });

    it("offers 'All branches' and the branches, oldest first", async () => {
      await open();

      expect(Array.from(select("Branch").options).map((o) => plain(o.textContent))).toEqual([
        "All branches",
        "Branch A",
        "Branch B",
      ]);
    });

    it("shows a skeleton-free empty state when there are no customers", async () => {
      await open(envelope([]));

      expect(text()).toContain("No customers yet");
    });
  });

  describe("tabs", () => {
    it("shows the four tabs with their counts once a response is in", async () => {
      await open(envelope([customer(1)]));

      expect(tabs().map((t) => plain(t.querySelector(".tabs__label")?.textContent))).toEqual([
        "All",
        "Visited this month",
        "Has missed bookings",
        "Not back in 60 days",
      ]);
      expect(tabs().map((t) => plain(t.querySelector(".tabs__count")?.textContent))).toEqual([
        "1240",
        "312",
        "47",
        "158",
      ]);
      expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
    });

    it("a tab reloads that group from page 1", async () => {
      await open(envelope([customer(1)]));

      tabs()[2].click();
      await settle();

      expect(repo.last).toMatchObject({ tab: 2, pageNumber: 1 });
      expect(tabs()[2].getAttribute("aria-selected")).toBe("true");
    });
  });

  describe("filters", () => {
    it("choosing a branch sends it; 'All branches' drops it again", async () => {
      await open(envelope([customer(1)]));

      select("Branch").value = "1";
      select("Branch").dispatchEvent(new Event("change"));
      await settle();
      expect(repo.last).toMatchObject({ branchId: 1, pageNumber: 1 });

      select("Branch").value = "";
      select("Branch").dispatchEvent(new Event("change"));
      await settle();
      expect(repo.last.branchId).toBeUndefined();
    });

    it("searches by what is typed (on Enter) and ignores a change that changes nothing", async () => {
      await open(envelope([customer(1)]));

      searchInput().value = "  ahmed ";
      searchInput().dispatchEvent(new Event("input"));
      searchInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      await settle();
      expect(repo.last).toMatchObject({ search: "ahmed", pageNumber: 1 });

      const before = repo.queries.length;
      searchInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      await settle();
      expect(repo.queries).toHaveLength(before);
    });

    it("says 'No customers match' for a filter with no result, and 'Clear filters' resets it", async () => {
      await open(envelope([customer(1)]));
      repo.respond = () => of(envelope([]));
      tabs()[2].click();
      await settle();

      expect(text()).toContain("No customers match");

      el().querySelector<HTMLButtonElement>("app-data-table app-button button")!.click();
      await settle();

      expect(repo.last).toMatchObject({ tab: 0, pageNumber: 1 });
      expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
    });

    it("pages the list", async () => {
      await open(envelope([customer(1)], { totalCount: 45, totalPages: 3, hasNextPage: true }));

      Array.from(el().querySelectorAll<HTMLButtonElement>(".dt__pager button"))
        .find((b) => plain(b.textContent) === "2")!
        .click();
      await settle();

      expect(repo.last).toMatchObject({ pageNumber: 2 });
    });
  });

  describe("rows", () => {
    it("shows the name, a left-to-right phone link, visits, last visit and missed", async () => {
      await open(envelope([customer(1203, { fullName: "Ahmed Hassan", missedCount: 2 })]));
      const row = tableRows()[0];

      expect(cells(row)).toEqual(["Ahmed Hassan", "+201001234567", "12", "Nov 1, 2026", "2"]);
      const phone = row.querySelector<HTMLAnchorElement>("a.phone")!;
      expect(phone.getAttribute("href")).toBe("tel:+201001234567");
      expect(phone.getAttribute("dir")).toBe("ltr");
    });

    it("says Today, Yesterday or Never instead of a date", async () => {
      const today = cairoToday();
      const yesterday = new Date(`${today}T12:00:00Z`);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      await open(
        envelope([
          customer(1, { lastVisitDate: today }),
          customer(2, { lastVisitDate: yesterday.toISOString().slice(0, 10) }),
          customer(3, { lastVisitDate: null, visitsCount: 0 }),
        ]),
      );

      expect(tableRows().map((r) => cells(r)[3])).toEqual(["Today", "Yesterday", "Never"]);
    });

    it("highlights a missed count only when there is one", async () => {
      await open(envelope([customer(1, { missedCount: 1 }), customer(2)]));

      const missed = tableRows().map((r) => r.querySelector(".missed") !== null);
      expect(missed).toEqual([true, false]);
    });

    it("opens the customer's profile when a row is clicked", async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
      await open(envelope([customer(1203)]));

      tableRows()[0].click();

      expect(navigate).toHaveBeenCalledWith(["/main/customers", 1203]);
    });

    it("clicking the phone doesn't open the profile", async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
      await open(envelope([customer(1203)]));

      tableRows()[0].querySelector<HTMLAnchorElement>("a.phone")!.click();

      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe("errors and language", () => {
    it("shows the failed state with a retry when the first load fails", async () => {
      repo.respond = () => throwError(() => ({ status: 500 }));
      await open();

      expect(text()).toContain("Try again");

      repo.respond = () => of(envelope([customer(1)]));
      el().querySelector<HTMLButtonElement>("app-failed-state button")!.click();
      await settle();

      expect(tableRows()).toHaveLength(1);
    });

    it("switches to Arabic: tabs, labels and the last-visit words follow", async () => {
      await open(envelope([customer(1, { lastVisitDate: null })]));

      TestBed.inject(LanguageService).setLang("ar");
      await settle();

      expect(tabs().map((t) => plain(t.querySelector(".tabs__label")?.textContent))[0]).toBe(
        "الكل",
      );
      expect(cells(tableRows()[0])[3]).toBe("لم يزر بعد");
    });
  });
});
