import { describe, expect, it } from "vitest";
import { OfferStatus } from "../model/offer.model";
import {
  canToggleOffer,
  isOfferStopped,
  offerBookingsText,
  offerStatusKey,
  offerStatusVariant,
} from "./offer-labels.util";

describe("offer labels", () => {
  it("has a distinct i18n key for every status", () => {
    const keys = [0, 1, 2, 3, 4].map((s) => offerStatusKey(s as OfferStatus));
    expect(new Set(keys).size).toBe(5);
    expect(keys[0]).toBe("OFFERS.STATUS.ACTIVE");
    expect(keys[4]).toBe("OFFERS.STATUS.STOPPED");
  });

  it("colours the badges and falls back safely for an unknown status", () => {
    expect(offerStatusVariant(OfferStatus.Active)).toBe("success");
    expect(offerStatusVariant(OfferStatus.Scheduled)).toBe("info");
    expect(offerStatusVariant(OfferStatus.Stopped)).toBe("danger");
    expect(offerStatusVariant(99 as OfferStatus)).toBe("neutral");
    expect(offerStatusKey(99 as OfferStatus)).toBe("OFFERS.STATUS.ENDED");
  });

  it("shows Stop / Resume on every status except Ended", () => {
    expect(canToggleOffer({ status: OfferStatus.Active })).toBe(true);
    expect(canToggleOffer({ status: OfferStatus.Scheduled })).toBe(true);
    expect(canToggleOffer({ status: OfferStatus.LimitReached })).toBe(true);
    expect(canToggleOffer({ status: OfferStatus.Stopped })).toBe(true);
    expect(canToggleOffer({ status: OfferStatus.Ended })).toBe(false);
  });

  it("only a Stopped offer counts as stopped (so the button reads Resume)", () => {
    expect(isOfferStopped({ status: OfferStatus.Stopped })).toBe(true);
    expect(isOfferStopped({ status: OfferStatus.Active })).toBe(false);
  });

  it("writes the bookings line with and without a limit", () => {
    expect(offerBookingsText({ bookingsCount: 0, maxBookings: 50 }, "No limit")).toBe("0 / 50");
    expect(offerBookingsText({ bookingsCount: 3, maxBookings: null }, "No limit")).toBe(
      "3 · No limit",
    );
  });
});
