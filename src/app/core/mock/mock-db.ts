import { Injectable } from "@angular/core";

import { ALL_PERMISSIONS } from "../auth/permissions";
import {
  BranchDetails,
  BranchListItem,
  BranchWorkingHour,
} from "@modules/branches/model/branch.model";
import { ChairDetails, ChairType } from "@modules/chairs/model/chair.model";
import { BarberDetails } from "@modules/barbers/model/barber.model";
import { ServiceBranchPayload } from "@modules/services/model/service.model";

// ============================================================
// Types
// ============================================================

/** A role that can be assigned to a user. */
export interface MockRole {
  id: number;
  name: string;
  permissions: string[];
}

/** A user stored in the mock database. */
export interface MockUser {
  id: number;
  fullName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  roleId: number;
  status: boolean;
  imageUrl: string | null;
}

/**
 * A branch combines the summary shape returned by list endpoints
 * ({@link BranchListItem}) with the extra fields exposed by detail
 * endpoints ({@link BranchDetails}, minus the duplicated `id`).
 */
export type MockBranch = BranchListItem & Omit<BranchDetails, "id">;

/** A chair stored in the mock database (details shape, so the list and detail endpoints share it). */
export type MockChair = ChairDetails;

/** A barber stored in the mock database (details shape, so the list and detail endpoints share it). */
export type MockBarber = BarberDetails;

/**
 * A service stored in the mock database: one record with a price row per branch.
 * A branch with no row in `prices` is "unpriced" for that service.
 */
export interface MockService {
  id: number;
  nameAr: string;
  nameEn: string;
  createdAt: string;
  updatedAt: string | null;
  prices: ServiceBranchPayload[];
}

// ============================================================
// Constants
// ============================================================

/** Permissions granted to the `BranchManager` role. */
export const MOCK_MANAGER_PERMISSIONS: string[] = [
  "Booking.View",
  "Booking.Cancel",
  "Session.View",
  "Session.Manage",
  "Availability.View",
  "Branch.View",
  "Service.View",
  "Barber.View",
  "Chair.View",
  "Offer.View",
  "Review.View",
  "Report.View",
];

/**
 * Default weekly working hours applied to every seeded branch.
 * Day 5 (Friday) is closed; all other days are open 10:00–22:00.
 */
const DEFAULT_WORKING_HOURS: BranchWorkingHour[] = [
  { dayOfWeek: 6, isOpen: true, openTime: "10:00:00", closeTime: "22:00:00" },
  { dayOfWeek: 0, isOpen: true, openTime: "10:00:00", closeTime: "22:00:00" },
  { dayOfWeek: 1, isOpen: true, openTime: "10:00:00", closeTime: "22:00:00" },
  { dayOfWeek: 2, isOpen: true, openTime: "10:00:00", closeTime: "22:00:00" },
  { dayOfWeek: 3, isOpen: true, openTime: "10:00:00", closeTime: "22:00:00" },
  { dayOfWeek: 4, isOpen: true, openTime: "10:00:00", closeTime: "22:00:00" },
  { dayOfWeek: 5, isOpen: false, openTime: null, closeTime: null },
];

// ============================================================
// Mock Database
// ============================================================

/**
 * One shared in-memory database for all mock repositories.
 *
 * Changes survive navigation but are reset on a full application reload.
 * Mock repositories should mutate this instance rather than keeping
 * their own copies so all screens stay in sync.
 */
@Injectable({ providedIn: "root" })
export class MockDb {
  // ----------------------------------------------------------
  // ID Counters
  // ----------------------------------------------------------

  nextRoleId = 4;
  nextUserId = 13;
  nextBranchId = 15;
  nextChairId = 1;
  nextBarberId = 1;
  nextServiceId = 1;

  // ----------------------------------------------------------
  // Roles
  // ----------------------------------------------------------

  roles: MockRole[] = [
    {
      id: 1,
      name: "SuperAdmin",
      permissions: [...ALL_PERMISSIONS],
    },
    {
      id: 2,
      name: "BranchManager",
      permissions: [...MOCK_MANAGER_PERMISSIONS],
    },
    {
      id: 3,
      name: "Receptionist",
      permissions: [
        "Booking.View",
        "Booking.Cancel",
        "Session.View",
        "Availability.View",
      ],
    },
  ];

  // ----------------------------------------------------------
  // Users
  // ----------------------------------------------------------

