import { StatusBadgeVariant } from '../components/status-badge/status-badge.component';

/** Active/inactive style flags (branches, barbers, chairs, offers). */
export function activeBadgeVariant(isActive: boolean): StatusBadgeVariant {
  return isActive ? 'success' : 'neutral';
}

/** Booking lifecycle (Sprint 4): pending → confirmed → in progress → completed / cancelled / no-show. */
export type BookingStatus = 'pending' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';

const BOOKING_VARIANTS: Record<BookingStatus, StatusBadgeVariant> = {
  pending: 'warning',
  confirmed: 'success',
  'in-progress': 'info',
  completed: 'neutral',
  cancelled: 'danger',
  'no-show': 'danger',
};

export function bookingBadgeVariant(status: BookingStatus): StatusBadgeVariant {
  return BOOKING_VARIANTS[status] ?? 'neutral';
}
