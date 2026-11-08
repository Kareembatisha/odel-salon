import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Observable, Subject, of, throwError } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiResponse } from "@shared/model/api_response.model";
import { BreadcrumbService } from "../../../../layout/main-layout/components/header/breadcrumb.service";
import { BranchDayOfWeek, BranchDetails, BranchPayload } from "../../model/branch.model";
import { BRANCH_REPOSITORY } from "../../repository/branch.repository";
import { BranchesForm } from "./branches-form";

function ok<T>(data: T): ApiResponse<T> {
  return { status: true, statusCode: 200, message: "ok", errors: null, meta: null, data };
}

const DETAILS: BranchDetails = {
  id: 5,
  nameAr: "الزمالك",
  nameEn: "Zamalek",
  address: "8 Hassan Sabry St",
  mapUrl: "https://maps.example/z",
  phone: "+201020304050",
  allowsRegular: true,
  allowsVip: false,
  allowsHome: true,
  isVisible: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: null,
  workingHours: [
    {
      dayOfWeek: BranchDayOfWeek.Saturday,
      isOpen: true,
      openTime: "10:00:00",
      closeTime: "22:00:00",
    },
    { dayOfWeek: BranchDayOfWeek.Friday, isOpen: false, openTime: null, closeTime: null },
  ],
};

class FakeRepository {
  byId = vi.fn((_id: number): Observable<ApiResponse<BranchDetails>> => of(ok(DETAILS)));
  create = vi.fn((_p: BranchPayload): Observable<ApiResponse<number>> => of(ok(42)));
  update = vi.fn((_id: number, _p: BranchPayload): Observable<ApiResponse<null>> => of(ok(null)));
  getBranchById(id: number) {
    return this.byId(id);
  }
  createBranch(p: BranchPayload) {
    return this.create(p);
  }
  updateBranch(id: number, p: BranchPayload) {
    return this.update(id, p);
  }
}