  users: MockUser[] = [
    this.user(1, "Omar Khaled", "admin@odel.com", 1, true, "1029005195"),
    this.user(2, "Layla Hassan", "manager@odel.com", 2, true, "1006677889"),
    this.user(3, "Karim Adel", "karim.adel@odel.com", 2, true, "1112223344"),
    this.user(
      4,
      "Nour Elsayed",
      "nour.elsayed@odel.com",
      3,
      true,
      "1223334455",
    ),
    this.user(
      5,
      "Youssef Nabil",
      "youssef.nabil@odel.com",
      3,
      false,
      "1550001122",
    ),
    this.user(6, "Mona Fathy", "mona.fathy@odel.com", 3, true, "1017788990"),
    this.user(
      7,
      "Hady Mahmoud",
      "hady.mahmoud@odel.com",
      2,
      false,
      "1099887766",
    ),
    this.user(8, "Salma Ragab", "salma.ragab@odel.com", 3, true, "1144556677"),
    this.user(9, "Adham Saeed", "adham.saeed@odel.com", 3, true, "1233221100"),
    this.user(10, "Dina Wagdy", "dina.wagdy@odel.com", 2, true, "1066554433"),
    this.user(11, "Tarek Fawzy", "tarek.fawzy@odel.com", 3, true, "1188776655"),
    this.user(
      12,
      "Rana Mostafa",
      "rana.mostafa@odel.com",
      3,
      false,
      "1011223355",
    ),
  ];

  // ----------------------------------------------------------
  // Branches
  // ----------------------------------------------------------

  branches: MockBranch[] = [
    this.branch(
      1,
      "الزمالك",
      "Zamalek",
      "8 Hassan Sabry St, Zamalek, Cairo",
      "+201020304050",
      [true, true, false],
      true,
      [4, 3, 1],
    ),
    this.branch(
      2,
      "المعادي",
      "Maadi",
      "Road 9, Maadi, Cairo",
      "+201112345678",
      [true, true, false],
      true,
      [5, 4, 1],
    ),
    this.branch(
      3,
      "مدينة نصر",
      "Nasr City",
      "12 Abbas El Akkad St, Nasr City, Cairo",
      "+201001102194",
      [true, true, true],
      true,
      [6, 4, 2],
    ),
    this.branch(
      4,
      "مصر الجديدة",
      "Heliopolis",
      "25 El Korba St, Heliopolis, Cairo",
      "+201223344556",
      [true, false, true],
      true,
      [3, 3, 0],
    ),
    this.branch(
      5,
      "القاهرة الجديدة",
      "New Cairo",
      "Tagamoa 1, Street 90, New Cairo",
      "+201551122334",
      [true, true, true],
      true,
      [8, 5, 3],
    ),
    this.branch(
      6,
      "الشيخ زايد",
      "Sheikh Zayed",
      "Arkan Plaza, Sheikh Zayed City, Giza",
      "+201066778899",
      [true, true, false],
      true,
      [4, 3, 2],
    ),
    this.branch(
      7,
      "السادس من أكتوبر",
      "6th of October",
      "Mall of Egypt, 26th of July Corridor, 6th of October",
      "+201144556677",
      [true, false, true],
      true,
      [5, 4, 0],
    ),
    this.branch(
      8,
      "الدقي",
      "Dokki",
      "14 Mesaha Square, Dokki, Giza",
      "+201288990011",
      [true, false, false],
      true,
      [2, 2, 0],
    ),
    this.branch(
      9,
      "المهندسين",
      "Mohandessin",
      "30 Gameat El Dowal El Arabeya St, Mohandessin, Giza",
      "+201017788990",
      [true, true, false],
      false,
      [3, 2, 1],
    ),
    this.branch(
      10,
      "سموحة - الإسكندرية",
      "Smouha, Alexandria",
      "45 Fawzy Moaz St, Smouha, Alexandria",
      "+201099887766",
      [true, true, true],
      true,
      [6, 4, 2],
    ),
    this.branch(
      11,
      "ستانلي - الإسكندرية",
      "Stanley, Alexandria",
      "Stanley Bridge Corniche, Alexandria",
      "+201233221100",
      [true, true, false],
      true,
      [4, 3, 1],
    ),
    this.branch(
      12,
      "طنطا",
      "Tanta",
      "7 El Geish St, Tanta, Gharbia",
      "+201011223344",
      [true, false, false],
      false,
      [0, 0, 0],
    ),
    this.branch(
      13,
      "المنصورة",
      "Mansoura",
      "El Gomhoreya St, Mansoura, Dakahlia",
      "+201188776655",
      [true, true, false],
      false,
      [2, 1, 0],
    ),
    this.branch(
      14,
      "الغردقة",
      "Hurghada",
      "Sheraton Road, Hurghada, Red Sea",
      "+201555443322",
      [true, true, true],
      false,
      [1, 0, 0],
    ),
  ];

  // ----------------------------------------------------------
  // Chairs
  // ----------------------------------------------------------

  /**
   * Seeded from each branch's `regularChairsCount` / `vipChairsCount`, so the
   * Branches and Chairs screens agree. Regular chairs are R1…Rn, VIP chairs V1…Vn.
   */
  chairs: MockChair[] = this.seedChairs();

