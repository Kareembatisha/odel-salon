import { FormBuilder, FormGroup } from "@angular/forms";
import { TestBed } from "@angular/core/testing";
import { Subject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationService } from "@core/services/notification.service";
import { ApiResponse } from "@shared/model/api_response.model";
import { BranchDayOfWeek } from "./model/branch.model";
import { BRANCH_REPOSITORY } from "./repository/branch.repository";
import { BranchesService } from "./service/branches.service";
import { createBranchForm } from "./utils/branch-form.factory";
import { BranchFormValue, buildBranchPayload } from "./utils/branch-form.mapper";
import { workingHourValidator } from "./utils/branch-form.validators";

/**
 * Branches — QA suite (black-box boundaries + confirmed defects).
 *
 * Tests wrapped in `it.fails` document a CONFIRMED DEFECT: they assert the correct behaviour and
 * currently fail, which `it.fails` reports as a pass. When the defect is fixed the test flips to
 * red — remove the `.fails` then. Defect ids (BR-xx) match the QA report.
 */

const form = () => createBranchForm(new FormBuilder());
const hours = (isOpen: boolean, openTime: string | null, closeTime: string | null) =>
  workingHourValidator()({ value: { isOpen, openTime, closeTime } } as never);

describe("Branches QA — field boundaries", () => {
  const set = (path: string, value: string) => {
    const f = form();
    f.get(path)!.setValue(value);
    return f.get(path)!;
  };

  it.each([
    ["basicInfo.nameAr", 100, 101],
    ["basicInfo.nameEn", 100, 101],
    ["basicInfo.address", 250, 251],
  ])("%s accepts %i characters and rejects %i", (path, max, over) => {
    expect(set(path, "a".repeat(max)).valid).toBe(true);
    expect(set(path, "a".repeat(over)).errors).toHaveProperty("maxlength");
  });

  it.each([
    ["+201001102194", true],
    ["+201101102194", true],
    ["+201201102194", true],
    ["+201501102194", true],
    ["+201301102194", false], // 013 is not an Egyptian mobile prefix
    ["01001102194", false], // local format, no +20
    ["201001102194", false], // missing +
    ["+20100110219", false], // one digit short
    ["+2010011021945", false], // one digit long
    [" +201001102194", false], // leading space
    ["+201001102194 ", false], // trailing space
    ["+20100110219a", false],
  ])("phone %j → valid=%s", (phone, valid) => {
    expect(set("basicInfo.phone", phone).valid).toBe(valid);
  });

  it.each([
    ["", true],
    ["https://maps.google.com/?q=30.04,31.23", true],
    ["http://", false],
    ["https://", false],
    ["//maps.google.com", false],
    ["mailto:a@b.com", false],
    ["data:text/html,<b>x</b>", false],
  ])("mapUrl %j → valid=%s", (url, valid) => {
    expect(set("basicInfo.mapUrl", url).valid).toBe(valid);
  });

  it("a new form is invalid and every required field reports `required`", () => {
    const f = form();
    expect(f.invalid).toBe(true);
    for (const p of ["nameAr", "nameEn", "address", "phone"]) {
      expect(f.get(`basicInfo.${p}`)!.errors).toHaveProperty("required");
    }
    expect(f.get("bookingTypes")!.errors).toEqual({ atLeastOneRequired: true });
  });
});

describe("Branches QA — working hours", () => {
  it.each([
    ["09:00", "17:00", null],
    ["09:00", "10:00", null], // exactly 60 min is the minimum
    ["09:00", "09:59", { minimumDuration: true }],
    ["09:00", "09:30", { minimumDuration: true }],
    ["22:00", "06:00", null], // overnight, closes at the latest allowed time (06:00)
    ["22:00", "06:01", { invalidOvernightClose: true }],
    ["23:00", "00:30", null], // 90 min overnight
    ["23:30", "00:00", { minimumDuration: true }], // 30 min overnight
    ["10:00", "10:00", { invalidOvernightClose: true }],
    ["09:00:00", "17:00:00", null], // API format with seconds
    ["9:00", "17:00", { invalidTime: true }],
    ["24:00", "17:00", { invalidTime: true }],
    ["09:60", "17:00", { invalidTime: true }],
  ])("open %s → close %s ⇒ %j", (open, close, expected) => {
    expect(hours(true, open, close)).toEqual(expected);
  });

  it("an open day needs both times", () => {
    expect(hours(true, null, "17:00")).toEqual({ requiredTimes: true });
    expect(hours(true, "09:00", null)).toEqual({ requiredTimes: true });
    expect(hours(true, "", "")).toEqual({ requiredTimes: true });
  });

  it("a closed day must have no times", () => {
    expect(hours(false, null, null)).toBeNull();
    expect(hours(false, "09:00", null)).toEqual({ closedDayHasTimes: true });
    expect(hours(false, null, "17:00")).toEqual({ closedDayHasTimes: true });
  });

  // BR-03 — needs a product decision: is "same time" a 24 h day or a mistake? It is already
  // rejected for 10:00–10:00 but accepted for 00:00–06:00-range times, so the rule is inconsistent.
  it.fails(
    "BR-03: open and close at the same time is rejected for every hour (05:00–05:00)",
    () => {
      expect(hours(true, "05:00", "05:00")).not.toBeNull();
    },
  );
  it.fails("BR-03: 00:00–00:00 is rejected (or explicitly modelled as 24 h)", () => {
    expect(hours(true, "00:00", "00:00")).not.toBeNull();
  });
});

