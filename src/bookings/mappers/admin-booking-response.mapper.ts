import type {
  AdminBookingDetail,
  AdminBookingListItem,
  CalendarEntry,
} from '../types/admin-booking.types.js';
import type { Booking } from '../entities/booking.entity.js';
import { hhmm, toBookingDetail } from './booking-response.mapper.js';

/** Expects `user`, `field` and `voucher` to be loaded. */
export function toAdminBookingListItem(booking: Booking): AdminBookingListItem {
  return {
    id: booking.id,
    user: {
      id: booking.user.id,
      name: booking.user.name,
      email: booking.user.email,
    },
    field: { id: booking.field.id, name: booking.field.name },
    date: booking.bookingDate,
    startTime: hhmm(booking.startTime),
    endTime: hhmm(booking.endTime),
    status: booking.status,
    total: booking.total,
    voucherCode: booking.voucher?.code ?? null,
    createdAt: booking.createdAt,
  };
}

/** Expects `user`, `field`, `voucher`, `priceItems` and `handler` to be loaded. */
export function toAdminBookingDetail(booking: Booking): AdminBookingDetail {
  return {
    ...toBookingDetail(booking),
    user: {
      id: booking.user.id,
      name: booking.user.name,
      email: booking.user.email,
      phone: booking.user.phone,
    },
    handledBy: booking.handler
      ? { id: booking.handler.id, name: booking.handler.name }
      : null,
  };
}

/** Expects `user` and `field` to be loaded. */
export function toCalendarEntry(booking: Booking): CalendarEntry {
  return {
    bookingId: booking.id,
    fieldId: booking.field.id,
    fieldName: booking.field.name,
    user: { id: booking.user.id, name: booking.user.name },
    start: `${booking.bookingDate}T${hhmm(booking.startTime)}`,
    end: `${booking.bookingDate}T${hhmm(booking.endTime)}`,
    status: booking.status,
  };
}
