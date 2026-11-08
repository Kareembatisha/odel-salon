import { BookingStatus } from "@shared/utils/status-badge.util";

export type ChairType = "regular" | "vip";

export interface TodayBooking {
  id: number;
  /** 24h "HH:mm" start time. */
  time: string;
  customer: string;
  service: string;
  barber: string;
  chairType: ChairType;
  status: BookingStatus;
}

export interface ChairAvailability {
  type: ChairType;
  total: number;
  inUse: number;
  /** Chairs an admin has locked (maintenance) — excluded from availability. */
  locked: number;
}

export interface BarberOnShift {
  id: number;
  name: string;
  /** "free" = can take a booking now (green) · "busy" = in a session (red). */
  state: "free" | "busy";
  /** When a busy barber frees up ("HH:mm"). */
  freeAt?: string;
}

export interface DashboardSummary {
  bookingsToday: number;
  bookingsTrendPct: number;
  revenueToday: number;
  revenueTrendPct: number;
  averageRating: number;
  reviewCount: number;
  upcoming: TodayBooking[];
  chairs: ChairAvailability[];
  barbers: BarberOnShift[];
}
