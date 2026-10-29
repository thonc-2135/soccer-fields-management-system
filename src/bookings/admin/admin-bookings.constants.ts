import type { AdminBookingSort } from './dto/list-admin-bookings-query.dto.js';

/** Longest date range the admin calendar will serve in one request. */
export const MAX_CALENDAR_DAYS = 62;

export const SORT_COLUMNS: Record<AdminBookingSort, [string, 'ASC' | 'DESC']> =
  {
    'createdAt:desc': ['booking.created_at', 'DESC'],
    'createdAt:asc': ['booking.created_at', 'ASC'],
    'date:desc': ['booking.booking_date', 'DESC'],
    'date:asc': ['booking.booking_date', 'ASC'],
  };
