import { TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Observable, firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockBarber, MockDb } from "@core/mock/mock-db";
import { NotificationService } from "@core/services/notification.service";
import { cairoToday } from "../../offers/utils/offer-dates.util";
import { BARBER_IMAGE_MAX_BYTES } from "../model/barber.model";
import { BarberMockRepository } from "./barber-mock.repository";

describe("BarberMockRepository", () => {
  let repo: BarberMockRepository;
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
  async function failure(obs: Observable<unknown>): Promise<{ status: number; message: string }> {
    try {
      await settle(obs);
    } catch (e) {
      return e as { status: number; message: string };
    }
    throw new Error("expected the call to fail");
  }

  const photo = (type = "image/png", size = 10) => {
    const f = new File(["x"], "p.png", { type });
    Object.defineProperty(f, "size", { value: size });
    return f;
  };

  /**
   * Replaces the barbers of branch 1 (Zamalek) with exactly `barbers` and sets its visibility,
   * so each rule is tested against a small, known situation instead of the seed.
   */
  function arrange(
    barbers: Array<[name: string, isActive: boolean]>,
    branch: { isVisible?: boolean } = {},
  ): MockBarber[] {
    Object.assign(
      db.branches.find((b) => b.id === 1)!,
      { isVisible: true, ...branch },
    );
    db.barbers = db.barbers.filter((b) => b.branchId !== 1);

    const made = barbers.map(([fullName, isActive], i) => ({
      id: db.nextBarberId++,
      branchId: 1,
      branchNameAr: "الزمالك",
      branchNameEn: "Zamalek",
      fullName,
      phone: `+20100000000${i}`.slice(0, 13),
      imageUrl: null,
      isActive,
      createdAt: "2026-11-02T14:20:11Z",
      updatedAt: null,
    }));
    db.barbers.push(...made);
    db.branches.find((b) => b.id === 1)!.barbersCount = made.length;
    return made;
  }

  const byName = (name: string) => db.barbers.find((b) => b.branchId === 1 && b.fullName === name)!;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation("en", {
      BARBERS: {
        ERRORS: {
          NOT_FOUND: "not found",
          LAST_ACTIVE: "{{name}} is the last active barber",
          ATTENDANCE_HAS_BOOKINGS: "{{name}} has {{count}} upcoming booking(s)",
        },
      },
    });
    translate.use("en");
    repo = TestBed.inject(BarberMockRepository);
    db = TestBed.inject(MockDb);
    warning = vi.spyOn(TestBed.inject(NotificationService), "warning");
  });

  afterEach(() => vi.useRealTimers());

  describe("seed", () => {
    it("has exactly the barbers each branch reports (so Branches and Barbers agree)", () => {
      for (const b of db.branches) {
        expect(db.barbers.filter((x) => x.branchId === b.id)).toHaveLength(b.barbersCount);
      }
    });

    it("has unique phones in the API format", () => {
      const phones = db.barbers.map((b) => b.phone);
      expect(new Set(phones).size).toBe(phones.length);
      phones.forEach((p) => expect(p).toMatch(/^\+201\d{9}$/));
    });

    it("keeps at least one active barber in every visible branch that has barbers", () => {
      for (const b of db.branches.filter((x) => x.isVisible && x.barbersCount > 0)) {
        expect(db.barbers.some((x) => x.branchId === b.id && x.isActive)).toBe(true);
      }
    });

    it("starts some barbers suspended and hands out ids that never collide", () => {
      expect(db.barbers.some((b) => !b.isActive)).toBe(true);
      expect(db.nextBarberId).toBe(Math.max(...db.barbers.map((b) => b.id)) + 1);
    });
  });

  describe("getBarbers", () => {
    beforeEach(() =>
      arrange([
        ["Omar Adel", true],
        ["Karim Mostafa", true],
        ["Zed Barber", false],
      ]),
    );

    it("filters by branch, status and name or phone", async () => {
      const q = { pageNumber: 1, pageSize: 50, branchId: 1 };

      expect((await settle(repo.getBarbers(q))).data).toHaveLength(3);
      expect(
        (await settle(repo.getBarbers({ ...q, isActive: false }))).data!.map((b) => b.fullName),
      ).toEqual(["Zed Barber"]);
      expect((await settle(repo.getBarbers({ ...q, isActive: true }))).data).toHaveLength(2);
      expect(
        (await settle(repo.getBarbers({ ...q, search: "KARIM" }))).data!.map((b) => b.fullName),
      ).toEqual(["Karim Mostafa"]);

      const phone = byName("Omar Adel").phone;
      expect(
        (await settle(repo.getBarbers({ ...q, search: phone }))).data!.map((b) => b.fullName),
      ).toEqual(["Omar Adel"]);
    });

    it("sorts by full name", async () => {
      const res = await settle(repo.getBarbers({ pageNumber: 1, pageSize: 50, branchId: 1 }));
      expect(res.data!.map((b) => b.fullName)).toEqual([
        "Karim Mostafa",
        "Omar Adel",
        "Zed Barber",
      ]);
    });

    it("paginates and reports the meta (additionalData is null)", async () => {
      const res = await settle(repo.getBarbers({ pageNumber: 2, pageSize: 2, branchId: 1 }));
      expect(res.data!.map((b) => b.fullName)).toEqual(["Zed Barber"]);
      expect(res.meta).toMatchObject({
        currentPage: 2,
        pageSize: 2,
        totalPages: 2,
        totalCount: 3,
        hasPreviousPage: true,
        hasNextPage: false,
        additionalData: null,
      });
    });

    it("does not leak timestamps into the list items", async () => {
      const res = await settle(repo.getBarbers({ pageNumber: 1, pageSize: 5, branchId: 1 }));
      expect(res.data![0]).not.toHaveProperty("createdAt");
    });
  });

  describe("getBarberById", () => {
    it("returns the details with timestamps", async () => {
      const [karim] = arrange([["Karim Mostafa", true]]);
      const res = await settle(repo.getBarberById(karim.id));
      expect(res.status).toBe(true);
      expect(res.data).toMatchObject({
        id: karim.id,
        fullName: "Karim Mostafa",
        branchNameEn: "Zamalek",
        createdAt: "2026-11-02T14:20:11Z",
        updatedAt: null,
      });
    });

    it("answers a status:false 404 body for an unknown id", async () => {
      const res = await settle(repo.getBarberById(99999));
      expect(res).toMatchObject({ status: false, statusCode: 404, data: null });
    });
  });

  describe("createBarber", () => {
    beforeEach(() => arrange([["Existing One", true]]));
    const valid = { branchId: 1, fullName: " New Barber ", phone: "+201555555555" };

    it("creates an ACTIVE barber, trims the name, returns the id and syncs the branch total", async () => {
      const res = await settle(repo.createBarber(valid));

      expect(res).toMatchObject({
        status: true,
        statusCode: 201,
        message: "Barber Created Successfully",
      });
      const created = db.barbers.find((b) => b.id === res.data)!;
      expect(created).toMatchObject({
        fullName: "New Barber",
        branchId: 1,
        branchNameEn: "Zamalek",
        isActive: true,
        imageUrl: null,
      });
      expect(db.branches.find((b) => b.id === 1)!.barbersCount).toBe(2);
    });

    it("stores a photo URL when an image is sent", async () => {
      const res = await settle(repo.createBarber({ ...valid, image: photo() }));
      expect(db.barbers.find((b) => b.id === res.data)!.imageUrl).toBeTruthy();
    });

    it.each([
      ["an unknown branch", { branchId: 9999 }, "BranchId", "BARBERS.ERRORS.BRANCH_NOT_FOUND"],
      ["a blank name", { fullName: "   " }, "FullName", "BARBERS.ERRORS.NAME_REQUIRED"],
      [
        "a name over 100 characters",
        { fullName: "x".repeat(101) },
        "FullName",
        "BARBERS.ERRORS.NAME_TOO_LONG",
      ],
      ["a missing phone", { phone: "" }, "Phone", "BARBERS.ERRORS.PHONE_REQUIRED"],
      ["a non-Egyptian phone", { phone: "+14155550123" }, "Phone", "BARBERS.ERRORS.PHONE_INVALID"],
      [
        "a phone without the country code",
        { phone: "01555555555" },
        "Phone",
        "BARBERS.ERRORS.PHONE_INVALID",
      ],
      ["a GIF", { image: photo("image/gif") }, "Image", "BARBERS.ERRORS.INVALID_IMAGE"],
      [
        "a photo over 5 MB",
        { image: photo("image/png", BARBER_IMAGE_MAX_BYTES + 1) },
        "Image",
        "BARBERS.ERRORS.INVALID_IMAGE",
      ],
    ])("rejects %s with a 400 toast", async (_label, patch, field, key) => {
      const before = db.barbers.length;
      const err = await failure(repo.createBarber({ ...valid, ...patch }));

      expect(err.status).toBe(400);
      expect(warning).toHaveBeenCalledWith(`VALIDATION_FIELDS.${field}`, key);
      expect(db.barbers).toHaveLength(before);
    });

    it("rejects a phone already used by ANY barber, in any branch", async () => {
      const other = db.barbers.find((b) => b.branchId !== 1)!;
      const err = await failure(repo.createBarber({ ...valid, phone: other.phone }));

      expect(err.status).toBe(400);
      expect(warning).toHaveBeenCalledWith("VALIDATION_FIELDS.Phone", "BARBERS.ERRORS.PHONE_TAKEN");
    });
  });

  describe("updateBarber", () => {
    let karim: MockBarber;
    beforeEach(() => {
      [karim] = arrange([
        ["Karim Mostafa", true],
        ["Omar Adel", true],
      ]);
    });
    const edit = (patch: Partial<Parameters<BarberMockRepository["updateBarber"]>[1]> = {}) => ({
      branchId: 1,
      fullName: "Karim M.",
      phone: karim.phone,
      removeImage: false,
      ...patch,
    });

    it("edits the name and keeps its own phone (a barber may re-submit their own number)", async () => {
      const res = await settle(repo.updateBarber(karim.id, edit()));

      expect(res).toMatchObject({
        status: true,
        message: "Barber Updated Successfully",
        data: null,
      });
      expect(byName("Karim M.")).toBeTruthy();
      expect(karim.updatedAt).not.toBeNull();
    });

    it("rejects another barber’s phone", async () => {
      const err = await failure(
        repo.updateBarber(karim.id, edit({ phone: byName("Omar Adel").phone })),
      );
      expect(err.status).toBe(400);
      expect(warning).toHaveBeenCalledWith("VALIDATION_FIELDS.Phone", "BARBERS.ERRORS.PHONE_TAKEN");
    });

    it("replaces the photo when an image is sent", async () => {
      await settle(repo.updateBarber(karim.id, edit({ image: photo() })));
      expect(karim.imageUrl).toBeTruthy();
    });

    it("removes the photo with removeImage, and keeps it when neither is sent", async () => {
      karim.imageUrl = "https://x/y.jpg";

      await settle(repo.updateBarber(karim.id, edit()));
      expect(karim.imageUrl).toBe("https://x/y.jpg");

      await settle(repo.updateBarber(karim.id, edit({ removeImage: true })));
      expect(karim.imageUrl).toBeNull();
    });

    it("a new image wins over removeImage", async () => {
      karim.imageUrl = "https://x/y.jpg";
      await settle(repo.updateBarber(karim.id, edit({ image: photo(), removeImage: true })));
      expect(karim.imageUrl).not.toBeNull();
      expect(karim.imageUrl).not.toBe("https://x/y.jpg");
    });

    it("transfers the barber to another branch and syncs both totals and the branch names", async () => {
      const maadi = db.branches.find((b) => b.id === 2)!;
      const maadiBefore = maadi.barbersCount;

      await settle(repo.updateBarber(karim.id, edit({ branchId: 2 })));

      expect(karim).toMatchObject({ branchId: 2, branchNameEn: "Maadi" });
      expect(db.branches.find((b) => b.id === 1)!.barbersCount).toBe(1);
      expect(maadi.barbersCount).toBe(maadiBefore + 1);
    });

    it("answers 409 when moving the last active barber out of a visible branch", async () => {
      arrange([
        ["Karim Mostafa", true],
        ["Suspended One", false],
      ]);
      const only = byName("Karim Mostafa");

      const err = await failure(
        repo.updateBarber(only.id, edit({ branchId: 2, phone: only.phone })),
      );

      expect(err.status).toBe(409);
      expect(err.message).toBe("Karim Mostafa is the last active barber");
      expect(only.branchId).toBe(1);
    });

    it("allows moving the last active barber out of a HIDDEN branch", async () => {
      const [only] = arrange([["Karim Mostafa", true]], { isVisible: false });
      await settle(repo.updateBarber(only.id, edit({ branchId: 2, phone: only.phone })));
      expect(only.branchId).toBe(2);
    });

    it("allows editing (not moving) the last active barber of a visible branch", async () => {
      const [only] = arrange([["Karim Mostafa", true]]);
      await settle(
        repo.updateBarber(only.id, edit({ fullName: "Karim Renamed", phone: only.phone })),
      );
      expect(only.fullName).toBe("Karim Renamed");
    });

    it("rejects an unknown target branch (400) and an unknown barber (404)", async () => {
      expect((await failure(repo.updateBarber(karim.id, edit({ branchId: 9999 })))).status).toBe(
        400,
      );
      expect((await failure(repo.updateBarber(99999, edit()))).status).toBe(404);
    });
  });

  describe("toggleBarberStatus", () => {
    it("suspends and re-activates", async () => {
      const [a] = arrange([
        ["A", true],
        ["B", true],
      ]);

      await settle(repo.toggleBarberStatus(a.id));
      expect(a.isActive).toBe(false);

      await settle(repo.toggleBarberStatus(a.id));
      expect(a.isActive).toBe(true);
    });

    it("answers 409 for the last active barber of a visible branch, naming them", async () => {
      const [a] = arrange([
        ["Karim Mostafa", true],
        ["Suspended One", false],
      ]);

      const err = await failure(repo.toggleBarberStatus(a.id));

      expect(err.status).toBe(409);
      expect(err.message).toBe("Karim Mostafa is the last active barber");
      expect(a.isActive).toBe(true);
    });

    it("has no such restriction in a hidden branch", async () => {
      const [a] = arrange([["A", true]], { isVisible: false });
      await settle(repo.toggleBarberStatus(a.id));
      expect(a.isActive).toBe(false);
    });

    it("always allows activating a suspended barber", async () => {
      const [, b] = arrange([
        ["A", true],
        ["B", false],
      ]);
      await settle(repo.toggleBarberStatus(b.id));
      expect(b.isActive).toBe(true);
    });

    it("answers 404 for an unknown id", async () => {
      expect((await failure(repo.toggleBarberStatus(99999))).status).toBe(404);
    });
  });

  describe("deleteBarbers", () => {
    it("deletes the given barbers and syncs the branch total", async () => {
      const [a, b] = arrange([
        ["A", true],
        ["B", true],
        ["C", true],
      ]);

      const res = await settle(repo.deleteBarbers({ ids: [a.id, b.id] }));

      expect(res).toMatchObject({ status: true, message: "Barber Deleted Successfully" });
      expect(db.barbers.filter((x) => x.branchId === 1).map((x) => x.fullName)).toEqual(["C"]);
      expect(db.branches.find((x) => x.id === 1)!.barbersCount).toBe(1);
    });

    it("rejects an empty id list with a 400", async () => {
      const err = await failure(repo.deleteBarbers({ ids: [] }));
      expect(err.status).toBe(400);
      expect(warning).toHaveBeenCalledWith(
        "VALIDATION_FIELDS.BarberIds",
        "BARBERS.ERRORS.IDS_REQUIRED",
      );
    });

    it("is all-or-nothing: one unknown id (404) deletes nothing", async () => {
      const [a] = arrange([
        ["A", true],
        ["B", true],
      ]);

      expect((await failure(repo.deleteBarbers({ ids: [a.id, 99999] }))).status).toBe(404);
      expect(db.barbers.filter((x) => x.branchId === 1)).toHaveLength(2);
    });

    it("is blocked (409) when it would delete every active barber of a visible branch, even all at once", async () => {
      const [a, b] = arrange([
        ["Alpha", true],
        ["Beta", true],
        ["Suspended", false],
      ]);

      const err = await failure(repo.deleteBarbers({ ids: [a.id, b.id] }));

      expect(err.status).toBe(409);
      expect(err.message).toBe("Alpha is the last active barber"); // the first blocking barber
      expect(db.barbers.filter((x) => x.branchId === 1)).toHaveLength(3);
    });

    it("allows deleting suspended barbers and keeping one active", async () => {
      const [a, , c] = arrange([
        ["A", true],
        ["B", true],
        ["C", false],
      ]);
      await settle(repo.deleteBarbers({ ids: [a.id, c.id] }));
      expect(db.barbers.filter((x) => x.branchId === 1).map((x) => x.fullName)).toEqual(["B"]);
    });

    it("has no restriction in a hidden branch", async () => {
      const [a, b] = arrange(
        [
          ["A", true],
          ["B", true],
        ],
        { isVisible: false },
      );
      await settle(repo.deleteBarbers({ ids: [a.id, b.id] }));
      expect(db.barbers.filter((x) => x.branchId === 1)).toHaveLength(0);
    });
  });

  describe("attendance", () => {
    /** Three barbers in branch 1: Ali (active), Omar (active), Zed (suspended). */
    function sheetOf3() {
      db.barberAttendance = {};
      db.barberUpcomingBookings = {};
      arrange([
        ["Omar", true],
        ["Ali", true],
        ["Zed", false],
      ]);
      return { ali: byName("Ali"), omar: byName("Omar"), zed: byName("Zed") };
    }

    describe("getAttendance", () => {
      it("lists the branch's ACTIVE barbers ordered by name; nobody is present until marked", async () => {
        sheetOf3();

        const res = await settle(repo.getAttendance(1));

        expect(res.status).toBe(true);
        expect(res.data!.map((r) => r.fullName)).toEqual(["Ali", "Omar"]); // Zed is suspended
        expect(res.data!.every((r) => r.isPresent === false)).toBe(true);
        expect(res.data![0]).toEqual({
          barberId: byName("Ali").id,
          fullName: "Ali",
          imageUrl: null,
          isPresent: false,
          upcomingBookingsCount: 0,
        });
      });

      it("never lists a barber of another branch", async () => {
        sheetOf3();

        const ids = (await settle(repo.getAttendance(1))).data!.map((r) => r.barberId);
        const other = db.barbers.filter((b) => b.branchId !== 1).map((b) => b.id);

        expect(ids.some((id) => other.includes(id))).toBe(false);
      });

      it("reports the upcoming bookings count per barber", async () => {
        const { ali, omar } = sheetOf3();
        db.barberUpcomingBookings = { [ali.id]: 3 };

        const rows = (await settle(repo.getAttendance(1))).data!;

        expect(rows.find((r) => r.barberId === ali.id)!.upcomingBookingsCount).toBe(3);
        expect(rows.find((r) => r.barberId === omar.id)!.upcomingBookingsCount).toBe(0);
      });

      it("counts only a mark made TODAY — an older entry means 'not marked yet'", async () => {
        const { ali, omar } = sheetOf3();
        db.barberAttendance = {
          [ali.id]: { date: cairoToday(), isPresent: true },
          [omar.id]: { date: "2000-01-01", isPresent: true },
        };

        const rows = (await settle(repo.getAttendance(1))).data!;

        expect(rows.find((r) => r.barberId === ali.id)!.isPresent).toBe(true);
        expect(rows.find((r) => r.barberId === omar.id)!.isPresent).toBe(false);
      });

      it("answers a 404 body for an unknown branch", async () => {
        const res = await settle(repo.getAttendance(9999));

        expect(res).toMatchObject({ status: false, statusCode: 404, data: null });
      });
    });

    describe("setAttendance", () => {
      const sheet = async () => (await settle(repo.getAttendance(1))).data!;

      it("marks the whole sheet in one call, for today", async () => {
        const { ali, omar } = sheetOf3();

        const res = await settle(
          repo.setAttendance({
            barbers: [
              { barberId: ali.id, isPresent: true },
              { barberId: omar.id, isPresent: false },
            ],
          }),
        );

        expect(res).toMatchObject({ status: true, statusCode: 200, data: null });
        expect(db.barberAttendance[ali.id]).toEqual({ date: cairoToday(), isPresent: true });
        expect((await sheet()).map((r) => r.isPresent)).toEqual([true, false]);
      });

      it("changes only the barbers sent — the others keep their state", async () => {
        const { ali, omar } = sheetOf3();
        await settle(
          repo.setAttendance({
            barbers: [
              { barberId: ali.id, isPresent: true },
              { barberId: omar.id, isPresent: true },
            ],
          }),
        );

        await settle(repo.setAttendance({ barbers: [{ barberId: omar.id, isPresent: false }] }));

        const rows = await sheet();
        expect(rows.find((r) => r.barberId === ali.id)!.isPresent).toBe(true);
        expect(rows.find((r) => r.barberId === omar.id)!.isPresent).toBe(false);
      });

      it("lets a barber with upcoming bookings be marked PRESENT", async () => {
        const { ali } = sheetOf3();
        db.barberUpcomingBookings = { [ali.id]: 3 };

        await settle(repo.setAttendance({ barbers: [{ barberId: ali.id, isPresent: true }] }));

        expect((await sheet())[0].isPresent).toBe(true);
      });

      it("answers 409 when a present barber with upcoming bookings is marked absent — and saves nothing", async () => {
        const { ali, omar } = sheetOf3();
        db.barberUpcomingBookings = { [ali.id]: 3 };
        await settle(repo.setAttendance({ barbers: [{ barberId: ali.id, isPresent: true }] }));

        const error = await failure(
          repo.setAttendance({
            barbers: [
              { barberId: omar.id, isPresent: true }, // valid, but must not be saved either
              { barberId: ali.id, isPresent: false },
            ],
          }),
        );

        expect(error.status).toBe(409);
        expect(error.message).toBe("Ali has 3 upcoming booking(s)");
        expect(warning).toHaveBeenCalledWith("Ali has 3 upcoming booking(s)");
        const rows = await sheet();
        expect(rows.find((r) => r.barberId === ali.id)!.isPresent).toBe(true);
        expect(rows.find((r) => r.barberId === omar.id)!.isPresent).toBe(false);
      });

      it("allows marking absent a barber with bookings who was never marked present", async () => {
        const { ali } = sheetOf3();
        db.barberUpcomingBookings = { [ali.id]: 3 };

        const res = await settle(
          repo.setAttendance({ barbers: [{ barberId: ali.id, isPresent: false }] }),
        );

        expect(res.status).toBe(true);
      });

      it("allows marking absent once the bookings are gone", async () => {
        const { ali } = sheetOf3();
        db.barberUpcomingBookings = { [ali.id]: 3 };
        await settle(repo.setAttendance({ barbers: [{ barberId: ali.id, isPresent: true }] }));
        db.barberUpcomingBookings = {};

        await settle(repo.setAttendance({ barbers: [{ barberId: ali.id, isPresent: false }] }));

        expect((await sheet())[0].isPresent).toBe(false);
      });

      it("answers 400 for an empty list", async () => {
        sheetOf3();

        const error = await failure(repo.setAttendance({ barbers: [] }));

        expect(error.status).toBe(400);
        expect(warning).toHaveBeenCalledWith(
          "VALIDATION_FIELDS.Barbers",
          "BARBERS.ERRORS.ATTENDANCE_REQUIRED",
        );
      });

      it("answers 400 when a barber appears twice — and saves nothing", async () => {
        const { ali } = sheetOf3();

        const error = await failure(
          repo.setAttendance({
            barbers: [
              { barberId: ali.id, isPresent: true },
              { barberId: ali.id, isPresent: false },
            ],
          }),
        );

        expect(error.status).toBe(400);
        expect(db.barberAttendance[ali.id]).toBeUndefined();
      });

      it("answers 404 for an unknown barber — all-or-nothing, the valid ones are not saved", async () => {
        const { ali } = sheetOf3();

        const error = await failure(
          repo.setAttendance({
            barbers: [
              { barberId: ali.id, isPresent: true },
              { barberId: 99999, isPresent: true },
            ],
          }),
        );

        expect(error.status).toBe(404);
        expect(db.barberAttendance[ali.id]).toBeUndefined();
      });
    });
  });
});
