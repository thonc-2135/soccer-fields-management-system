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
import {
  toAdminBookingDetail,
  toAdminBookingListItem,
  toCalendarEntry,
} from '../mappers/admin-booking-response.mapper.js';
import { hhmm } from '../mappers/booking-response.mapper.js';
import type {
  AdminBookingDetail,
  AdminBookingListItem,
  CalendarEntry,
} from '../types/admin-booking.types.js';
import { MAX_CALENDAR_DAYS, SORT_COLUMNS } from './admin-bookings.constants.js';
import type { CalendarQueryDto } from './dto/calendar-query.dto.js';
import type { ListAdminBookingsQueryDto } from './dto/list-admin-bookings-query.dto.js';

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
    const queryBuilder = this.createBookingQuery().leftJoinAndSelect(
      'booking.voucher',
      'voucher',
    );
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
      data: rows.map(toAdminBookingListItem),
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
    return toAdminBookingDetail(booking);
  }

  /** Every booking that occupies (or occupied) the pitch in the date range, for the calendar view. */
  async calendar(query: CalendarQueryDto): Promise<CalendarEntry[]> {
    if (!isValidDate(query.from) || !isValidDate(query.to))
      throw new UnprocessableEntityException('errors.INVALID_DATE');
    if (query.to < query.from)
      throw new UnprocessableEntityException('errors.INVALID_DATE_RANGE');
    if (query.to > addDays(query.from, MAX_CALENDAR_DAYS - 1))
      throw new UnprocessableEntityException('errors.DATE_RANGE_TOO_LONG');

    const queryBuilder = this.createBookingQuery()
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
    return rows.map(toCalendarEntry);
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
      await this.bookingsService.releaseResources(manager, [id]);
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

  /** Bookings joined with their customer and field, the base of every admin listing. */
  private createBookingQuery() {
    return this.bookings
      .createQueryBuilder('booking')
      .innerJoinAndSelect('booking.user', 'user')
      .innerJoinAndSelect('booking.field', 'field');
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
