import { TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Observable, firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockDb } from "@core/mock/mock-db";
import { NotificationService } from "@core/services/notification.service";
import {
  CreateOfferPayload,
  OFFER_IMAGE_MAX_BYTES,
  OfferStatus,
  UpdateOfferPayload,
} from "../model/offer.model";
import { addDays } from "../utils/offer-dates.util";
import { OfferMockRepository } from "./offer-mock.repository";

const BRANCH = 1;
const TODAY = "2026-11-07"; // pinned (Cairo date)

describe("OfferMockRepository", () => {
  let repo: OfferMockRepository;
  let db: MockDb;
  let warning: ReturnType<typeof vi.spyOn>;

  /** Resolves a mock response past its simulated latency. */
  async function settle<T>(obs: Observable<T>): Promise<T> {
    const result = firstValueFrom(obs);
    result.catch(() => undefined); // avoid an unhandled rejection while timers advance
    await vi.advanceTimersByTimeAsync(1000);
    return result;
  }

  /** The error a rejected mock call fails with. */
  async function failure(obs: Observable<unknown>): Promise<{ status: number }> {
    try {
      await settle(obs);
    } catch (e) {
      return e as { status: number };
    }
    throw new Error("expected the call to fail");
  }

  const row = (serviceId: number, branchId = BRANCH) =>
    db.services.find((s) => s.id === serviceId)!.prices.find((p) => p.branchId === branchId)!;
  const total = (ids: number[], pick: "regularPrice" | "vipPrice") =>
    ids.reduce((sum, id) => sum + row(id)[pick], 0);

  /** Haircut + Beard trim + Hair wash — all priced and active in branch 1. */
  const IDS = [1, 2, 3];
  const valid = (over: Partial<CreateOfferPayload> = {}): CreateOfferPayload => ({
    branchId: BRANCH,
    nameAr: "عرض جديد",
    nameEn: "Brand New",
    serviceIds: IDS,
    regularPrice: total(IDS, "regularPrice") - 10,
    vipPrice: total(IDS, "vipPrice") - 10,
    homePrice: null,
    startDate: TODAY,
    endDate: null,
    maxBookings: null,
    ...over,
  });
  const validUpdate = (over: Partial<UpdateOfferPayload> = {}): UpdateOfferPayload => {
    const { branchId: _branchId, ...rest } = valid();
    return { ...rest, removeImage: false, ...over };
  };
  const image = (type = "image/png", size = 10) => {
    const f = new File(["x"], "banner.png", { type });
    Object.defineProperty(f, "size", { value: size });
    return f;
  };

  /** Branch 1's seeded offer with this English name. */
  const seeded = (nameEn: string) =>
    db.offers.find((o) => o.branchId === BRANCH && o.nameEn === nameEn)!;
  const statusOf = async (id: number) => (await settle(repo.getOfferById(id))).data!.status;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`));
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation("en", {
      OFFERS: { ERRORS: { NOT_FOUND: "not found", BRANCH_NOT_FOUND: "no branch" } },
    });
    translate.use("en");
    repo = TestBed.inject(OfferMockRepository);
    db = TestBed.inject(MockDb);
    warning = vi.spyOn(TestBed.inject(NotificationService), "warning");
  });

  afterEach(() => vi.useRealTimers());

  describe("seed", () => {
    it("shows every status that can exist today: Active, Scheduled, Ended and Stopped", async () => {
      const res = await settle(repo.getOffers({ branchId: BRANCH, pageNumber: 1, pageSize: 100 }));
      const statuses = new Set(res.data!.map((o) => o.status));
      expect(statuses).toEqual(
        new Set([
          OfferStatus.Active,
          OfferStatus.Scheduled,
          OfferStatus.Ended,
          OfferStatus.Stopped,
        ]),
      );
    });

    it("only holds offers the backend would accept", () => {
      expect(db.offers.length).toBeGreaterThan(0);
      for (const o of db.offers) {
        const rows = o.serviceIds.map((id) => row(id, o.branchId));
        expect(o.serviceIds.length).toBeGreaterThanOrEqual(1);
        expect(rows.every((r) => r?.isActive)).toBe(true);
        expect(o.regularPrice).toBeLessThan(rows.reduce((s, r) => s + r.regularPrice, 0));
        expect(o.vipPrice).toBeLessThan(rows.reduce((s, r) => s + r.vipPrice, 0));
        if (o.homePrice !== null) expect(rows.every((r) => r.isHomeAvailable)).toBe(true);
        if (o.endDate !== null) expect(o.endDate >= o.startDate).toBe(true);
      }
      expect(new Set(db.offers.map((o) => o.id)).size).toBe(db.offers.length);
      expect(db.nextOfferId).toBe(Math.max(...db.offers.map((o) => o.id)) + 1);
    });

    it("has banners on some offers and none on others", () => {
      const own = db.offers.filter((o) => o.branchId === BRANCH);
      expect(own.some((o) => o.imageUrl)).toBe(true);
      expect(own.some((o) => o.imageUrl === null)).toBe(true);
    });
  });

  describe("getOffers", () => {
    const q = { branchId: BRANCH, pageNumber: 1, pageSize: 100 };

    it("lists one branch only, newest start date first, with derived values", async () => {
      const res = await settle(repo.getOffers(q));
      const own = db.offers.filter((o) => o.branchId === BRANCH);

      expect(res.data).toHaveLength(own.length);
      const starts = res.data!.map((o) => o.startDate);
      expect(starts).toEqual([...starts].sort().reverse());

      const weekend = res.data!.find((o) => o.nameEn === "Weekend Offer")!;
      expect(weekend.services.map((s) => s.serviceId)).toEqual([1, 2, 3]);
      expect(weekend.originalRegularPrice).toBe(total(IDS, "regularPrice"));
      expect(weekend.savingPercent).toBe(
        Math.round(
          ((weekend.originalRegularPrice - weekend.regularPrice) / weekend.originalRegularPrice) *
            100,
        ),
      );
      expect(weekend.bookingsCount).toBe(0);
      expect(weekend.status).toBe(OfferStatus.Active);
      expect(weekend.maxBookings).toBe(50);
    });

    it('keeps null for "No end" and "No limit"', async () => {
      const glow = (await settle(repo.getOffers(q))).data!.find((o) => o.nameEn === "Summer Glow")!;
      expect(glow.endDate).toBeNull();
      expect(glow.maxBookings).toBeNull();
    });

    it("filters by one or several statuses (Ended or full = 2, 3, 4)", async () => {
      const active = (await settle(repo.getOffers({ ...q, statuses: [OfferStatus.Active] }))).data!;
      expect(active.length).toBeGreaterThan(0);
      expect(active.every((o) => o.status === OfferStatus.Active)).toBe(true);

      const endedOrFull = (
        await settle(
          repo.getOffers({
            ...q,
            statuses: [OfferStatus.Ended, OfferStatus.LimitReached, OfferStatus.Stopped],
          }),
        )
      ).data!;
      expect(endedOrFull.map((o) => o.status).sort()).toEqual([
        OfferStatus.Ended,
        OfferStatus.Stopped,
      ]);
    });

    it("searches the Arabic or English name", async () => {
      expect(
        (await settle(repo.getOffers({ ...q, search: "weekend" }))).data!.map((o) => o.nameEn),
      ).toEqual(["Weekend Offer"]);
      expect(
        (await settle(repo.getOffers({ ...q, search: "رمضان" }))).data!.map((o) => o.nameEn),
      ).toEqual(["Ramadan Special"]);
    });

    it("counts the whole branch per tab, ignoring search and statuses", async () => {
      const res = await settle(
        repo.getOffers({ ...q, search: "zzz", statuses: [OfferStatus.Scheduled] }),
      );
      const counts = res.meta!.additionalData as Record<string, number>;
      const own = db.offers.filter((o) => o.branchId === BRANCH);

      expect(res.data).toEqual([]);
      expect(counts["all"]).toBe(own.length);
      expect(counts["active"] + counts["scheduled"] + counts["endedOrFull"]).toBe(own.length);
      expect(counts["endedOrFull"]).toBe(2); // Ended + Stopped
    });

    it("pages the results", async () => {
      const res = await settle(repo.getOffers({ branchId: BRANCH, pageNumber: 2, pageSize: 2 }));
      expect(res.data).toHaveLength(2);
      expect(res.meta).toMatchObject({ currentPage: 2, hasPreviousPage: true });
    });

    it("404s for an unknown branch", async () => {
      expect(
        (await failure(repo.getOffers({ branchId: 999, pageNumber: 1, pageSize: 20 }))).status,
      ).toBe(404);
    });
  });

  describe("getOfferById", () => {
    it("adds the branch name, duration and timestamps", async () => {
      const offer = seeded("Weekend Offer");
      const res = await settle(repo.getOfferById(offer.id));

      expect(res.data).toMatchObject({
        id: offer.id,
        branchId: BRANCH,
        updatedAt: null,
        branchNameEn: db.branches.find((b) => b.id === BRANCH)!.nameEn,
        durationMinutes: IDS.reduce((sum, id) => sum + row(id).durationMinutes, 0),
      });
    });

    it("answers a status:false 404 body for an unknown id", async () => {
      expect(await settle(repo.getOfferById(9999))).toMatchObject({
        status: false,
        statusCode: 404,
      });
    });
  });

  describe("createOffer", () => {
    it("creates an offer (201) that starts Active when it starts today", async () => {
      const res = await settle(repo.createOffer(valid()));
      expect(res).toMatchObject({ status: true, statusCode: 201 });
      expect(await statusOf(res.data!)).toBe(OfferStatus.Active);
    });

    it("is Scheduled when it starts later", async () => {
      const res = await settle(repo.createOffer(valid({ startDate: addDays(TODAY, 3) })));
      expect(await statusOf(res.data!)).toBe(OfferStatus.Scheduled);
    });

    it("allows names that already exist (e.g. a yearly offer)", async () => {
      expect(
        (
          await settle(
            repo.createOffer(valid({ nameEn: "Weekend Offer", nameAr: "عرض نهاية الأسبوع" })),
          )
        ).status,
      ).toBe(true);
    });

    it("needs at least 1 service, and allows exactly 1", async () => {
      await failure(repo.createOffer(valid({ serviceIds: [] })));
      expect(warning).toHaveBeenLastCalledWith(
        "VALIDATION_FIELDS.ServiceIds",
        "OFFERS.ERRORS.SERVICES_MIN",
      );

      const one = valid({
        serviceIds: [1],
        regularPrice: row(1).regularPrice - 1,
        vipPrice: row(1).vipPrice - 1,
      });
      expect((await settle(repo.createOffer(one))).status).toBe(true);
    });

    it("refuses duplicate services (it does not silently merge them)", async () => {
      await failure(repo.createOffer(valid({ serviceIds: [1, 1, 2] })));
      expect(warning).toHaveBeenLastCalledWith(
        "VALIDATION_FIELDS.ServiceIds",
        "OFFERS.ERRORS.SERVICES_DUPLICATE",
      );
    });

    it("rejects a service that is inactive in the branch", async () => {
      row(3).isActive = false;
      await failure(repo.createOffer(valid()));
      expect(warning).toHaveBeenLastCalledWith(
        "VALIDATION_FIELDS.ServiceIds",
        "OFFERS.ERRORS.SERVICE_INACTIVE",
      );
    });

    it("requires names and caps them at 100 characters", async () => {
      await failure(repo.createOffer(valid({ nameAr: "  " })));
      expect(warning).toHaveBeenLastCalledWith(
        "VALIDATION_FIELDS.NameAr",
        "OFFERS.ERRORS.NAME_REQUIRED",
      );
      await failure(repo.createOffer(valid({ nameEn: "x".repeat(101) })));
      expect(warning).toHaveBeenLastCalledWith(
        "VALIDATION_FIELDS.NameEn",
        "OFFERS.ERRORS.NAME_TOO_LONG",
      );
    });

    it("requires every price to be LOWER than the services total (error key = the price field)", async () => {
      await failure(repo.createOffer(valid({ regularPrice: total(IDS, "regularPrice") })));
      expect(warning).toHaveBeenLastCalledWith(
        "VALIDATION_FIELDS.RegularPrice",
        "OFFERS.ERRORS.PRICE_TOO_HIGH",
      );
      await failure(repo.createOffer(valid({ vipPrice: total(IDS, "vipPrice") + 1 })));
      expect(warning).toHaveBeenLastCalledWith(
        "VALIDATION_FIELDS.VipPrice",
        "OFFERS.ERRORS.PRICE_TOO_HIGH",
      );
    });

    it("rejects prices that are not > 0, above 100,000 or have more than 2 decimals", async () => {
      for (const regularPrice of [0, -5, 100_001, 10.123]) {
        await failure(repo.createOffer(valid({ regularPrice })));
        expect(warning).toHaveBeenLastCalledWith(
          "VALIDATION_FIELDS.RegularPrice",
          "OFFERS.ERRORS.PRICE_INVALID",
        );
      }
    });

    it("allows a home price only when every service allows home visits", async () => {
      await failure(repo.createOffer(valid({ homePrice: 100 }))); // beard trim has no home visit
      expect(warning).toHaveBeenLastCalledWith(
        "VALIDATION_FIELDS.HomePrice",
        "OFFERS.ERRORS.HOME_UNAVAILABLE",
      );

      for (const id of IDS) Object.assign(row(id), { isHomeAvailable: true, homePrice: 100 });
      expect((await settle(repo.createOffer(valid({ homePrice: 250 })))).status).toBe(true);
      await failure(repo.createOffer(valid({ homePrice: 300 }))); // equal to the 300 total
      expect(warning).toHaveBeenLastCalledWith(
        "VALIDATION_FIELDS.HomePrice",
        "OFFERS.ERRORS.PRICE_TOO_HIGH",
      );
    });

    it("requires a real start date, today or later (Cairo date)", async () => {
      await failure(repo.createOffer(valid({ startDate: "" })));
      expect(warning).toHaveBeenLastCalledWith(
        "VALIDATION_FIELDS.StartDate",
        "OFFERS.ERRORS.START_REQUIRED",
      );
      await failure(repo.createOffer(valid({ startDate: "2026-02-30" })));
      expect(warning).toHaveBeenLastCalledWith(
        "VALIDATION_FIELDS.StartDate",
        "OFFERS.ERRORS.START_INVALID",
      );
      await failure(repo.createOffer(valid({ startDate: addDays(TODAY, -1) })));
      expect(warning).toHaveBeenLastCalledWith(
        "VALIDATION_FIELDS.StartDate",
        "OFFERS.ERRORS.START_PAST",
      );
    });

    it('uses the Cairo date for "today": at 22:30 UTC it is already tomorrow in Cairo', async () => {
      vi.setSystemTime(new Date(`${TODAY}T22:30:00Z`));
      await failure(repo.createOffer(valid({ startDate: TODAY }))); // yesterday in Cairo by now
      expect(warning).toHaveBeenLastCalledWith(
        "VALIDATION_FIELDS.StartDate",
        "OFFERS.ERRORS.START_PAST",
      );
      expect((await settle(repo.createOffer(valid({ startDate: addDays(TODAY, 1) })))).status).toBe(
        true,
      );
    });

    it("end date: optional, on or after the start (the same day is fine)", async () => {
      await failure(repo.createOffer(valid({ endDate: addDays(TODAY, -1) })));
      expect(warning).toHaveBeenLastCalledWith(
        "VALIDATION_FIELDS.EndDate",
        "OFFERS.ERRORS.END_BEFORE_START",
      );
      await failure(repo.createOffer(valid({ endDate: "soon" })));
      expect(warning).toHaveBeenLastCalledWith(
        "VALIDATION_FIELDS.EndDate",
        "OFFERS.ERRORS.END_INVALID",
      );
      expect((await settle(repo.createOffer(valid({ endDate: TODAY })))).status).toBe(true);
    });

    it("max bookings: optional, a whole number from 1 to 100,000", async () => {
      for (const maxBookings of [0, -1, 1.5, 100_001]) {
        await failure(repo.createOffer(valid({ maxBookings })));
        expect(warning).toHaveBeenLastCalledWith(
          "VALIDATION_FIELDS.MaxBookings",
          "OFFERS.ERRORS.MAX_BOOKINGS_INVALID",
        );
      }
      for (const maxBookings of [1, 100_000, null]) {
        expect(
          (await settle(repo.createOffer(valid({ maxBookings, nameEn: `Cap ${maxBookings}` }))))
            .status,
        ).toBe(true);
      }
    });

    it("banner: JPG / PNG / WebP up to 5 MB, stored as a URL", async () => {
      await failure(repo.createOffer(valid({ image: image("image/gif") })));
      expect(warning).toHaveBeenLastCalledWith(
        "VALIDATION_FIELDS.Image",
        "OFFERS.ERRORS.INVALID_IMAGE",
      );
      await failure(
        repo.createOffer(valid({ image: image("image/png", OFFER_IMAGE_MAX_BYTES + 1) })),
      );

      const id = (await settle(repo.createOffer(valid({ image: image() })))).data!;
      expect((await settle(repo.getOfferById(id))).data!.imageUrl).toBeTruthy();
    });

    it("rejects an unknown branch", async () => {
      await failure(repo.createOffer(valid({ branchId: 999 })));
      expect(warning).toHaveBeenCalledWith(
        "VALIDATION_FIELDS.BranchId",
        "OFFERS.ERRORS.BRANCH_NOT_FOUND",
      );
    });
  });

  describe("updateOffer", () => {
    it("updates the offer, keeps its branch, and lets a running offer keep a start date in the past", async () => {
      const target = seeded("Weekend Offer"); // started 5 days ago
      const res = await settle(
        repo.updateOffer(
          target.id,
          validUpdate({ nameEn: "Weekend Plus", startDate: target.startDate }),
        ),
      );

      expect(res.statusCode).toBe(200);
      expect(target).toMatchObject({
        branchId: BRANCH,
        nameEn: "Weekend Plus",
        startDate: addDays(TODAY, -5),
      });
      expect(target.updatedAt).not.toBeNull();
    });

    it("still checks the dates, prices and services", async () => {
      const target = seeded("Weekend Offer");
      await failure(
        repo.updateOffer(target.id, validUpdate({ startDate: TODAY, endDate: addDays(TODAY, -2) })),
      );
      expect(warning).toHaveBeenLastCalledWith(
        "VALIDATION_FIELDS.EndDate",
        "OFFERS.ERRORS.END_BEFORE_START",
      );
      await failure(repo.updateOffer(target.id, validUpdate({ regularPrice: 99_999 })));
      expect(warning).toHaveBeenLastCalledWith(
        "VALIDATION_FIELDS.RegularPrice",
        "OFFERS.ERRORS.PRICE_TOO_HIGH",
      );
    });

    it("banner: a new image replaces it, removeImage clears it, neither keeps it", async () => {
      const target = seeded("Weekend Offer");
      const original = target.imageUrl;
      expect(original).toBeTruthy();

      await settle(repo.updateOffer(target.id, validUpdate()));
      expect(target.imageUrl).toBe(original);

      await settle(repo.updateOffer(target.id, validUpdate({ image: image() })));
      expect(target.imageUrl).not.toBe(original);
      expect(target.imageUrl).toBeTruthy();

      await settle(repo.updateOffer(target.id, validUpdate({ removeImage: true })));
      expect(target.imageUrl).toBeNull();
    });

    it("does not stop or resume the offer", async () => {
      const stopped = seeded("Flash Sale");
      await settle(repo.updateOffer(stopped.id, validUpdate()));
      expect(stopped.stoppedAt).not.toBeNull();
    });

    it("404s for an unknown id", async () => {
      expect((await failure(repo.updateOffer(9999, validUpdate()))).status).toBe(404);
    });
  });

  describe("toggleOfferStatus", () => {
    it("stops a running offer at once (Stopped, stoppedAt set) and resumes it", async () => {
      const target = seeded("Weekend Offer");
      expect(await statusOf(target.id)).toBe(OfferStatus.Active);

      await settle(repo.toggleOfferStatus(target.id));
      expect(target.stoppedAt).not.toBeNull();
      expect(await statusOf(target.id)).toBe(OfferStatus.Stopped);

      await settle(repo.toggleOfferStatus(target.id));
      expect(target.stoppedAt).toBeNull();
      expect(await statusOf(target.id)).toBe(OfferStatus.Active);
    });

    it("resuming brings back the calculated status (Scheduled / Ended by the dates)", async () => {
      const scheduled = seeded("Ramadan Special");
      await settle(repo.toggleOfferStatus(scheduled.id));
      await settle(repo.toggleOfferStatus(scheduled.id));
      expect(await statusOf(scheduled.id)).toBe(OfferStatus.Scheduled);
    });

    it("refuses to resume when a service is no longer active in the branch", async () => {
      const target = seeded("Flash Sale"); // stopped
      row(target.serviceIds[0]).isActive = false;

      expect((await failure(repo.toggleOfferStatus(target.id))).status).toBe(400);
      expect(warning).toHaveBeenCalledWith(
        "VALIDATION_FIELDS.ServiceIds",
        "OFFERS.ERRORS.SERVICE_INACTIVE",
      );
      expect(target.stoppedAt).not.toBeNull();
    });

    it("refuses to resume an offer with a home price when a service lost home visits", async () => {
      const target = seeded("Flash Sale");
      target.homePrice = 100;
      row(target.serviceIds[0]).isHomeAvailable = false;

      await failure(repo.toggleOfferStatus(target.id));
      expect(warning).toHaveBeenCalledWith(
        "VALIDATION_FIELDS.HomePrice",
        "OFFERS.ERRORS.HOME_UNAVAILABLE",
      );
    });

    it("always lets a running offer be stopped, even if a service went inactive", async () => {
      const target = seeded("Weekend Offer");
      row(target.serviceIds[0]).isActive = false;
      await settle(repo.toggleOfferStatus(target.id));
      expect(target.stoppedAt).not.toBeNull();
    });

    it("404s for an unknown id", async () => {
      expect((await failure(repo.toggleOfferStatus(9999))).status).toBe(404);
    });
  });

  describe("deleteOffers", () => {
    it("deletes several at once", async () => {
      const ids = db.offers
        .filter((o) => o.branchId === BRANCH)
        .slice(0, 2)
        .map((o) => o.id);
      await settle(repo.deleteOffers({ ids }));
      expect(db.offers.some((o) => ids.includes(o.id))).toBe(false);
    });

    it("is all-or-nothing: one unknown id deletes nothing", async () => {
      const before = db.offers.length;
      expect((await failure(repo.deleteOffers({ ids: [db.offers[0].id, 9999] }))).status).toBe(404);
      expect(db.offers).toHaveLength(before);
    });

    it("rejects an empty list", async () => {
      expect((await failure(repo.deleteOffers({ ids: [] }))).status).toBe(400);
    });
  });
});
