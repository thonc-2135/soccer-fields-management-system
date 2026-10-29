import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ClockService } from '../common/clock/clock.service.js';
import { ActivityType } from '../common/enums/activity-type.enum.js';
import { DEFAULT_MAIL_LANG } from '../mail/mail.constants.js';
import { MailQueueService } from '../mail/mail-queue.service.js';
import { RedisService } from '../redis/redis.service.js';
import { toHHmm } from './booking-calendar.js';
import {
  CRON_LOCK_SECONDS,
  EXPIRE_BATCH_SIZE,
  MAX_EXPIRE_BATCHES,
} from './booking-tasks.constants.js';
import { emitBookingActivity } from './booking-activity.js';
import { BookingsService } from './bookings.service.js';

interface ExpiredBooking {
  id: number;
  user_id: number;
  field_id: number;
  booking_date: string;
  start_time: string;
  end_time: string;
  email: string;
  name: string;
  field_name: string;
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
    private readonly events: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'expire-pending-bookings' })
  async runExpirePending(): Promise<void> {
    await this.withLock('expire-pending', () => this.expirePending());
  }

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'complete-bookings' })
  async runCompleteFinished(): Promise<void> {
    await this.withLock('complete-finished', () => this.completeFinished());
  }

  /**
   * PENDING bookings whose start time has passed can no longer be approved: cancel them.
   * Works in batches; each batch is one transaction with a fixed number of queries
   * (cancel, free slots, give vouchers back, load mail data), however many bookings it holds.
   */
  async expirePending(): Promise<number> {
    let expired = 0;
    for (let batch = 0; batch < MAX_EXPIRE_BATCHES; batch += 1) {
      const cancelled = await this.expireBatch();
      expired += cancelled;
      if (cancelled < EXPIRE_BATCH_SIZE) break;
    }
    if (expired) this.logger.log(`Expired ${expired} pending booking(s)`);
    return expired;
  }

  private async expireBatch(): Promise<number> {
    const now = this.clock.local();
    const expired = await this.dataSource.transaction(async (manager) => {
      // SKIP LOCKED leaves bookings an admin is deciding right now to that admin
      const [cancelledRows] = (await manager.query(
        `UPDATE bookings SET status = 'CANCELLED', updated_at = now()
         WHERE id IN (
           SELECT id FROM bookings
           WHERE status = 'PENDING'
             AND (booking_date < $1 OR (booking_date = $1 AND start_time <= $2::time))
           ORDER BY id
           LIMIT ${EXPIRE_BATCH_SIZE}
           FOR UPDATE SKIP LOCKED
         ) AND status = 'PENDING'
         RETURNING id`,
        [now.date, toHHmm(now.minutes)],
      )) as [{ id: number }[]];
      const ids = cancelledRows.map((row) => row.id);
      if (!ids.length) return [];

      await this.bookingsService.releaseResources(manager, ids);
      return (await manager.query(
        `SELECT booking.id, booking.user_id, booking.field_id, booking.booking_date, booking.start_time, booking.end_time,
                "user".email, "user".name, field.name AS field_name
         FROM bookings booking
         JOIN users "user" ON "user".id = booking.user_id
         JOIN fields field ON field.id = booking.field_id
         WHERE booking.id = ANY($1::int[])`,
        [ids],
      )) as ExpiredBooking[];
    });

    for (const booking of expired) {
      emitBookingActivity(
        this.events,
        ActivityType.BOOKING_CANCELLED,
        {
          id: booking.id,
          userId: booking.user_id,
          fieldId: booking.field_id,
          bookingDate: booking.booking_date,
          startTime: booking.start_time,
          endTime: booking.end_time,
        },
        { reason: 'EXPIRED' },
      );
    }
    try {
      await this.mailQueue.sendBookingsExpired(
        expired.map((booking) => ({
          to: booking.email,
          name: booking.name,
          fieldName: booking.field_name,
          date: booking.booking_date,
          startTime: booking.start_time.slice(0, 5),
          endTime: booking.end_time.slice(0, 5),
          lang: DEFAULT_MAIL_LANG,
        })),
      );
    } catch (error) {
      // the bookings are already cancelled; a lost notification must not undo that
      this.logger.error(
        `Could not queue expiry mails for ${expired.length} booking(s)`,
        error as Error,
      );
    }
    return expired.length;
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
      await this.redis.runExclusive(`cron:${name}`, CRON_LOCK_SECONDS, job);
    } catch (error) {
      // a failed run is simply retried at the next tick
      this.logger.error(`Job ${name} failed`, error as Error);
    }
  }
}
