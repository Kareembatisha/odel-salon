import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageService } from "@core/services/language.service";
import { NotificationService } from "@core/services/notification.service";
import { ServiceOption } from "../../../services/model/service.model";
import {
  CreateOfferPayload,
  OfferDetails,
  OfferStatus,
  UpdateOfferPayload,
} from "../../model/offer.model";
import { addDays, cairoToday } from "../../utils/offer-dates.util";
import { OfferForm } from "./offer-form";

const opt = (id: number, over: Partial<ServiceOption> = {}): ServiceOption => ({
  id,
  nameAr: `[AR] Service ${id}`,
  nameEn: `Service ${id}`,
  durationMinutes: 30,
  regularPrice: 100,
  vipPrice: 150,
  isHomeAvailable: false,
  homePrice: null,
  ...over,
});

/** 1 + 2 can be booked at home; 3 can't. Regular: 100 + 60 = 160, VIP: 150 + 100 = 250, Home: 200 + 120 = 320. */
const SERVICES: ServiceOption[] = [
  opt(1, { regularPrice: 100, vipPrice: 150, isHomeAvailable: true, homePrice: 200 }),
  opt(2, { regularPrice: 60, vipPrice: 100, isHomeAvailable: true, homePrice: 120 }),
  opt(3, { regularPrice: 50, vipPrice: 80 }),
];

const TODAY = cairoToday();
const TOMORROW = addDays(TODAY, 1);
const YESTERDAY = addDays(TODAY, -1);

const DETAILS: OfferDetails = {
  id: 7,
  branchId: 3,
  branchNameAr: "مدينة نصر",
  branchNameEn: "Nasr City",
  nameAr: "[AR] Weekend",
  nameEn: "Weekend",
  imageUrl: "https://api.odelsalon.com/uploads/offers/x.jpg",
  regularPrice: 150,
  vipPrice: 240,
  homePrice: 300,
  startDate: addDays(TODAY, -5),
  endDate: addDays(TODAY, 10),
  maxBookings: 50,
  bookingsCount: 0,
  status: OfferStatus.Active,
  stoppedAt: null,
  services: [
    { serviceId: 1, nameAr: "", nameEn: "Service 1" },
    { serviceId: 2, nameAr: "", nameEn: "Service 2" },
  ],
  originalRegularPrice: 160,
  originalVipPrice: 250,
  originalHomePrice: 320,
  savingPercent: 6,
  durationMinutes: 45,
  createdAt: "2026-11-05T11:00:00Z",
  updatedAt: null,
};

const file = (name: string, type: string, size = 1000) =>
  new File([new Uint8Array(size)], name, { type });