describe("BranchesForm", () => {
  let repo: FakeRepository;
  let fixture: ComponentFixture<BranchesForm>;
  let navigate: ReturnType<typeof vi.spyOn>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? "";
  const inputs = () =>
    Array.from(el().querySelectorAll<HTMLInputElement>("app-float-label-input input"));
  const textFields = () => inputs().slice(0, 5); // nameAr, nameEn, address, phone, mapUrl
  const bookingBoxes = () => Array.from(el().querySelectorAll<HTMLInputElement>("input.odl-check"));
  const switches = () => Array.from(el().querySelectorAll<HTMLButtonElement>("app-switch button"));
  const timeInputs = () =>
    Array.from(el().querySelectorAll<HTMLInputElement>('input[type="time"]'));
  const submitButton = () =>
    el().querySelector(
      '.form-actions app-button[type="submit"] button, .form-actions button[type="submit"]',
    ) as HTMLButtonElement;

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event("input"));
  }

  function check(box: HTMLInputElement, checked = true) {
    box.checked = checked;
    box.dispatchEvent(new Event("change"));
  }

  async function setup(id: string | null = null) {
    repo = new FakeRepository();
    TestBed.configureTestingModule({
      imports: [BranchesForm, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BRANCH_REPOSITORY, useValue: repo },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } },
        },
      ],
    });
    TestBed.inject(TranslateService).use("en");
    navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
    fixture = TestBed.createComponent(BranchesForm);
    await settle();
  }

  async function fillValid() {
    const [nameAr, nameEn, address, phone] = textFields();
    type(nameAr, "فرع جديد");
    type(nameEn, "  New Branch ");
    type(address, "1 Main St");
    type(phone, "+201001234567");
    check(bookingBoxes()[0]);
    await settle();
  }

  afterEach(() => localStorage.clear());

  describe("create mode", () => {
    it("shows the create title and an empty form with every day closed", async () => {
      await setup();

      expect(el().querySelector("app-page-header")?.textContent).toContain(
        "BRANCHES.FORM.CREATE_TITLE",
      );
      expect(el().querySelector('[aria-busy="true"]')).toBeNull();
      expect(textFields().every((i) => i.value === "")).toBe(true);
      expect(switches().length).toBe(7);
      expect(switches().every((s) => s.getAttribute("aria-checked") === "false")).toBe(true);
      expect(timeInputs().length).toBe(0);
      expect(repo.byId).not.toHaveBeenCalled();
    });

    it("is built from the design-system components, not raw inputs", async () => {
      await setup();

      expect(el().querySelectorAll("app-float-label-input").length).toBe(5);
      expect(el().querySelector("app-page-header")).not.toBeNull();
      expect(el().querySelectorAll(".form-actions app-button").length).toBe(2);
      expect(el().querySelector(".odl-page")).not.toBeNull();
    });

    it("keeps phone, map link and times left-to-right", async () => {
      await setup();
      switches()[0].click();
      await settle();

      expect(textFields()[3].getAttribute("dir")).toBe("ltr");
      expect(textFields()[4].getAttribute("dir")).toBe("ltr");
      expect(timeInputs().every((t) => t.getAttribute("dir") === "ltr")).toBe(true);
    });

    it("lists the days Saturday → Friday", async () => {
      await setup();
      const names = Array.from(el().querySelectorAll(".day__name")).map((n) =>
        n.textContent?.trim(),
      );

      expect(names).toEqual([
        "BRANCHES.DAYS.Saturday",
        "BRANCHES.DAYS.Sunday",
        "BRANCHES.DAYS.Monday",
        "BRANCHES.DAYS.Tuesday",
        "BRANCHES.DAYS.Wednesday",
        "BRANCHES.DAYS.Thursday",
        "BRANCHES.DAYS.Friday",
      ]);
    });

    describe("validation", () => {
      it("does not disable the submit button while the form is invalid", async () => {
        await setup();
        expect(submitButton().disabled).toBe(false);
      });

      it("shows what is wrong on submit — and sends nothing", async () => {
        await setup();
        el().querySelector("form")!.dispatchEvent(new Event("submit"));
        await settle();

        expect(text()).toContain("BRANCHES.VALIDATION.NAME_AR_REQUIRED");
        expect(text()).toContain("BRANCHES.VALIDATION.NAME_EN_REQUIRED");
        expect(text()).toContain("BRANCHES.VALIDATION.ADDRESS_REQUIRED");
        expect(text()).toContain("BRANCHES.VALIDATION.PHONE_REQUIRED");
        expect(text()).toContain("BRANCHES.VALIDATION.BOOKING_TYPE_REQUIRED");
        expect(repo.create).not.toHaveBeenCalled();
      });

      it("does not nag before the user has touched a field", async () => {
        await setup();
        expect(el().querySelectorAll('[role="alert"]').length).toBe(0);
      });

      it("explains a wrongly formatted phone and map link", async () => {
        await setup();
        const [, , , phone, map] = textFields();
        type(phone, "01001102194");
        phone.dispatchEvent(new Event("blur"));
        type(map, "not a link");
        map.dispatchEvent(new Event("blur"));
        await settle();

        expect(text()).toContain("BRANCHES.VALIDATION.PHONE_INVALID");
        expect(text()).toContain("BRANCHES.VALIDATION.URL_INVALID");
      });

      it("explains a too-long name", async () => {
        await setup();
        const nameEn = textFields()[1];
        type(nameEn, "a".repeat(101));
        nameEn.dispatchEvent(new Event("blur"));
        await settle();

        expect(text()).toContain("BRANCHES.VALIDATION.NAME_EN_MAX");
      });

      it("clears the booking-type error once one type is chosen", async () => {
        await setup();
        el().querySelector("form")!.dispatchEvent(new Event("submit"));
        await settle();
        expect(text()).toContain("BRANCHES.VALIDATION.BOOKING_TYPE_REQUIRED");

        check(bookingBoxes()[1]);
        await settle();
        expect(text()).not.toContain("BRANCHES.VALIDATION.BOOKING_TYPE_REQUIRED");
      });
    });

    describe("working hours", () => {
      it("opening a day reveals its two time fields; closing hides them and clears the times", async () => {
        await setup();
        switches()[1].click();
        await settle();
        expect(timeInputs().length).toBe(2);
        expect(switches()[1].getAttribute("aria-checked")).toBe("true");

        type(timeInputs()[0], "09:00");
        type(timeInputs()[1], "23:00");
        switches()[1].click();
        await settle();

        expect(timeInputs().length).toBe(0);
        switches()[1].click();
        await settle();
        expect(timeInputs().map((t) => t.value)).toEqual(["", ""]);
      });

      it("blocks saving an open day that has no times and says so", async () => {
        await setup();
        await fillValid();
        switches()[0].click();
        await settle();

        el().querySelector("form")!.dispatchEvent(new Event("submit"));
        await settle();

        expect(repo.create).not.toHaveBeenCalled();
        expect(text()).toContain("BRANCHES.VALIDATION.HOURS_REQUIRED");
      });

      it("explains a day shorter than an hour", async () => {
        await setup();
        switches()[0].click();
        await settle();
        const [open, close] = timeInputs();
        type(open, "10:00");
        open.dispatchEvent(new Event("blur"));
        type(close, "10:30");
        close.dispatchEvent(new Event("blur"));
        await settle();

        expect(text()).toContain("BRANCHES.VALIDATION.HOURS_MIN_DURATION");
      });

      it("explains an overnight close later than 06:00", async () => {
        await setup();
        switches()[0].click();
        await settle();
        const [open, close] = timeInputs();
        type(open, "22:00");
        open.dispatchEvent(new Event("blur"));
        type(close, "09:00");
        close.dispatchEvent(new Event("blur"));
        await settle();

        expect(text()).toContain("BRANCHES.VALIDATION.HOURS_OVERNIGHT");
      });
    });

    describe("submit", () => {
      it("creates the branch with a trimmed, API-shaped payload and opens its details", async () => {
        await setup();
        await fillValid();
        switches()[0].click();
        await settle();
        type(timeInputs()[0], "09:00");
        type(timeInputs()[1], "23:00");
        await settle();

        el().querySelector("form")!.dispatchEvent(new Event("submit"));
        await settle();

        expect(repo.create).toHaveBeenCalledTimes(1);
        const payload = repo.create.mock.calls[0][0];
        expect(payload).toMatchObject({
          nameAr: "فرع جديد",
          nameEn: "New Branch",
          address: "1 Main St",
          phone: "+201001234567",
          mapUrl: null,
          allowsRegular: true,
          allowsVip: false,
          allowsHome: false,
        });
        expect(payload.workingHours.length).toBe(7);
        expect(payload.workingHours[0]).toEqual({
          dayOfWeek: BranchDayOfWeek.Saturday,
          isOpen: true,
          openTime: "09:00:00",
          closeTime: "23:00:00",
        });
        expect(payload.workingHours[1]).toEqual({
          dayOfWeek: BranchDayOfWeek.Sunday,
          isOpen: false,
          openTime: null,
          closeTime: null,
        });
        expect(navigate).toHaveBeenCalledWith(["/main/branches", 42]);
      });

      it("shows a spinner on the button and ignores a second submit while saving", async () => {
        await setup();
        const pending = new Subject<ApiResponse<number>>();
        repo.create.mockReturnValue(pending);
        await fillValid();

        el().querySelector("form")!.dispatchEvent(new Event("submit"));
        await settle();
        expect(submitButton().getAttribute("aria-busy")).toBe("true");

        el().querySelector("form")!.dispatchEvent(new Event("submit"));
        expect(repo.create).toHaveBeenCalledTimes(1);

        pending.next(ok(42));
        pending.complete();
        await settle();
        expect(submitButton().getAttribute("aria-busy")).toBeNull();
      });

      it("stays on the page, with the data kept, when the API rejects the save", async () => {
        await setup();
        repo.create.mockReturnValue(throwError(() => new Error("400")));
        await fillValid();

        el().querySelector("form")!.dispatchEvent(new Event("submit"));
        await settle();

        expect(navigate).not.toHaveBeenCalled();
        expect(textFields()[1].value).toBe("  New Branch ");
        expect(submitButton().disabled).toBe(false);
      });

      it("Cancel goes back to the list without saving", async () => {
        await setup();
        (el().querySelector(".form-actions app-button button") as HTMLButtonElement).click();

        expect(navigate).toHaveBeenCalledWith(["/main/branches"]);
        expect(repo.create).not.toHaveBeenCalled();
      });
    });
  });

  describe("edit mode", () => {
    it("shows loading placeholders while the branch loads", async () => {
      await setup("5");
      const pending = new Subject<ApiResponse<BranchDetails>>();
      TestBed.resetTestingModule();
      repo = new FakeRepository();
      repo.byId.mockReturnValue(pending);
      TestBed.configureTestingModule({
        imports: [BranchesForm, TranslateModule.forRoot()],
        providers: [
          provideRouter([]),
          { provide: BRANCH_REPOSITORY, useValue: repo },
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { paramMap: convertToParamMap({ id: "5" }) } },
          },
        ],
      });
      TestBed.inject(TranslateService).use("en");
      fixture = TestBed.createComponent(BranchesForm);
      await settle();

      expect(el().querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(el().querySelector("form")).toBeNull();

      pending.next(ok(DETAILS));
      pending.complete();
      await settle();
      expect(el().querySelector('[aria-busy="true"]')).toBeNull();
      expect(el().querySelector("form")).not.toBeNull();
    });

    it("loads the branch by id and fills every section", async () => {
      await setup("5");

      expect(repo.byId).toHaveBeenCalledWith(5);
      expect(el().querySelector("app-page-header")?.textContent).toContain(
        "BRANCHES.FORM.EDIT_TITLE",
      );
      expect(textFields().map((i) => i.value)).toEqual([
        "الزمالك",
        "Zamalek",
        "8 Hassan Sabry St",
        "+201020304050",
        "https://maps.example/z",
      ]);
      expect(bookingBoxes().map((b) => b.checked)).toEqual([true, false, true]);
      expect(switches()[0].getAttribute("aria-checked")).toBe("true"); // Saturday
      expect(switches()[6].getAttribute("aria-checked")).toBe("false"); // Friday
      expect(timeInputs().map((t) => t.value)).toEqual(["10:00", "22:00"]);
    });

    it("puts the branch name in the breadcrumb trail", async () => {
      repo = new FakeRepository();
      TestBed.configureTestingModule({
        imports: [BranchesForm, TranslateModule.forRoot()],
        providers: [
          provideRouter([]),
          { provide: BRANCH_REPOSITORY, useValue: repo },
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { paramMap: convertToParamMap({ id: "5" }) } },
          },
        ],
      });
      const crumbs = vi.spyOn(TestBed.inject(BreadcrumbService), "setBreadcrumbs");
      fixture = TestBed.createComponent(BranchesForm);
      await settle();

      const trail = crumbs.mock.calls[0][0];
      expect(trail.map((c) => c.label)).toEqual([
        "LAYOUT.NAV.DASHBOARD",
        "LAYOUT.NAV.BRANCHES",
        "Zamalek",
        "BRANCHES.FORM.EDIT_TITLE",
      ]);
    });

    it("saves with PUT semantics and goes back to that branch's details", async () => {
      await setup("5");
      type(textFields()[1], "Zamalek Island");
      await settle();

      el().querySelector("form")!.dispatchEvent(new Event("submit"));
      await settle();

      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.update).toHaveBeenCalledTimes(1);
      const [id, payload] = repo.update.mock.calls[0];
      expect(id).toBe(5);
      expect(payload).toMatchObject({
        nameEn: "Zamalek Island",
        mapUrl: "https://maps.example/z",
        allowsHome: true,
      });
      expect(payload.workingHours.find((d) => d.dayOfWeek === BranchDayOfWeek.Saturday)).toEqual({
        dayOfWeek: BranchDayOfWeek.Saturday,
        isOpen: true,
        openTime: "10:00:00",
        closeTime: "22:00:00",
      });
      expect(navigate).toHaveBeenCalledWith(["/main/branches", 5]);
    });

    it("Cancel returns to the branch details", async () => {
      await setup("5");
      (el().querySelector(".form-actions app-button button") as HTMLButtonElement).click();

      expect(navigate).toHaveBeenCalledWith(["/main/branches", 5]);
    });

    it("shows a failed state with retry when the branch cannot be loaded", async () => {
      repo = new FakeRepository();
      repo.byId.mockReturnValue(throwError(() => new Error("404")));
      TestBed.configureTestingModule({
        imports: [BranchesForm, TranslateModule.forRoot()],
        providers: [
          provideRouter([]),
          { provide: BRANCH_REPOSITORY, useValue: repo },
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { paramMap: convertToParamMap({ id: "5" }) } },
          },
        ],
      });
      fixture = TestBed.createComponent(BranchesForm);
      await settle();

      expect(el().querySelector("app-failed-state")).not.toBeNull();
      expect(el().querySelector("form")).toBeNull();

      repo.byId.mockReturnValue(of(ok(DETAILS)));
      (el().querySelector("app-failed-state button") as HTMLButtonElement).click();
      await settle();

      expect(el().querySelector("app-failed-state")).toBeNull();
      expect(textFields()[1].value).toBe("Zamalek");
    });

    it.each(["abc", "0", "-3", "1.5"])(
      'redirects to the list for the invalid id "%s"',
      async (id) => {
        await setup(id);

        expect(navigate).toHaveBeenCalledWith(["/main/branches"]);
        expect(repo.byId).not.toHaveBeenCalled();
      },
    );
  });
});