  // ----------------------------------------------------------
  // Barbers
  // ----------------------------------------------------------

  /**
   * Seeded from each branch's `barbersCount`, so the Branches and Barbers screens
   * agree. Every visible branch keeps at least one active barber (the same invariant
   * the real backend enforces), and a few barbers start suspended.
   */
  barbers: MockBarber[] = this.seedBarbers();

  // ----------------------------------------------------------
  // Services (menu & pricing)
  // ----------------------------------------------------------

  /**
   * Seeded from the branch list: every service is priced in every branch except a few
   * deliberately "unpriced" ones (e.g. a branch added after the service), and prices
   * scale with a per-branch factor. Home is only seeded in branches that allow home visits.
   */
  services: MockService[] = this.seedServices();

  // ----------------------------------------------------------
  // Lookups
  // ----------------------------------------------------------

  /** Resolve a role id to its display name (empty string if unknown). */
  roleName(id: number): string {
    return this.roles.find((role) => role.id === id)?.name ?? "";
  }

  // ----------------------------------------------------------
  // Factory Helpers
  // ----------------------------------------------------------

  /** `branchId:name` of seeded chairs that start inactive (counts stay totals, as in the real API). */
  private static readonly INACTIVE_SEED = new Set(["2:R4", "5:V3", "9:R2"]);

  /** `branchId:position` (1-based inside the branch) of seeded barbers that start suspended. */
  private static readonly SUSPENDED_BARBERS = new Set(["1:4", "2:5", "5:7", "5:8", "9:2", "13:1"]);

  private static readonly BARBER_NAMES = [
    "Ahmed Fathy", "Mahmoud Saber", "Hassan Gamal", "Mostafa Ezzat", "Ali Hegazy",
    "Tamer Nabil", "Sherif Lotfy", "Walid Samir", "Yehia Adly", "Karim Mostafa",
    "Omar Adel", "Ziad Ramy", "Hossam Anwar", "Ibrahim Zaki", "Khaled Mounir",
    "Amr Diab Younes", "Mohamed Salah Eldin", "Ramy Sabry", "Adel Fouad", "Nader Hamdy",
    "Fady Boules", "Mina Samuel", "George Wahba", "Peter Ishak", "Sameh Hosny",
    "Bassem Yousry", "Essam Kamel", "Gaber Atef", "Hany Shaker", "Ismail Radwan",
    "Magdy Tawfik", "Nabil Sherbiny", "Osama Refaat", "Reda Mekawy", "Saad Zaghloul",
    "Taha Mansour", "Usama Badr", "Wael Gomaa", "Yasser Hamed", "Zakaria Awad",
    "Anas Farouk", "Badr Abdelaziz", "Fawzy Helmy", "Galal Moussa", "Hatem Ragheb",
    "Ihab Soliman", "Jamal Nasser", "Kamal Darwish", "Labib Shawky", "Maher Galal",
    "Nasser Eid", "Raouf Talaat", "Sayed Barakat", "Talaat Younis", "Wagdy Rizk",
  ];

  /** Phones of seeded barbers that match the API contract's examples. */
  private static readonly BARBER_PHONE_OVERRIDES: Record<string, string> = {
    "Karim Mostafa": "+201001234567",
    "Omar Adel": "+201112223344",
  };

  /** `[nameAr, nameEn, minutes, regular, vip, home price | null]` — base prices before the branch factor. */
  private static readonly SERVICE_SEED: Array<
    [string, string, number, number, number, number | null]
  > = [
    ["قص شعر", "Haircut", 30, 120, 200, 300],
    ["تشذيب اللحية", "Beard trim", 15, 60, 100, null],
    ["غسيل الشعر", "Hair wash", 10, 30, 50, null],
    ["صبغة شعر", "Hair colour", 90, 350, 500, 700],
    ["تنظيف البشرة", "Facial cleansing", 40, 180, 260, 300],
    ["علاج الشعر بالكيراتين", "Keratin treatment", 120, 600, 900, null],
    ["مانيكير", "Manicure", 30, 100, 150, 200],
    ["باديكير", "Pedicure", 45, 130, 190, null],
    ["حلاقة بالموس", "Classic shave", 20, 70, 110, 150],
    ["قص شعر أطفال", "Kids haircut", 20, 80, 120, 180],
  ];

  /** Price multiplier per branch id (missing = 1). */
  private static readonly BRANCH_PRICE_FACTOR: Record<number, number> = {
    1: 1.2, 2: 1.1, 4: 1.05, 5: 1.25, 6: 1.15, 7: 1.1, 8: 0.9,
    9: 1.1, 12: 0.8, 13: 0.85, 14: 1.3,
  };

  /** `serviceId:branchId` pairs with NO price row ("unpriced"). */
  private static readonly UNPRICED_SERVICES = new Set([
    "4:8", "4:12", "4:13", "4:14", "10:14", "6:12", "6:13",
  ]);