describe("OfferForm", () => {
  let fixture: ComponentFixture<OfferForm>;
  let submitted: Mock<(payload: CreateOfferPayload | UpdateOfferPayload) => void>;
  let cancelled: Mock<() => void>;
  let error: ReturnType<typeof vi.fn>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? "";
  const field = (label: string) =>
    el().querySelector<HTMLInputElement>(`app-float-label-input input[aria-label="${label}"]`)!;
  const checks = () => Array.from(el().querySelectorAll<HTMLInputElement>(".sp__check"));
  const submitButton = () => el().querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const fileInput = () => el().querySelector<HTMLInputElement>('input[type="file"]')!;
  const bannerImg = () => el().querySelector<HTMLImageElement>(".of__preview-img");
  const bannerButton = (key: string) =>
    Array.from(el().querySelectorAll<HTMLButtonElement>(".of__banner-actions button")).find((b) =>
      b.textContent?.includes(key),
    );
  const lastPayload = () => submitted.mock.calls[submitted.mock.calls.length - 1][0];

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setup(
    opts: {
      mode?: "create" | "edit";
      details?: OfferDetails | null;
      services?: ServiceOption[];
      saving?: boolean;
    } = {},
  ) {
    error = vi.fn();
    TestBed.configureTestingModule({
      imports: [OfferForm, TranslateModule.forRoot()],
      providers: [
        { provide: NotificationService, useValue: { error, success: vi.fn(), warning: vi.fn() } },
      ],
    });
    TestBed.inject(TranslateService).use("en");
    TestBed.inject(LanguageService).setLang("en");
    fixture = TestBed.createComponent(OfferForm);
    fixture.componentRef.setInput("mode", opts.mode ?? "create");
    fixture.componentRef.setInput("details", opts.details ?? null);
    fixture.componentRef.setInput("branchId", 3);
    fixture.componentRef.setInput("branchName", "Nasr City");
    fixture.componentRef.setInput("services", opts.services ?? SERVICES);
    fixture.componentRef.setInput("saving", opts.saving ?? false);

    submitted = vi.fn<(payload: CreateOfferPayload | UpdateOfferPayload) => void>();
    cancelled = vi.fn<() => void>();
    fixture.componentInstance.submitted.subscribe((v) => submitted(v));
    fixture.componentInstance.cancelled.subscribe(() => cancelled());
    await settle();
  }

  async function type(label: string, value: string) {
    const input = field(label);
    input.value = value;
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new Event("blur"));
    await settle();
  }

  async function pick(...ids: number[]) {
    for (const id of ids) {
      checks()[SERVICES.findIndex((s) => s.id === id)].click();
      await settle();
    }
  }

  async function fillValid() {
    await type("OFFERS.FORM.NAME_AR", "  [AR] Brand New  ");
    await type("OFFERS.FORM.NAME_EN", "  Brand New  ");
    await pick(1, 2);
    await type("OFFERS.FORM.REGULAR_PRICE", "120");
    await type("OFFERS.FORM.VIP_PRICE", "200");
  }

  async function submit() {
    submitButton().click();
    await settle();
  }

  async function chooseFile(f: File) {
    const input = fileInput();
    Object.defineProperty(input, "files", { value: [f], configurable: true });
    input.dispatchEvent(new Event("change"));
    await settle();
  }

  beforeEach(() => {
    localStorage.clear();
    // A preview URL needs a browser; keep it deterministic here.
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:preview"),
        revokeObjectURL: vi.fn(),
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  describe("create", () => {
    it("shows the fixed branch, a start date of today, no end, and one checkbox per active service", async () => {
      await setup();
      expect(text()).toContain("Nasr City");
      expect(text()).toContain("OFFERS.FORM.BRANCH_NOTE_CREATE");
      expect(field("OFFERS.FORM.START_DATE").value).toBe(TODAY);
      expect(field("OFFERS.FORM.END_DATE").value).toBe("");
      expect(field("OFFERS.FORM.MAX_BOOKINGS").value).toBe("");
      expect(checks()).toHaveLength(3);
      expect(el().querySelector(".st")).toBeNull();
    });

    it("stops the date picker at today for the start date, and at the start date for the end date", async () => {
      await setup();
      expect(field("OFFERS.FORM.START_DATE").getAttribute("min")).toBe(TODAY);
      expect(field("OFFERS.FORM.END_DATE").getAttribute("min")).toBe(TODAY);

      await type("OFFERS.FORM.START_DATE", TOMORROW);
      expect(field("OFFERS.FORM.END_DATE").getAttribute("min")).toBe(TOMORROW);
    });

    it("submits the payload with the branch, trimmed names and nulls for the optional fields", async () => {
      await setup();
      await fillValid();
      await submit();

      expect(submitted).toHaveBeenCalledTimes(1);
      expect(lastPayload()).toEqual({
        branchId: 3,
        nameAr: "[AR] Brand New",
        nameEn: "Brand New",
        serviceIds: [1, 2],
        regularPrice: 120,
        vipPrice: 200,
        homePrice: null,
        startDate: TODAY,
        endDate: null,
        maxBookings: null,
        image: null,
      });
      expect("removeImage" in lastPayload()).toBe(false);
    });

    it("sends the end date, the booking limit and the home price when given", async () => {
      await setup();
      await fillValid();
      await type("OFFERS.FORM.END_DATE", addDays(TODAY, 30));
      await type("OFFERS.FORM.MAX_BOOKINGS", "50");
      await type("OFFERS.FORM.HOME_PRICE", "250");
      await submit();

      expect(lastPayload()).toMatchObject({
        endDate: addDays(TODAY, 30),
        maxBookings: 50,
        homePrice: 250,
      });
    });

    it("does not submit an empty form, shows the errors and focuses the first one", async () => {
      await setup();
      await type("OFFERS.FORM.START_DATE", "");
      await submit();
      await settle();

      expect(submitted).not.toHaveBeenCalled();
      expect(text()).toContain("OFFERS.FORM.NAME_REQUIRED");
      expect(text()).toContain("OFFERS.FORM.START_REQUIRED");
      expect(text()).toContain("OFFERS.FORM.SERVICES_MIN");
      expect(text()).toContain("OFFERS.FORM.PRICE_REQUIRED");
    });

    it("ignores a submit while saving", async () => {
      await setup({ saving: true });
      await fillValid();
      await submit();
      expect(submitted).not.toHaveBeenCalled();
    });

    it("cancel emits cancelled", async () => {
      await setup();
      el().querySelector<HTMLButtonElement>(".of__footer button")!.click();
      expect(cancelled).toHaveBeenCalled();
    });
  });

  describe("names", () => {
    it("refuses a name of only spaces and one over 100 characters", async () => {
      await setup();
      await type("OFFERS.FORM.NAME_EN", "    ");
      expect(text()).toContain("OFFERS.FORM.NAME_REQUIRED");

      await type("OFFERS.FORM.NAME_EN", "x".repeat(101));
      expect(text()).toContain("OFFERS.FORM.NAME_MAX");

      await type("OFFERS.FORM.NAME_EN", "x".repeat(100));
      expect(text()).not.toContain("OFFERS.FORM.NAME_MAX");
    });
  });

  describe("dates", () => {
    it("refuses a start date in the past when creating", async () => {
      await setup();
      await type("OFFERS.FORM.START_DATE", YESTERDAY);
      expect(text()).toContain("OFFERS.FORM.START_PAST");
    });

    it("accepts today and a future start date", async () => {
      await setup();
      await type("OFFERS.FORM.START_DATE", TODAY);
      expect(el().querySelector(".fli--error")).toBeNull();
      await type("OFFERS.FORM.START_DATE", addDays(TODAY, 90));
      expect(el().querySelector(".fli--error")).toBeNull();
    });

    it("refuses an end date before the start date, and accepts the same day", async () => {
      await setup();
      await type("OFFERS.FORM.START_DATE", addDays(TODAY, 5));
      await type("OFFERS.FORM.END_DATE", addDays(TODAY, 4));
      expect(text()).toContain("OFFERS.FORM.END_BEFORE_START");

      await type("OFFERS.FORM.END_DATE", addDays(TODAY, 5));
      expect(text()).not.toContain("OFFERS.FORM.END_BEFORE_START");
    });

    it("re-checks the end date when the start date moves past it", async () => {
      await setup();
      await type("OFFERS.FORM.END_DATE", addDays(TODAY, 3));
      expect(text()).not.toContain("OFFERS.FORM.END_BEFORE_START");

      await type("OFFERS.FORM.START_DATE", addDays(TODAY, 8));
      expect(text()).toContain("OFFERS.FORM.END_BEFORE_START");
    });

    it('treats an empty end date as "no end"', async () => {
      await setup();
      await type("OFFERS.FORM.END_DATE", "");
      expect(el().querySelector(".fli--error")).toBeNull();
    });
  });

  describe("max bookings", () => {
    it.each(["0", "-3", "1.5", "100001"])("refuses %s", async (value) => {
      await setup();
      await type("OFFERS.FORM.MAX_BOOKINGS", value);
      expect(text()).toContain("OFFERS.FORM.MAX_BOOKINGS_INVALID");
    });

    it.each(["1", "50", "100000", ""])('accepts "%s"', async (value) => {
      await setup();
      await type("OFFERS.FORM.MAX_BOOKINGS", value);
      expect(text()).not.toContain("OFFERS.FORM.MAX_BOOKINGS_INVALID");
    });
  });

  describe("services and prices", () => {
    it("needs at least one service (not two like a package)", async () => {
      await setup();
      await type("OFFERS.FORM.NAME_AR", "ع");
      await type("OFFERS.FORM.NAME_EN", "x");
      await pick(1);
      await type("OFFERS.FORM.REGULAR_PRICE", "90");
      await type("OFFERS.FORM.VIP_PRICE", "140");
      await submit();

      expect(submitted).toHaveBeenCalledTimes(1);
      expect(lastPayload()).toMatchObject({ serviceIds: [1] });
    });

    it('shows the "Before discount" totals of the chosen services', async () => {
      await setup();
      await pick(1, 2);
      const box = el().querySelector(".st")!.textContent!;
      expect(box).toContain("160");
      expect(box).toContain("250");
    });

    it("refuses a price that is not lower than the total, and re-checks when the selection changes", async () => {
      await setup();
      await pick(1, 2);
      await type("OFFERS.FORM.REGULAR_PRICE", "160");
      expect(text()).toContain("OFFERS.FORM.PRICE_TOO_HIGH");

      await type("OFFERS.FORM.REGULAR_PRICE", "159.99");
      expect(text()).not.toContain("OFFERS.FORM.PRICE_TOO_HIGH");

      await pick(2); // total drops to 100
      expect(text()).toContain("OFFERS.FORM.PRICE_TOO_HIGH");
    });

    it.each(["0", "-5", "100000.5", "10.123"])("refuses the price %s", async (value) => {
      await setup();
      await pick(1);
      await type("OFFERS.FORM.REGULAR_PRICE", value);
      expect(text()).toMatch(/OFFERS\.FORM\.PRICE_(INVALID|TOO_HIGH)/);
    });

    it("shows the live saving percent under a valid price", async () => {
      await setup();
      await pick(1, 2); // regular total 160
      await type("OFFERS.FORM.REGULAR_PRICE", "120");
      expect(el().querySelector(".of__saving")!.textContent).toContain("OFFERS.SAVE");
      // 25% = (160 - 120) / 160
      expect(fixture.componentInstance["savings"]().regular).toBe(25);
    });

    it("shows no saving for an invalid or too-high price", async () => {
      await setup();
      await pick(1, 2);
      await type("OFFERS.FORM.REGULAR_PRICE", "200");
      expect(fixture.componentInstance["savings"]().regular).toBe(0);
      expect(el().querySelector(".of__saving")).toBeNull();
    });

    it("offers a home price only when every chosen service allows home visits", async () => {
      await setup();
      await pick(1, 2);
      expect(field("OFFERS.FORM.HOME_PRICE")).not.toBeNull();

      await pick(3);
      expect(field("OFFERS.FORM.HOME_PRICE")).toBeNull();
      expect(text()).toContain("OFFERS.FORM.HOME_UNAVAILABLE");
    });

    it("drops a typed home price when the selection no longer allows it", async () => {
      await setup();
      await pick(1, 2);
      await type("OFFERS.FORM.HOME_PRICE", "250");
      await pick(3);
      await type("OFFERS.FORM.REGULAR_PRICE", "120");
      await type("OFFERS.FORM.VIP_PRICE", "200");
      await type("OFFERS.FORM.NAME_AR", "ع");
      await type("OFFERS.FORM.NAME_EN", "x");
      await submit();

      expect(lastPayload()).toMatchObject({ homePrice: null });
    });

    it("says so when the branch has no active services", async () => {
      await setup({ services: [] });
      expect(checks()).toHaveLength(0);
    });
  });

  describe("banner", () => {
    it('starts with a placeholder and "Add banner"', async () => {
      await setup();
      expect(bannerImg()).toBeNull();
      expect(bannerButton("BANNER_ADD")).toBeDefined();
      expect(bannerButton("BANNER_REMOVE")).toBeUndefined();
    });

    it("previews a chosen banner, offers Change / Remove, and sends the file", async () => {
      await setup();
      const banner = file("banner.jpg", "image/jpeg");
      await chooseFile(banner);

      expect(bannerImg()!.getAttribute("src")).toBe("blob:preview");
      expect(bannerButton("BANNER_CHANGE")).toBeDefined();
      expect(bannerButton("BANNER_REMOVE")).toBeDefined();
      expect(text()).toContain("OFFERS.FORM.BANNER_PENDING");

      await fillValid();
      await submit();
      expect((lastPayload() as CreateOfferPayload).image).toBe(banner);
    });

    it.each([
      ["png", "image/png"],
      ["webp", "image/webp"],
    ])("accepts %s", async (ext, type) => {
      await setup();
      await chooseFile(file(`b.${ext}`, type));
      expect(bannerImg()).not.toBeNull();
      expect(error).not.toHaveBeenCalled();
    });

    it("refuses a wrong type and a file over 5 MB with a toast, keeping the current state", async () => {
      await setup();
      await chooseFile(file("doc.pdf", "application/pdf"));
      expect(error).toHaveBeenCalledWith(
        "FILE_VALIDATION.UNSUPPORTED_TYPE",
        "OFFERS.FORM.BANNER_HINT",
      );
      expect(bannerImg()).toBeNull();

      await chooseFile(file("big.jpg", "image/jpeg", 5 * 1024 * 1024 + 1));
      expect(error).toHaveBeenCalledWith(
        "FILE_VALIDATION.FILE_TOO_LARGE",
        "OFFERS.FORM.BANNER_HINT",
      );
      expect(bannerImg()).toBeNull();
    });

    it("accepts a file of exactly 5 MB", async () => {
      await setup();
      await chooseFile(file("edge.jpg", "image/jpeg", 5 * 1024 * 1024));
      expect(error).not.toHaveBeenCalled();
      expect(bannerImg()).not.toBeNull();
    });

    it("removing a just-chosen banner simply drops it (nothing to remove on the server)", async () => {
      await setup();
      await chooseFile(file("banner.jpg", "image/jpeg"));
      bannerButton("BANNER_REMOVE")!.click();
      await settle();

      expect(bannerImg()).toBeNull();
      expect(text()).not.toContain("OFFERS.FORM.BANNER_PENDING");
    });
  });

  describe("edit", () => {
    it("pre-fills everything from the loaded offer and locks the branch", async () => {
      await setup({ mode: "edit", details: DETAILS });
      expect(text()).toContain("OFFERS.FORM.BRANCH_NOTE_EDIT");
      expect(field("OFFERS.FORM.NAME_EN").value).toBe("Weekend");
      expect(field("OFFERS.FORM.START_DATE").value).toBe(DETAILS.startDate);
      expect(field("OFFERS.FORM.END_DATE").value).toBe(DETAILS.endDate);
      expect(field("OFFERS.FORM.MAX_BOOKINGS").value).toBe("50");
      expect(field("OFFERS.FORM.REGULAR_PRICE").value).toBe("150");
      expect(field("OFFERS.FORM.HOME_PRICE").value).toBe("300");
      expect(checks().map((c) => c.checked)).toEqual([true, true, false]);
      expect(bannerImg()!.getAttribute("src")).toBe(DETAILS.imageUrl);
    });

    it("allows a start date in the past (a running offer stays editable) and no picker minimum", async () => {
      await setup({ mode: "edit", details: DETAILS });
      expect(field("OFFERS.FORM.START_DATE").getAttribute("min")).toBeNull();

      await submit();
      expect(submitted).toHaveBeenCalledTimes(1);
      expect(text()).not.toContain("OFFERS.FORM.START_PAST");
    });

    it("sends no branch, keeps the banner (removeImage=false) and a null image when nothing changed", async () => {
      await setup({ mode: "edit", details: DETAILS });
      await submit();

      const payload = lastPayload() as UpdateOfferPayload;
      expect("branchId" in payload).toBe(false);
      expect(payload).toMatchObject({
        nameEn: "Weekend",
        serviceIds: [1, 2],
        regularPrice: 150,
        vipPrice: 240,
        homePrice: 300,
        startDate: DETAILS.startDate,
        endDate: DETAILS.endDate,
        maxBookings: 50,
        image: null,
        removeImage: false,
      });
    });

    it('clearing the end date and the limit sends null ("No end" / "No limit")', async () => {
      await setup({ mode: "edit", details: DETAILS });
      await type("OFFERS.FORM.END_DATE", "");
      await type("OFFERS.FORM.MAX_BOOKINGS", "");
      await submit();

      expect(lastPayload()).toMatchObject({ endDate: null, maxBookings: null });
    });

    it('"Remove banner" sends removeImage=true and no file', async () => {
      await setup({ mode: "edit", details: DETAILS });
      bannerButton("BANNER_REMOVE")!.click();
      await settle();
      expect(bannerImg()).toBeNull();
      expect(text()).toContain("OFFERS.FORM.BANNER_PENDING");

      await submit();
      expect(lastPayload()).toMatchObject({ removeImage: true, image: null });
    });

    it("a new banner replaces the old one (removeImage=false) and previews it", async () => {
      await setup({ mode: "edit", details: DETAILS });
      const banner = file("new.png", "image/png");
      await chooseFile(banner);
      expect(bannerImg()!.getAttribute("src")).toBe("blob:preview");

      await submit();
      expect(lastPayload()).toMatchObject({ image: banner, removeImage: false });
    });

    it("removing, then choosing a new banner cancels the removal", async () => {
      await setup({ mode: "edit", details: DETAILS });
      bannerButton("BANNER_REMOVE")!.click();
      await settle();
      const banner = file("new.png", "image/png");
      await chooseFile(banner);
      await submit();

      expect(lastPayload()).toMatchObject({ image: banner, removeImage: false });
    });

    it("choosing a banner then removing it restores the removal instruction for the old one", async () => {
      await setup({ mode: "edit", details: DETAILS });
      await chooseFile(file("new.png", "image/png"));
      bannerButton("BANNER_REMOVE")!.click();
      await settle();
      await submit();

      expect(lastPayload()).toMatchObject({ image: null, removeImage: true });
    });

    it("lists a service that was deactivated since, blocks saving, and lets the user remove it", async () => {
      await setup({ mode: "edit", details: DETAILS, services: [SERVICES[0], SERVICES[2]] }); // 2 is gone
      await submit();
      expect(submitted).not.toHaveBeenCalled();
      expect(text()).toContain("OFFERS.FORM.SERVICES_UNAVAILABLE");
    });
  });
});