describe("Branches QA — form → payload", () => {
  const filled = (): FormGroup => {
    const f = form();
    f.patchValue({
      basicInfo: {
        nameAr: " فرع ",
        nameEn: " Branch ",
        address: " Somewhere ",
        phone: "+201001102194",
        mapUrl: "  ",
      },
      bookingTypes: { allowsRegular: true },
    });
    return f;
  };

  it("trims text and turns a blank map link into null", () => {
    const p = buildBranchPayload(filled().getRawValue() as BranchFormValue);
    expect(p).toMatchObject({
      nameAr: "فرع",
      nameEn: "Branch",
      address: "Somewhere",
      mapUrl: null,
    });
  });

  it("sends all seven days, Saturday first, closed days with null times", () => {
    const p = buildBranchPayload(filled().getRawValue() as BranchFormValue);
    expect(p.workingHours.map((h) => h.dayOfWeek)).toEqual([
      BranchDayOfWeek.Saturday,
      BranchDayOfWeek.Sunday,
      BranchDayOfWeek.Monday,
      BranchDayOfWeek.Tuesday,
      BranchDayOfWeek.Wednesday,
      BranchDayOfWeek.Thursday,
      BranchDayOfWeek.Friday,
    ]);
    expect(
      p.workingHours.every((h) => !h.isOpen && h.openTime === null && h.closeTime === null),
    ).toBe(true);
  });

  it("never leaks stale times of a day that was closed again", () => {
    const f = filled();
    f.get("workingHours.0")!.patchValue({ isOpen: false, openTime: "09:00", closeTime: "17:00" });
    const p = buildBranchPayload(f.getRawValue() as BranchFormValue);
    expect(p.workingHours[0]).toEqual({
      dayOfWeek: BranchDayOfWeek.Saturday,
      isOpen: false,
      openTime: null,
      closeTime: null,
    });
  });

  it("formats open times as HH:mm:ss", () => {
    const f = filled();
    f.get("workingHours.1")!.patchValue({ isOpen: true, openTime: "09:00", closeTime: "23:30" });
    const p = buildBranchPayload(f.getRawValue() as BranchFormValue);
    expect(p.workingHours[1]).toMatchObject({ openTime: "09:00:00", closeTime: "23:30:00" });
  });

  // BR-01 — fixed in Step 04: `notBlank` rejects "   " (the mapper trims it to "" and the API answered 400).
  it.each(["basicInfo.nameAr", "basicInfo.nameEn", "basicInfo.address"])(
    "BR-01: %s rejects a whitespace-only value",
    (path) => {
      const f = form();
      f.get(path)!.setValue("   ");
      expect(f.get(path)!.errors).not.toBeNull();
    },
  );

  // BR-02 — fixed in Step 06: the mapper tolerates a null map link like the URL validator does.
  it("BR-02: a null map link does not crash the payload builder", () => {
    const f = filled();
    f.get("basicInfo.mapUrl")!.setValue(null);
    expect(() => buildBranchPayload(f.getRawValue() as BranchFormValue)).not.toThrow();
  });
});

describe("Branches QA — overlapping mutations", () => {
  let service: BranchesService;
  let toggles: Subject<ApiResponse<null>>[];
  let deletes: Subject<ApiResponse<null>>[];

  const ok = (): ApiResponse<null> => ({
    status: true,
    statusCode: 200,
    message: "ok",
    errors: null,
    meta: null,
    data: null,
  });

  beforeEach(() => {
    toggles = [];
    deletes = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: NotificationService, useValue: { success: vi.fn(), warning: vi.fn() } },
        {
          provide: BRANCH_REPOSITORY,
          useValue: {
            getBranches: () => new Subject(),
            toggleBranchStatus: () => {
              const s = new Subject<ApiResponse<null>>();
              toggles.push(s);
              return s;
            },
            deleteBranches: () => {
              const s = new Subject<ApiResponse<null>>();
              deletes.push(s);
              return s;
            },
          },
        },
      ],
    });
    service = TestBed.inject(BranchesService);
  });

  it("`saving` is true while a single mutation runs and false after", () => {
    service.toggleStatus(1).subscribe();
    expect(service.saving()).toBe(true);
    toggles[0].next(ok());
    toggles[0].complete();
    expect(service.saving()).toBe(false);
  });

  // BR-04 — fixed in Step 04: `saving` is an in-flight counter, not one boolean.
  it("BR-04: `saving` stays true until the LAST overlapping mutation finishes", () => {
    service.toggleStatus(1).subscribe();
    service.remove([2]).subscribe();
    toggles[0].next(ok());
    toggles[0].complete();
    expect(service.saving()).toBe(true);
    deletes[0].next(ok());
    deletes[0].complete();
    expect(service.saving()).toBe(false);
  });
});
