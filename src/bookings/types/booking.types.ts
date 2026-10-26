import type { Field } from '../../fields/entities/field.entity.js';
import type { PriceItem } from '../booking-calendar.js';

/** The priced, validated outcome of a booking request, before anything is stored. */
export interface Quote {
  field: Field;
  date: string;
  startTime: string;
  endTime: string;
  slotStarts: string[];
  items: PriceItem[];
  subtotal: number;
  isWeekend: boolean;
  weekendSurchargePercent: number;
}

export interface BookingQuote {
  field: { id: number; name: string; address: string };
  date: string;
  startTime: string;
  endTime: string;
  isWeekend: boolean;
  weekendSurchargePercent: number;
  priceBreakdown: PriceItem[];
  subtotal: number;
  discount: number;
  total: number;
  voucher: { code: string } | null;
}

export type SlotStatus = 'AVAILABLE' | 'PENDING' | 'BOOKED' | 'PAST';
