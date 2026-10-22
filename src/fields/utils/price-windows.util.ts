export interface TimeWindow {
  startTime: string;
  endTime: string;
}

export type PriceWindowsError =
  'EMPTY' | 'INVALID_RANGE' | 'OVERLAP' | 'GAP' | 'OUT_OF_RANGE';

export const EARLIEST_OPEN = '06:00';
export const LATEST_CLOSE = '23:00';

/** Normalises `HH:mm` and Postgres `HH:mm:ss` to `HH:mm` so values compare as plain strings. */
export const hhmm = (time: string): string => time.slice(0, 5);

export const openingHoursValid = (open: string, close: string): boolean =>
  hhmm(open) >= EARLIEST_OPEN &&
  hhmm(close) <= LATEST_CLOSE &&
  hhmm(open) < hhmm(close);

/**
 * The price windows must tile the opening hours exactly: start at `open`, end at `close`,
 * with no gap and no overlap in between. Returns the first problem found, or null.
 */
export function priceWindowsError(
  windows: TimeWindow[],
  open: string,
  close: string,
): PriceWindowsError | null {
  if (!windows.length) return 'EMPTY';
  const sorted = windows
    .map((w) => ({ start: hhmm(w.startTime), end: hhmm(w.endTime) }))
    .sort((a, b) => a.start.localeCompare(b.start));

  if (sorted.some((w) => w.start >= w.end)) return 'INVALID_RANGE';
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) return 'OVERLAP';
    if (sorted[i].start > sorted[i - 1].end) return 'GAP';
  }
  if (sorted[0].start !== hhmm(open) || sorted.at(-1)!.end !== hhmm(close))
    return 'OUT_OF_RANGE';
  return null;
}
