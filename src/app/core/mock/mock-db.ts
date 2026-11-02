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

  nextRoleId = 4;
  nextUserId = 13;

  roleName(id: number): string {
    return this.roles.find((r) => r.id === id)?.name ?? '';
  }

  private user(id: number, fullName: string, email: string, roleId: number, status: boolean, phoneNumber: string): MockUser {
    return { id, fullName, email, countryCode: '+20', phoneNumber, roleId, status, imageUrl: null };
  }
}