  /** `serviceId:branchId` pairs that are priced but inactive. */
  private static readonly INACTIVE_SERVICES = new Set([
    "6:2", "8:5", "3:9", "5:11", "9:3", "7:6",
  ]);

  private seedServices(): MockService[] {
    const now = new Date().toISOString();
    const services = MockDb.SERVICE_SEED.map(
      ([nameAr, nameEn, minutes, regular, vip, home], index): MockService => {
        const id = index + 1;
        const prices: ServiceBranchPayload[] = [];

        for (const branch of this.branches) {
          const key = `${id}:${branch.id}`;
          if (MockDb.UNPRICED_SERVICES.has(key)) continue;

          const factor = MockDb.BRANCH_PRICE_FACTOR[branch.id] ?? 1;
          const offersHome = home !== null && branch.allowsHome;
          prices.push({
            branchId: branch.id,
            durationMinutes: minutes,
            regularPrice: Math.round(regular * factor),
            vipPrice: Math.round(vip * factor),
            isHomeAvailable: offersHome,
            homePrice: offersHome ? Math.round(home * factor) : null,
            isActive: !MockDb.INACTIVE_SERVICES.has(key),
          });
        }

        return { id, nameAr, nameEn, createdAt: now, updatedAt: null, prices };
      },
    );

    this.nextServiceId = services.length + 1;
    return services;
  }

  private seedBarbers(): MockBarber[] {
    const barbers: MockBarber[] = [];
    let id = 1;
    const now = new Date().toISOString();
    const operators = ["0", "1", "2", "5"];

    for (const branch of this.branches) {
      for (let n = 1; n <= branch.barbersCount; n++) {
        const fullName = MockDb.BARBER_NAMES[(id - 1) % MockDb.BARBER_NAMES.length];
        const generated = `+201${operators[id % 4]}${String(10000000 + ((id * 7654321) % 89999999))}`;

        barbers.push({
          id,
          branchId: branch.id,
          branchNameAr: branch.nameAr,
          branchNameEn: branch.nameEn,
          fullName,
          phone: MockDb.BARBER_PHONE_OVERRIDES[fullName] ?? generated,
          imageUrl: null,
          isActive: !MockDb.SUSPENDED_BARBERS.has(`${branch.id}:${n}`),
          createdAt: now,
          updatedAt: null,
        });
        id++;
      }
    }

    this.nextBarberId = id;
    return barbers;
  }

  private seedChairs(): MockChair[] {
    const chairs: MockChair[] = [];
    let id = 1;
    const now = new Date().toISOString();

    for (const branch of this.branches) {
      const groups: Array<[ChairType, string, number]> = [
        [ChairType.Regular, "R", branch.regularChairsCount],
        [ChairType.Vip, "V", branch.vipChairsCount],
      ];

      for (const [type, prefix, count] of groups) {
        for (let n = 1; n <= count; n++) {
          const name = `${prefix}${n}`;
          chairs.push({
            id: id++,
            branchId: branch.id,
            branchNameAr: branch.nameAr,
            branchNameEn: branch.nameEn,
            name,
            type,
            isActive: !MockDb.INACTIVE_SEED.has(`${branch.id}:${name}`),
            createdAt: now,
            updatedAt: null,
          });
        }
      }
    }

    this.nextChairId = id;
    return chairs;
  }


  /**
   * Build a {@link MockUser} with the shared defaults applied
   * (`countryCode`, `imageUrl`).
   */
  private user(
    id: number,
    fullName: string,
    email: string,
    roleId: number,
    status: boolean,
    phoneNumber: string,
  ): MockUser {
    return {
      id,
      fullName,
      email,
      countryCode: "+20",
      phoneNumber,
      roleId,
      status,
      imageUrl: null,
    };
  }

  /**
   * Build a {@link MockBranch} with the default working hours and
   * timestamps applied.
   *
   * @param types  Tuple of `[allowsRegular, allowsVip, allowsHome]`.
   * @param counts Tuple of `[barbers, regularChairs, vipChairs]`.
   */
  private branch(
    id: number,
    nameAr: string,
    nameEn: string,
    address: string,
    phone: string,
    types: [boolean, boolean, boolean],
    isVisible: boolean,
    counts: [number, number, number],
  ): MockBranch {
    return {
      id,
      nameAr,
      nameEn,
      address,
      phone,
      allowsRegular: types[0],
      allowsVip: types[1],
      allowsHome: types[2],
      isVisible,
      barbersCount: counts[0],
      regularChairsCount: counts[1],
      vipChairsCount: counts[2],
      mapUrl: null,
      workingHours: DEFAULT_WORKING_HOURS.map((hour) => ({ ...hour })),
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };
  }
}
