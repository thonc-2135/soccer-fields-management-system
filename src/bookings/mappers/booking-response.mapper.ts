import type { BookingStatus } from '../../common/enums/booking-status.enum.js';
import { isWeekend, type PriceItem } from '../booking-calendar.js';
import type { Booking } from '../entities/booking.entity.js';

export interface BookingDetail {
  id: number;
  field: { id: number; name: string; address: string };
  date: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  isWeekend: boolean;
  priceBreakdown: PriceItem[];
  subtotal: number;
  discount: number;
  total: number;
  voucher: { code: string } | null;
  note: string | null;
  rejectReason: string | null;
  createdAt: Date;
}

export interface BookingListItem {
  id: number;
  field: { id: number; name: string; thumbnail: string | null };
  date: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  total: number;
  voucherCode: string | null;
  createdAt: Date;
}

export const hhmm = (time: string) => time.slice(0, 5);

/** Expects `field`, `voucher` and `priceItems` to be loaded. */
export function toBookingDetail(booking: Booking): BookingDetail {
  return {
    id: booking.id,
    field: {
      id: booking.field.id,
      name: booking.field.name,
      address: booking.field.address,
    },
    date: booking.bookingDate,
    startTime: hhmm(booking.startTime),
    endTime: hhmm(booking.endTime),
    status: booking.status,
    isWeekend: isWeekend(booking.bookingDate),
    priceBreakdown: [...booking.priceItems]
      .sort((left, right) => left.fromTime.localeCompare(right.fromTime))
      .map((item) => ({
        from: hhmm(item.fromTime),
        to: hhmm(item.toTime),
        unitPrice: item.unitPrice,
        minutes: item.minutes,
        amount: item.amount,
      })),
    subtotal: booking.subtotal,
    discount: booking.discount,
    total: booking.total,
    voucher: booking.voucher ? { code: booking.voucher.code } : null,
    note: booking.note,
    rejectReason: booking.rejectReason,
    createdAt: booking.createdAt,
  };
}

export function toBookingListItem(
  booking: Booking,
  thumbnail: string | null,
): BookingListItem {
  return {
    id: booking.id,
    field: { id: booking.field.id, name: booking.field.name, thumbnail },
    date: booking.bookingDate,
    startTime: hhmm(booking.startTime),
    endTime: hhmm(booking.endTime),
    status: booking.status,
    total: booking.total,
    voucherCode: booking.voucher?.code ?? null,
    createdAt: booking.createdAt,
  };
}
