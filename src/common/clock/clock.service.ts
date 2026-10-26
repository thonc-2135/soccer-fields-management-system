import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LocalDateTime {
  /** YYYY-MM-DD in the business timezone */
  date: string;
  /** minutes since local midnight */
  minutes: number;
}

/** Splits an instant into the calendar date / time of day of the given IANA timezone. */
export function localParts(instant: Date, timeZone: string): LocalDateTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Single source of "now" for business rules, so tests can freeze time. */
@Injectable()
export class ClockService {
  readonly timeZone: string;

  constructor(config: ConfigService) {
    this.timeZone = config.get<string>('APP_TIMEZONE', 'Asia/Ho_Chi_Minh');
  }

  now(): Date {
    return new Date();
  }

  /** Current date and time of day in the business timezone (bookings are local to the venue). */
  local(): LocalDateTime {
    return localParts(this.now(), this.timeZone);
  }
}
