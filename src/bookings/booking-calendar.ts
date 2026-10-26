/** Pure date / slot / price helpers used by the booking flow (no I/O, easy to unit test). */

export const toMinutes = (hhmm: string): number =>
  Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export const toHHmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export interface Slot {
  /** minutes since midnight */
  start: number;
  end: number;
}

/** Back-to-back slots from opening time; a leftover shorter than one slot at closing is unused. */
export function generateSlots(
  open: string,
  close: string,
  slotMinutes: number,
): Slot[] {
  const slots: Slot[] = [];
  for (
    let start = toMinutes(open);
    start + slotMinutes <= toMinutes(close);
    start += slotMinutes
  ) {
    slots.push({ start, end: start + slotMinutes });
  }
  return slots;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(date: string): boolean {
  const match = DATE_RE.exec(date);
  if (!match) return false;
  const utcDate = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  return (
    utcDate.getUTCFullYear() === +match[1] &&
    utcDate.getUTCMonth() === +match[2] - 1 &&
    utcDate.getUTCDate() === +match[3]
  );
}

/** Saturday or Sunday of a calendar date (timezone independent). */
export function isWeekend(date: string): boolean {
  const [year, month, dayOfMonth] = date.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

export function addDays(date: string, days: number): string {
  const [year, month, dayOfMonth] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, dayOfMonth + days))
    .toISOString()
    .slice(0, 10);
}

export interface PriceWindow {
  startTime: string;
  endTime: string;
  /** VND per hour */
  price: number;
}

export interface PriceItem {
  from: string;
  to: string;
  unitPrice: number;
  minutes: number;
  amount: number;
}

/**
 * Prices [startMin, endMin) minute by minute against the field's price windows, so a slot
 * that straddles two windows is charged pro rata. `surchargePercent` (weekend) is folded
 * into the hourly price, which keeps `sum(amount)` equal to the booking subtotal.
 */
export function priceRange(
  windows: PriceWindow[],
  startMin: number,
  endMin: number,
  surchargePercent = 0,
): PriceItem[] {
  const items: PriceItem[] = [];
  const sorted = [...windows].sort((left, right) =>
    left.startTime.localeCompare(right.startTime),
  );
  for (const window of sorted) {
    const from = Math.max(startMin, toMinutes(window.startTime));
    const to = Math.min(endMin, toMinutes(window.endTime));
    if (to <= from) continue;
    const unitPrice = Math.round(window.price * (1 + surchargePercent / 100));
    const minutes = to - from;
    items.push({
      from: toHHmm(from),
      to: toHHmm(to),
      unitPrice,
      minutes,
      amount: Math.round((unitPrice * minutes) / 60),
    });
  }
  const covered = items.reduce((sum, item) => sum + item.minutes, 0);
  if (covered !== endMin - startMin)
    throw new Error('Price windows do not cover the requested time range');
  return items;
}

export const sumAmounts = (items: PriceItem[]): number =>
  items.reduce((sum, item) => sum + item.amount, 0);
