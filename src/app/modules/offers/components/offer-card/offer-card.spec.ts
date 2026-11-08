import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LanguageService } from "@core/services/language.service";
import { OfferListItem, OfferStatus } from "../../model/offer.model";
import { OfferCard } from "./offer-card";

const OFFER: OfferListItem = {
  id: 3,
  branchId: 1,
  nameAr: "[AR] Weekend Offer",
  nameEn: "Weekend Offer",
  imageUrl: "https://api.odelsalon.com/uploads/offers/3f2a9c.jpg",
  regularPrice: 250,
  vipPrice: 380,
  homePrice: null,
  startDate: "2026-10-16",
  endDate: "2026-10-31",
  maxBookings: 50,
  bookingsCount: 0,
  status: OfferStatus.Active,
  stoppedAt: null,
  services: [
    { serviceId: 1, nameAr: "[AR] Haircut", nameEn: "Haircut" },
    { serviceId: 2, nameAr: "[AR] Beard trim", nameEn: "Beard trim" },
  ],
  originalRegularPrice: 320,
  originalVipPrice: 490,
  originalHomePrice: null,
  savingPercent: 22,
};

describe("OfferCard", () => {
  let fixture: ComponentFixture<OfferCard>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? "";
  const rows = () => Array.from(el().querySelectorAll<HTMLElement>(".offer__price-row"));
  const button = (label: string) =>
    el().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  const footerButtons = () =>
    Array.from(el().querySelectorAll<HTMLButtonElement>(".offer__footer button"));
  const toggleButton = () =>
    footerButtons().find((b) => /OFFERS\.(STOP|RESUME)/.test(b.textContent ?? ""));

  async function setup(
    offer: OfferListItem = OFFER,
    inputs: { canEdit?: boolean; canToggle?: boolean; canDelete?: boolean; busy?: boolean } = {},
    lang = "en",
  ) {
    TestBed.configureTestingModule({ imports: [OfferCard, TranslateModule.forRoot()] });
    TestBed.inject(TranslateService).use("en");
    TestBed.inject(LanguageService).setLang(lang as "en" | "ar");
    fixture = TestBed.createComponent(OfferCard);
    fixture.componentRef.setInput("offer", offer);
    fixture.componentRef.setInput("canEdit", inputs.canEdit ?? false);
    fixture.componentRef.setInput("canToggle", inputs.canToggle ?? false);
    fixture.componentRef.setInput("canDelete", inputs.canDelete ?? false);
    fixture.componentRef.setInput("busy", inputs.busy ?? false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  describe("content", () => {
    it("shows the name, the other-language name, the services and the status badge", async () => {
      await setup();
      expect(el().querySelector(".offer__name")?.textContent).toContain("Weekend Offer");
      expect(el().querySelector(".offer__other-name")?.textContent).toContain("[AR] Weekend Offer");
      expect(
        Array.from(el().querySelectorAll(".offer__chip")).map((c) => c.textContent?.trim()),
      ).toEqual(["Haircut", "Beard trim"]);
      expect(text()).toContain("OFFERS.STATUS.ACTIVE");
    });

    it("shows the Arabic name first in Arabic", async () => {
      await setup(OFFER, {}, "ar");
      expect(el().querySelector(".offer__name")?.textContent).toContain("[AR] Weekend Offer");
      expect(el().querySelector(".offer__other-name")?.textContent).toContain("Weekend Offer");
      TestBed.inject(LanguageService).setLang("en");
    });

    it("shows the banner, decorative, in a 16:9 box", async () => {
      await setup();
      const img = el().querySelector<HTMLImageElement>(".offer__banner img")!;
      expect(img.getAttribute("src")).toBe(OFFER.imageUrl);
      expect(img.getAttribute("alt")).toBe("");
    });

    it("shows a placeholder without a banner, and when the banner fails to load", async () => {
      await setup({ ...OFFER, imageUrl: null });
      expect(el().querySelector(".offer__banner img")).toBeNull();
      expect(el().querySelector(".offer__placeholder")).not.toBeNull();

      fixture.destroy();
      TestBed.resetTestingModule();
      await setup();
      el().querySelector(".offer__banner img")!.dispatchEvent(new Event("error"));
      fixture.detectChanges();
      expect(el().querySelector(".offer__banner img")).toBeNull();
      expect(el().querySelector(".offer__placeholder")).not.toBeNull();
    });

    it('shows the "Save 22%" badge from the API, and none when there is no saving', async () => {
      await setup();
      expect(text()).toContain("OFFERS.SAVE");
      expect(el().querySelector(".offer__save-badge")).not.toBeNull();

      fixture.destroy();
      TestBed.resetTestingModule();
      await setup({ ...OFFER, savingPercent: 0 });
      expect(el().querySelector(".offer__save-badge")).toBeNull();
    });

    it('writes the date range, and "No end" for an open offer', async () => {
      await setup();
      expect(text()).toContain("Oct 16, 2026 – Oct 31, 2026");

      fixture.destroy();
      TestBed.resetTestingModule();
      await setup({ ...OFFER, endDate: null });
      expect(text()).toContain("Oct 16, 2026 – OFFERS.NO_END");
    });

    it('shows bookings as "0 / 50", or "0 · No limit"', async () => {
      await setup();
      expect(text()).toContain("0 / 50");

      fixture.destroy();
      TestBed.resetTestingModule();
      await setup({ ...OFFER, maxBookings: null });
      expect(text()).toContain("0 · OFFERS.NO_LIMIT");
    });
  });

  describe("prices", () => {
    it("shows the offer price with the services total struck through", async () => {
      await setup();
      expect(rows()[0].textContent).toContain("SERVICES.CURRENCY 250");
      expect(rows()[0].querySelector("s")?.textContent).toContain("SERVICES.CURRENCY 320");
      expect(rows()[1].textContent).toContain("SERVICES.CURRENCY 380");
      expect(rows()[1].querySelector("s")?.textContent).toContain("SERVICES.CURRENCY 490");
    });

    it('says "In branch only" when there is no home price', async () => {
      await setup();
      expect(rows()[2].textContent).toContain("OFFERS.IN_BRANCH_ONLY");
      expect(rows()[2].querySelector("s")).toBeNull();
    });

    it("shows the home price and its total when home is offered", async () => {
      await setup({ ...OFFER, homePrice: 400, originalHomePrice: 520 });
      expect(rows()[2].textContent).toContain("SERVICES.CURRENCY 400");
      expect(rows()[2].querySelector("s")?.textContent).toContain("SERVICES.CURRENCY 520");
    });

    it("does not strike anything through when the offer is not cheaper", async () => {
      await setup({ ...OFFER, originalRegularPrice: 250 });
      expect(rows()[0].querySelector("s")).toBeNull();
    });
  });

  describe("accessibility", () => {
    async function setupNamed(
      offer: OfferListItem,
      inputs: { canEdit?: boolean; canToggle?: boolean; canDelete?: boolean },
    ) {
      TestBed.configureTestingModule({ imports: [OfferCard, TranslateModule.forRoot()] });
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation("en", {
        OFFERS: {
          CARD: {
            STOP_LABEL: "Stop offer {{name}}",
            RESUME_LABEL: "Resume offer {{name}}",
            EDIT_LABEL: "Edit offer {{name}}",
            DELETE_LABEL: "Delete offer {{name}}",
          },
        },
      });
      translate.use("en");
      TestBed.inject(LanguageService).setLang("en");
      fixture = TestBed.createComponent(OfferCard);
      fixture.componentRef.setInput("offer", offer);
      for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it("names every action after the offer, so a grid of cards is not a grid of identical buttons", async () => {
      await setupNamed(OFFER, { canEdit: true, canToggle: true, canDelete: true });
      const labels = Array.from(el().querySelectorAll(".offer__footer button")).map((b) =>
        b.getAttribute("aria-label"),
      );
      expect(labels).toEqual([
        "Stop offer Weekend Offer",
        "Edit offer Weekend Offer",
        "Delete offer Weekend Offer",
      ]);
    });

    it("the accessible name of Stop / Resume still contains its visible text (label in name)", async () => {
      await setupNamed(OFFER, { canToggle: true });
      expect(el().querySelector(".offer__footer button")!.getAttribute("aria-label")).toMatch(
        /^Stop offer/,
      );

      fixture.destroy();
      TestBed.resetTestingModule();
      await setupNamed({ ...OFFER, status: OfferStatus.Stopped }, { canToggle: true });
      expect(el().querySelector(".offer__footer button")!.getAttribute("aria-label")).toMatch(
        /^Resume offer/,
      );
    });

    it("is a labelled article with the name as its heading, and hides decorative icons", async () => {
      await setup();
      const article = el().querySelector("article")!;
      expect(article.getAttribute("aria-labelledby")).toBe(el().querySelector("h3")!.id);
      expect(
        Array.from(el().querySelectorAll("i.pi")).every(
          (i) => i.getAttribute("aria-hidden") === "true" || i.closest('[aria-hidden="true"]'),
        ),
      ).toBe(true);
    });

    it("the status is text, not only colour", async () => {
      await setup({ ...OFFER, status: OfferStatus.Stopped });
      expect(el().querySelector("app-status-badge")!.textContent).toContain(
        "OFFERS.STATUS.STOPPED",
      );
    });
  });

  describe("controls", () => {
    it("is read-only without permissions: no footer at all", async () => {
      await setup();
      expect(el().querySelector(".offer__footer")).toBeNull();
    });

    it('canToggle shows "Stop offer" and emits the offer', async () => {
      await setup(OFFER, { canToggle: true });
      let emitted: OfferListItem | null = null;
      fixture.componentInstance.toggleStatus.subscribe((o) => (emitted = o));

      expect(toggleButton()!.textContent).toContain("OFFERS.STOP");
      toggleButton()!.click();
      expect(emitted).toEqual(OFFER);
    });

    it('a stopped offer shows "Resume" instead', async () => {
      await setup(
        { ...OFFER, status: OfferStatus.Stopped, stoppedAt: "2026-10-20T10:00:00Z" },
        { canToggle: true },
      );
      expect(toggleButton()!.textContent).toContain("OFFERS.RESUME");
      expect(text()).toContain("OFFERS.STATUS.STOPPED");
    });

    it("a scheduled offer can be stopped, an ended one cannot", async () => {
      await setup({ ...OFFER, status: OfferStatus.Scheduled }, { canToggle: true });
      expect(toggleButton()).toBeDefined();

      fixture.destroy();
      TestBed.resetTestingModule();
      await setup({ ...OFFER, status: OfferStatus.Ended }, { canToggle: true });
      expect(toggleButton()).toBeUndefined();
    });

    it("disables Stop / Resume while a mutation runs", async () => {
      await setup(OFFER, { canToggle: true, busy: true });
      expect(toggleButton()!.disabled).toBe(true);
    });

    it("edit and delete show only with their flags and emit the offer", async () => {
      await setup(OFFER, { canEdit: true, canDelete: true });
      const edited: OfferListItem[] = [];
      const deleted: OfferListItem[] = [];
      fixture.componentInstance.edit.subscribe((o) => edited.push(o));
      fixture.componentInstance.delete.subscribe((o) => deleted.push(o));

      button("OFFERS.CARD.EDIT_LABEL")!.click();
      el().querySelector<HTMLButtonElement>(".offer__link")!.click();
      button("OFFERS.CARD.DELETE_LABEL")!.click();

      expect(edited).toHaveLength(2);
      expect(deleted).toEqual([OFFER]);
    });

    it("the name is plain text without the edit flag", async () => {
      await setup();
      expect(el().querySelector(".offer__link")).toBeNull();
      expect(button("OFFERS.CARD.EDIT_LABEL")).toBeNull();
      expect(button("OFFERS.CARD.DELETE_LABEL")).toBeNull();
    });
  });
});
