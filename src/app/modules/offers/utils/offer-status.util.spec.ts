import { describe, expect, it } from "vitest";
import { OfferStatus } from "../model/offer.model";
import { deriveOfferStatus, statusesForTab } from "./offer-status.util";

const TODAY = "2026-11-07";
const offer = (over: Partial<Parameters<typeof deriveOfferStatus>[0]> = {}) => ({
  startDate: "2026-11-01",
  endDate: "2026-11-30",
  maxBookings: 50,
  bookingsCount: 0,
  stoppedAt: null,
  ...over,
});

describe("deriveOfferStatus", () => {
  it("is Active inside the date range", () => {
    expect(deriveOfferStatus(offer(), TODAY)).toBe(OfferStatus.Active);
  });

  it("is Active on its first and last day, and with no end date", () => {
    expect(deriveOfferStatus(offer({ startDate: TODAY }), TODAY)).toBe(OfferStatus.Active);
    expect(deriveOfferStatus(offer({ endDate: TODAY }), TODAY)).toBe(OfferStatus.Active);
    expect(deriveOfferStatus(offer({ endDate: null }), TODAY)).toBe(OfferStatus.Active);
  });

  it("is Scheduled before it starts", () => {
    expect(deriveOfferStatus(offer({ startDate: "2026-11-08" }), TODAY)).toBe(
      OfferStatus.Scheduled,
    );
  });

  it("is Ended the day after its end date", () => {
    expect(deriveOfferStatus(offer({ endDate: "2026-11-06" }), TODAY)).toBe(OfferStatus.Ended);
  });

  it("is LimitReached when full (never happens while bookingsCount is 0, but the rule is there)", () => {
    expect(deriveOfferStatus(offer({ maxBookings: 5, bookingsCount: 5 }), TODAY)).toBe(
      OfferStatus.LimitReached,
    );
    expect(deriveOfferStatus(offer({ maxBookings: null, bookingsCount: 500 }), TODAY)).toBe(
      OfferStatus.Active,
    );
  });

  it("is Stopped whenever stoppedAt is set — even if it also ended or has not started", () => {
    const stoppedAt = "2026-11-05T10:00:00Z";
    expect(deriveOfferStatus(offer({ stoppedAt }), TODAY)).toBe(OfferStatus.Stopped);
    expect(deriveOfferStatus(offer({ stoppedAt, endDate: "2026-11-01" }), TODAY)).toBe(
      OfferStatus.Stopped,
    );
    expect(deriveOfferStatus(offer({ stoppedAt, startDate: "2026-12-01" }), TODAY)).toBe(
      OfferStatus.Stopped,
    );
  });
});

describe("statusesForTab", () => {
  it("maps each tab to its statuses (All = no filter)", () => {
    expect(statusesForTab("all")).toBeUndefined();
    expect(statusesForTab("active")).toEqual([OfferStatus.Active]);
    expect(statusesForTab("scheduled")).toEqual([OfferStatus.Scheduled]);
    expect(statusesForTab("endedOrFull")).toEqual([
      OfferStatus.Ended,
      OfferStatus.LimitReached,
      OfferStatus.Stopped,
    ]);
  });
});
