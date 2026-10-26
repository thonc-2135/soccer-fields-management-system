import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ClockService } from '../../common/clock/clock.service.js';
import { buildMeta } from '../../common/dto/pagination-query.dto.js';
import { BookingStatus } from '../../common/enums/booking-status.enum.js';
import type { PaginatedResult } from '../../common/interceptors/response.interceptor.js';
import { escapeLike } from '../../common/utils/escape-like.util.js';
import { MailQueueService } from '../../mail/mail-queue.service.js';
import type { User } from '../../users/entities/user.entity.js';
import { addDays, isValidDate } from '../booking-calendar.js';
import { BookingsService } from '../bookings.service.js';
import { Booking } from '../entities/booking.entity.js';
import { toBookingDetail } from '../mappers/booking-response.mapper.js';
import type {
  AdminBookingDetail,
  AdminBookingListItem,
  CalendarEntry,
} from '../types/admin-booking.types.js';
import type { CalendarQueryDto } from './dto/calendar-query.dto.js';
import type { ListAdminBookingsQueryDto } from './dto/list-admin-bookings-query.dto.js';

export const MAX_CALENDAR_DAYS = 62;

const SORT_COLUMNS = {
  'createdAt:desc': ['booking.created_at', 'DESC'],
  'createdAt:asc': ['booking.created_at', 'ASC'],
  'date:desc': ['booking.booking_date', 'DESC'],
  'date:asc': ['booking.booking_date', 'ASC'],
} as const;

const hhmm = (time: string) => time.slice(0, 5);

