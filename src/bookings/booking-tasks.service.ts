import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ClockService } from '../common/clock/clock.service.js';
import { DEFAULT_MAIL_LANG } from '../mail/mail.constants.js';
import { MailQueueService } from '../mail/mail-queue.service.js';
import { RedisService } from '../redis/redis.service.js';
import { toHHmm } from './booking-calendar.js';
import { BookingsService } from './bookings.service.js';

const BATCH_SIZE = 200;
/** Longer than any run should take, shorter than the interval so a crashed run does not block the next. */
const LOCK_SECONDS = 120;

interface ExpiredBooking {
  id: number;
  voucher_id: number | null;
  email: string;
  name: string;
  field_name: string;
  booking_date: string;
  start_time: string;
  end_time: string;
}

/** Periodic housekeeping of bookings. Each job takes a Redis lock so only one instance runs it. */
@Injectable()
export class BookingTasksService {
  private readonly logger = new Logger(BookingTasksService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly clock: ClockService,
    private readonly redis: RedisService,
    private readonly bookingsService: BookingsService,
    private readonly mailQueue: MailQueueService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'expire-pending-bookings' })
  async runExpirePending(): Promise<void> {
    await this.withLock('expire-pending', () => this.expirePending());
  }

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'complete-bookings' })
  async runCompleteFinished(): Promise<void> {
    await this.withLock('complete-finished', () => this.completeFinished());
  }

  /** PENDING bookings whose start time has passed can no longer be approved: cancel them. */
  async expirePending(): Promise<number> {
    const now = this.clock.local();
    const candidates = (await this.dataSource.query(
      `SELECT booking.id, booking.voucher_id, booking.booking_date, booking.start_time, booking.end_time,
              "user".email, "user".name, field.name AS field_name
       FROM bookings booking
       JOIN users "user" ON "user".id = booking.user_id
       JOIN fields field ON field.id = booking.field_id
       WHERE booking.status = 'PENDING'
         AND (booking.booking_date < $1 OR (booking.booking_date = $1 AND booking.start_time <= $2::time))
       ORDER BY booking.id
       LIMIT ${BATCH_SIZE}`,
      [now.date, toHHmm(now.minutes)],
    )) as ExpiredBooking[];

    let expired = 0;
    for (const candidate of candidates) {
      const cancelled = await this.dataSource.transaction(async (manager) => {
        // the status condition keeps this safe against an admin deciding the booking right now
        const updateResult = await manager.query(
          `UPDATE bookings SET status = 'CANCELLED', updated_at = now()
           WHERE id = $1 AND status = 'PENDING' RETURNING id`,
          [candidate.id],
        );
        if (!updateResult[0]?.length) return false;
        await this.bookingsService.releaseResources(
          manager,
          candidate.id,
          candidate.voucher_id,
        );
        return true;
      });
      if (!cancelled) continue;
      expired += 1;
      try {
        await this.mailQueue.sendBookingExpired({
          to: candidate.email,
          name: candidate.name,
          fieldName: candidate.field_name,
          date: candidate.booking_date,
          startTime: candidate.start_time.slice(0, 5),
          endTime: candidate.end_time.slice(0, 5),
          lang: DEFAULT_MAIL_LANG,
        });
      } catch (error) {
        this.logger.error(
          `Could not queue expiry mail for booking ${candidate.id}`,
          error as Error,
        );
      }
    }
    if (expired) this.logger.log(`Expired ${expired} pending booking(s)`);
    return expired;
  }

  /** APPROVED bookings whose end time has passed are done. */
  async completeFinished(): Promise<number> {
    const now = this.clock.local();
    const updateResult = await this.dataSource.query(
      `UPDATE bookings SET status = 'COMPLETED', updated_at = now()
       WHERE status = 'APPROVED'
         AND (booking_date < $1 OR (booking_date = $1 AND end_time <= $2::time))
       RETURNING id`,
      [now.date, toHHmm(now.minutes)],
    );
    const completed = (updateResult[0] as unknown[]).length;
    if (completed) this.logger.log(`Completed ${completed} booking(s)`);
    return completed;
  }

  private async withLock(
    name: string,
    job: () => Promise<number>,
  ): Promise<void> {
    try {
      await this.redis.runExclusive(`cron:${name}`, LOCK_SECONDS, job);
    } catch (error) {
      // a failed run is simply retried at the next tick
      this.logger.error(`Job ${name} failed`, error as Error);
    }
  }
}
