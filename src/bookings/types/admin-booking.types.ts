import type { BookingStatus } from '../../common/enums/booking-status.enum.js';
import type { BookingDetail } from '../mappers/booking-response.mapper.js';

export interface AdminBookingListItem {
  id: number;
  user: { id: number; name: string; email: string };
  field: { id: number; name: string };
  date: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  total: number;
  voucherCode: string | null;
  createdAt: Date;
}

export interface AdminBookingDetail extends BookingDetail {
  user: { id: number; name: string; email: string; phone: string | null };
  handledBy: { id: number; name: string } | null;
}

export interface CalendarEntry {
  bookingId: number;
  fieldId: number;
  fieldName: string;
  user: { id: number; name: string };
  /** Local date-time, e.g. `2030-01-17T18:00` */
  start: string;
  end: string;
  status: BookingStatus;
}