@Injectable()
export class AdminBookingsService {
  private readonly logger = new Logger(AdminBookingsService.name);

  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly dataSource: DataSource,
    private readonly clock: ClockService,
    private readonly bookingsService: BookingsService,
    private readonly mailQueue: MailQueueService,
  ) {}

  async findAll(
    query: ListAdminBookingsQueryDto,
  ): Promise<PaginatedResult<AdminBookingListItem>> {
    const queryBuilder = this.bookings
      .createQueryBuilder('booking')
      .innerJoinAndSelect('booking.user', 'user')
      .innerJoinAndSelect('booking.field', 'field')
      .leftJoinAndSelect('booking.voucher', 'voucher');
    if (query.status)
      queryBuilder.andWhere('booking.status = :status', {
        status: query.status,
      });
    if (query.fieldId)
      queryBuilder.andWhere('booking.field_id = :fieldId', {
        fieldId: query.fieldId,
      });
    if (query.userId)
      queryBuilder.andWhere('booking.user_id = :userId', {
        userId: query.userId,
      });
    if (query.fromDate)
      queryBuilder.andWhere('booking.booking_date >= :fromDate', {
        fromDate: query.fromDate,
      });
    if (query.toDate)
      queryBuilder.andWhere('booking.booking_date <= :toDate', {
        toDate: query.toDate,
      });
    // created_at is a timestamptz: compare against the local day, not the UTC one
    if (query.createdFrom)
      queryBuilder.andWhere(
        `(booking.created_at AT TIME ZONE :timeZone)::date >= :createdFrom`,
        { createdFrom: query.createdFrom, timeZone: this.clock.timeZone },
      );
    if (query.createdTo)
      queryBuilder.andWhere(
        `(booking.created_at AT TIME ZONE :timeZone)::date <= :createdTo`,
        { createdTo: query.createdTo, timeZone: this.clock.timeZone },
      );
    if (query.keyword) {
      queryBuilder.andWhere(
        `(immutable_unaccent(user.name) ILIKE immutable_unaccent(:keyword) OR user.email ILIKE :keyword)`,
        { keyword: `%${escapeLike(query.keyword)}%` },
      );
    }

    const [column, direction] = SORT_COLUMNS[query.sort];
    const [rows, total] = await queryBuilder
      .orderBy(column, direction)
      .addOrderBy('booking.id', direction)
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      data: rows.map((booking) => ({
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
      })),
      meta: buildMeta(query.page, query.limit, total),
    };
  }

  async findOne(id: number): Promise<AdminBookingDetail> {
    const booking = await this.bookings.findOne({
      where: { id },
      relations: {
        user: true,
        field: true,
        voucher: true,
        priceItems: true,
        handler: true,
      },
    });
    if (!booking) throw new NotFoundException('errors.BOOKING_NOT_FOUND');
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

  /** Every booking that occupies (or occupied) the pitch in the date range, for the calendar view. */
  async calendar(query: CalendarQueryDto): Promise<CalendarEntry[]> {
    if (!isValidDate(query.from) || !isValidDate(query.to))
      throw new UnprocessableEntityException('errors.INVALID_DATE');
    if (query.to < query.from)
      throw new UnprocessableEntityException('errors.INVALID_DATE_RANGE');
    if (query.to > addDays(query.from, MAX_CALENDAR_DAYS - 1))
      throw new UnprocessableEntityException('errors.DATE_RANGE_TOO_LONG');

    const queryBuilder = this.bookings
      .createQueryBuilder('booking')
      .innerJoinAndSelect('booking.user', 'user')
      .innerJoinAndSelect('booking.field', 'field')
      .where('booking.booking_date BETWEEN :from AND :to', {
        from: query.from,
        to: query.to,
      })
      .andWhere('booking.status IN (:...statuses)', {
        statuses: [
          BookingStatus.PENDING,
          BookingStatus.APPROVED,
          BookingStatus.COMPLETED,
        ],
      });
    if (query.fieldId)
      queryBuilder.andWhere('booking.field_id = :fieldId', {
        fieldId: query.fieldId,
      });

    const rows = await queryBuilder
      .orderBy('booking.booking_date', 'ASC')
      .addOrderBy('booking.start_time', 'ASC')
      .addOrderBy('booking.id', 'ASC')
      .getMany();
    return rows.map((booking) => ({
      bookingId: booking.id,
      fieldId: booking.field.id,
      fieldName: booking.field.name,
      user: { id: booking.user.id, name: booking.user.name },
      start: `${booking.bookingDate}T${hhmm(booking.startTime)}`,
      end: `${booking.bookingDate}T${hhmm(booking.endTime)}`,
      status: booking.status,
    }));
  }

  async approve(
    id: number,
    admin: User,
    lang: string,
  ): Promise<AdminBookingDetail> {
    const booking = await this.dataSource.transaction(async (manager) => {
      const locked = await this.lockPendingBooking(manager, id);
      const now = this.clock.local();
      const startMinutes =
        Number(locked.startTime.slice(0, 2)) * 60 +
        Number(locked.startTime.slice(3, 5));
      if (
        locked.bookingDate < now.date ||
        (locked.bookingDate === now.date && startMinutes <= now.minutes)
      )
        throw new UnprocessableEntityException(
          'errors.BOOKING_ALREADY_STARTED',
        );

      // a PENDING booking holds its slots; make sure nothing released them behind our back
      const [{ held }] = (await manager.query(
        `SELECT COUNT(*)::int AS held FROM booking_slots WHERE booking_id = $1`,
        [id],
      )) as { held: number }[];
      if (held === 0) throw new ConflictException('errors.BOOKING_SLOTS_LOST');

      await manager.update(
        Booking,
        { id },
        { status: BookingStatus.APPROVED, handledBy: admin.id },
      );
      return locked;
    });

    await this.notify(id, () =>
      this.mailQueue.sendBookingApproved({
        ...this.mailDetails(booking),
        lang,
      }),
    );
    return this.findOne(id);
  }

  async reject(
    id: number,
    reason: string,
    admin: User,
    lang: string,
  ): Promise<AdminBookingDetail> {
    const booking = await this.dataSource.transaction(async (manager) => {
      const locked = await this.lockPendingBooking(manager, id);
      await manager.update(
        Booking,
        { id },
        {
          status: BookingStatus.REJECTED,
          rejectReason: reason,
          handledBy: admin.id,
        },
      );
      await this.bookingsService.releaseResources(
        manager,
        id,
        locked.voucherId,
      );
      return locked;
    });

    await this.notify(id, () =>
      this.mailQueue.sendBookingRejected({
        ...this.mailDetails(booking),
        reason,
        lang,
      }),
    );
    return this.findOne(id);
  }

  /**
   * Row-locks the booking so a concurrent user cancellation or another admin cannot decide
   * the same booking at the same time; the loser sees the new status and gets 422.
   */
  private async lockPendingBooking(
    manager: DataSource['manager'],
    id: number,
  ): Promise<Booking> {
    const booking = await manager
      .createQueryBuilder(Booking, 'booking')
      .innerJoinAndSelect('booking.user', 'user')
      .innerJoinAndSelect('booking.field', 'field')
      .where('booking.id = :id', { id })
      .setLock('pessimistic_write', undefined, ['booking'])
      .getOne();
    if (!booking) throw new NotFoundException('errors.BOOKING_NOT_FOUND');
    if (booking.status !== BookingStatus.PENDING)
      throw new UnprocessableEntityException('errors.BOOKING_NOT_PENDING');
    return booking;
  }

  private mailDetails(booking: Booking) {
    return {
      to: booking.user.email,
      name: booking.user.name,
      fieldName: booking.field.name,
      date: booking.bookingDate,
      startTime: hhmm(booking.startTime),
      endTime: hhmm(booking.endTime),
    };
  }

  /** The decision is already committed; a lost notification must not turn it into an error. */
  private async notify(id: number, send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error) {
      this.logger.error(
        `Could not queue notification mail for booking ${id}`,
        error as Error,
      );
    }
  }
}
