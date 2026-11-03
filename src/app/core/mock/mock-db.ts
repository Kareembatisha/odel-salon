import { Injectable } from '@angular/core';

import { ALL_PERMISSIONS } from '../auth/permissions';

export interface MockRole {
  id: number;
  name: string;
  permissions: string[];
}

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

export interface MockBranch {
  id: number;
  nameAr: string;
  nameEn: string;
  address: string;
  phone: string;
  allowsRegular: boolean;
  allowsVip: boolean;
  allowsHome: boolean;
  isVisible: boolean;
  /** Totals — include suspended barbers / inactive chairs, exactly like the real list endpoint. */
  barbersCount: number;
  regularChairsCount: number;
  vipChairsCount: number;
}

export const MOCK_MANAGER_PERMISSIONS: string[] = [
  'Booking.View', 'Booking.Cancel', 'Session.View', 'Session.Manage', 'Availability.View',
  'Branch.View', 'Service.View', 'Barber.View', 'Chair.View', 'Offer.View', 'Review.View', 'Report.View',
];

/**
 * One in-memory "database" shared by every mock repository, so mock mode feels
 * like a real backend: a role's user count follows the users, deleting a role
 * that users still hold is refused, edits survive navigation (not a reload).
 */
@Injectable({ providedIn: 'root' })
export class MockDb {
  roles: MockRole[] = [
    { id: 1, name: 'SuperAdmin', permissions: [...ALL_PERMISSIONS] },
    { id: 2, name: 'BranchManager', permissions: [...MOCK_MANAGER_PERMISSIONS] },
    { id: 3, name: 'Receptionist', permissions: ['Booking.View', 'Booking.Cancel', 'Session.View', 'Availability.View'] },
  ];

  users: MockUser[] = [
    this.user(1, 'Omar Khaled', 'admin@odel.com', 1, true, '1029005195'),
    this.user(2, 'Layla Hassan', 'manager@odel.com', 2, true, '1006677889'),
    this.user(3, 'Karim Adel', 'karim.adel@odel.com', 2, true, '1112223344'),
    this.user(4, 'Nour Elsayed', 'nour.elsayed@odel.com', 3, true, '1223334455'),
    this.user(5, 'Youssef Nabil', 'youssef.nabil@odel.com', 3, false, '1550001122'),
    this.user(6, 'Mona Fathy', 'mona.fathy@odel.com', 3, true, '1017788990'),
    this.user(7, 'Hady Mahmoud', 'hady.mahmoud@odel.com', 2, false, '1099887766'),
    this.user(8, 'Salma Ragab', 'salma.ragab@odel.com', 3, true, '1144556677'),
    this.user(9, 'Adham Saeed', 'adham.saeed@odel.com', 3, true, '1233221100'),
    this.user(10, 'Dina Wagdy', 'dina.wagdy@odel.com', 2, true, '1066554433'),
    this.user(11, 'Tarek Fawzy', 'tarek.fawzy@odel.com', 3, true, '1188776655'),
    this.user(12, 'Rana Mostafa', 'rana.mostafa@odel.com', 3, false, '1011223355'),
  ];

  branches: MockBranch[] = [
    this.branch(1, 'الزمالك', 'Zamalek', '8 Hassan Sabry St, Zamalek, Cairo', '+201020304050', [true, true, false], true, [4, 3, 1]),
    this.branch(2, 'المعادي', 'Maadi', 'Road 9, Maadi, Cairo', '+201112345678', [true, true, false], true, [5, 4, 1]),
    this.branch(3, 'مدينة نصر', 'Nasr City', '12 Abbas El Akkad St, Nasr City, Cairo', '+201001102194', [true, true, true], true, [6, 4, 2]),
    this.branch(4, 'مصر الجديدة', 'Heliopolis', '25 El Korba St, Heliopolis, Cairo', '+201223344556', [true, false, true], true, [3, 3, 0]),
    this.branch(5, 'القاهرة الجديدة', 'New Cairo', 'Tagamoa 1, Street 90, New Cairo', '+201551122334', [true, true, true], true, [8, 5, 3]),
    this.branch(6, 'الشيخ زايد', 'Sheikh Zayed', 'Arkan Plaza, Sheikh Zayed City, Giza', '+201066778899', [true, true, false], true, [4, 3, 2]),
    this.branch(7, 'السادس من أكتوبر', '6th of October', 'Mall of Egypt, 26th of July Corridor, 6th of October', '+201144556677', [true, false, true], true, [5, 4, 0]),
    this.branch(8, 'الدقي', 'Dokki', '14 Mesaha Square, Dokki, Giza', '+201288990011', [true, false, false], true, [2, 2, 0]),
    this.branch(9, 'المهندسين', 'Mohandessin', '30 Gameat El Dowal El Arabeya St, Mohandessin, Giza', '+201017788990', [true, true, false], false, [3, 2, 1]),
    this.branch(10, 'سموحة - الإسكندرية', 'Smouha, Alexandria', '45 Fawzy Moaz St, Smouha, Alexandria', '+201099887766', [true, true, true], true, [6, 4, 2]),
    this.branch(11, 'ستانلي - الإسكندرية', 'Stanley, Alexandria', 'Stanley Bridge Corniche, Alexandria', '+201233221100', [true, true, false], true, [4, 3, 1]),
    this.branch(12, 'طنطا', 'Tanta', '7 El Geish St, Tanta, Gharbia', '+201011223344', [true, false, false], false, [0, 0, 0]),
    this.branch(13, 'المنصورة', 'Mansoura', 'El Gomhoreya St, Mansoura, Dakahlia', '+201188776655', [true, true, false], false, [2, 1, 0]),
    this.branch(14, 'الغردقة', 'Hurghada', 'Sheraton Road, Hurghada, Red Sea', '+201555443322', [true, true, true], false, [1, 0, 0]),
  ];

  nextRoleId = 4;
  nextUserId = 13;

  roleName(id: number): string {
    return this.roles.find((r) => r.id === id)?.name ?? '';
  }

  private user(id: number, fullName: string, email: string, roleId: number, status: boolean, phoneNumber: string): MockUser {
    return { id, fullName, email, countryCode: '+20', phoneNumber, roleId, status, imageUrl: null };
  }

  /** `types` = [regular, vip, home]; `counts` = [barbers, regular chairs, VIP chairs]. */
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
      id, nameAr, nameEn, address, phone,
      allowsRegular: types[0], allowsVip: types[1], allowsHome: types[2],
      isVisible,
      barbersCount: counts[0], regularChairsCount: counts[1], vipChairsCount: counts[2],
    };
  }
}
