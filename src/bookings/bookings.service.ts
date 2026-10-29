import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { ClockService } from '../common/clock/clock.service.js';
import { buildMeta } from '../common/dto/pagination-query.dto.js';
import { BookingStatus } from '../common/enums/booking-status.enum.js';
import { FieldStatus } from '../common/enums/field-status.enum.js';
import type { PaginatedResult } from '../common/interceptors/response.interceptor.js';
import { FieldPrice } from '../fields/entities/field-price.entity.js';
import { Field } from '../fields/entities/field.entity.js';
import { FieldsService } from '../fields/fields.service.js';
import { MailQueueService } from '../mail/mail-queue.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type { User } from '../users/entities/user.entity.js';
import { VouchersService } from '../vouchers/vouchers.service.js';
import {
  addDays,
  generateSlots,
  isValidDate,
  isWeekend,
  priceRange,
  sumAmounts,
  toHHmm,
  toMinutes,
} from './booking-calendar.js';
import type { AvailabilityQueryDto } from './dto/availability-query.dto.js';
import type { CreateBookingDto } from './dto/create-booking.dto.js';
import type { ListMyBookingsQueryDto } from './dto/list-my-bookings-query.dto.js';
import { BookingPriceItem } from './entities/booking-price-item.entity.js';
import { BookingSlot } from './entities/booking-slot.entity.js';
import { Booking } from './entities/booking.entity.js';
import {
  toBookingDetail,
  toBookingListItem,
  type BookingDetail,
  type BookingListItem,
} from './mappers/booking-response.mapper.js';
import type { BookingQuote, Quote, SlotStatus } from './types/booking.types.js';

export const MAX_ADVANCE_DAYS = 60;
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly dataSource: DataSource,
    private readonly clock: ClockService,
    private readonly settings: SettingsService,
    private readonly vouchers: VouchersService,
    private readonly fieldsService: FieldsService,
    private readonly mailQueue: MailQueueService,
  ) {}

  /** Slots of one day with their state and price, for the booking calendar. */
  async availability(fieldId: number, { date }: AvailabilityQueryDto) {
    if (!isValidDate(date))
      throw new BadRequestException('errors.INVALID_DATE');
    const manager = this.dataSource.manager;
    const field = await manager.findOne(Field, {
      where: { id: fieldId, status: FieldStatus.ACTIVE },
    });
    if (!field) throw new NotFoundException('errors.FIELD_NOT_FOUND');

    const [slotMinutes, surcharge, prices, taken] = await Promise.all([
      this.settings.getSlotMinutes(),
      this.settings.getWeekendSurchargePercent(),
      manager.find(FieldPrice, { where: { fieldId } }),
      manager.query(
        `SELECT booking_slot.slot_start, booking.status
         FROM booking_slots booking_slot JOIN bookings booking ON booking.id = booking_slot.booking_id
         WHERE booking_slot.field_id = $1 AND booking_slot.slot_date = $2`,
        [fieldId, date],
      ) as Promise<{ slot_start: string; status: BookingStatus }[]>,
    ]);

    const weekend = isWeekend(date);
    const takenBy = new Map(
      taken.map((takenSlot) => [
        takenSlot.slot_start.slice(0, 5),
        takenSlot.status,
      ]),
    );
    const now = this.clock.local();
    const windows = prices.map((price) => ({
      startTime: price.startTime,
      endTime: price.endTime,
      price: price.price,
    }));

    const slots = generateSlots(
      field.openTime,
      field.closeTime,
      slotMinutes,
    ).map((slot) => {
      const startTime = toHHmm(slot.start);
      const holder = takenBy.get(startTime);
      const inPast =
        date < now.date || (date === now.date && slot.start <= now.minutes);
      const status: SlotStatus = holder
        ? holder === BookingStatus.PENDING
          ? 'PENDING'
          : 'BOOKED'
        : inPast
          ? 'PAST'
          : 'AVAILABLE';
      return {
        startTime,
        endTime: toHHmm(slot.end),
        status,
        price: sumAmounts(
          priceRange(windows, slot.start, slot.end, weekend ? surcharge : 0),
        ),
      };
    });
    return { fieldId, date, isWeekend: weekend, slotMinutes, slots };
  }

  /** Price and validate a request without storing anything. */
  async preview(dto: CreateBookingDto, user: User): Promise<BookingQuote> {
    const manager = this.dataSource.manager;
    const quote = await this.buildQuote(dto, manager, false);
    await this.assertSlotsFree(manager, quote);
    const evaluation = dto.voucherCode
      ? await this.vouchers.evaluate(dto.voucherCode, quote.subtotal, user.id)
      : null;
    const discount = evaluation?.discount ?? 0;
    return {
      field: {
        id: quote.field.id,
        name: quote.field.name,
        address: quote.field.address,
      },
      date: quote.date,
      startTime: quote.startTime,
      endTime: quote.endTime,
      isWeekend: quote.isWeekend,
      weekendSurchargePercent: quote.weekendSurchargePercent,
      priceBreakdown: quote.items,
      subtotal: quote.subtotal,
      discount,
      total: quote.subtotal - discount,
      voucher: evaluation ? { code: evaluation.voucher.code } : null,
    };
  }

  /**
   * Everything happens in one transaction. Double booking is prevented by the unique index on
   * booking_slots (the loser of a race gets 409); the field row is share-locked so it cannot be
   * deleted meanwhile, and the voucher row is locked so its limits hold under concurrency.
   */
  async create(dto: CreateBookingDto, user: User): Promise<BookingDetail> {
    try {
      const id = await this.dataSource.transaction(async (manager) => {
        const quote = await this.buildQuote(dto, manager, true);
        let discount = 0;
        let voucherId: number | null = null;
        if (dto.voucherCode) {
          const evaluation = await this.vouchers.evaluate(
            dto.voucherCode,
            quote.subtotal,
            user.id,
            {
              manager: manager,
              lock: true,
            },
          );
          discount = evaluation.discount;
          voucherId = evaluation.voucher.id;
          await manager.query(
            'UPDATE vouchers SET used_count = used_count + 1 WHERE id = $1',
            [voucherId],
          );
        }

        const booking = await manager.save(
          manager.create(Booking, {
            userId: user.id,
            fieldId: quote.field.id,
            voucherId,
            bookingDate: quote.date,
            startTime: quote.startTime,
            endTime: quote.endTime,
            status: BookingStatus.PENDING,
            subtotal: quote.subtotal,
            discount,
            total: quote.subtotal - discount,
            note: dto.note ?? null,
          }),
        );
        await manager.insert(
          BookingSlot,
          quote.slotStarts.map((slotStart) => ({
            bookingId: booking.id,
            fieldId: quote.field.id,
            slotDate: quote.date,
            slotStart,
          })),
        );
        await manager.insert(
          BookingPriceItem,
          quote.items.map((item) => ({
            bookingId: booking.id,
            fromTime: item.from,
            toTime: item.to,
            unitPrice: item.unitPrice,
            minutes: item.minutes,
            amount: item.amount,
          })),
        );
        return booking.id;
      });
      return await this.getDetail(id, user.id);
    } catch (error) {
      if (this.isSlotConflict(error))
        throw new ConflictException('errors.SLOT_ALREADY_BOOKED');
      throw error;
    }
  }

  async findMine(
    userId: number,
    query: ListMyBookingsQueryDto,
  ): Promise<PaginatedResult<BookingListItem>> {
    const queryBuilder = this.bookings
      .createQueryBuilder('booking')
      .innerJoinAndSelect('booking.field', 'field')
      .leftJoinAndSelect('booking.voucher', 'voucher')
      .where('booking.user_id = :userId', { userId });
    if (query.status)
      queryBuilder.andWhere('booking.status = :status', {
        status: query.status,
      });
    if (query.fromDate)
      queryBuilder.andWhere('booking.booking_date >= :fromDate', {
        fromDate: query.fromDate,
      });
    if (query.toDate)
      queryBuilder.andWhere('booking.booking_date <= :toDate', {
        toDate: query.toDate,
      });

    const [rows, total] = await queryBuilder
      .orderBy('booking.created_at', 'DESC')
      .addOrderBy('booking.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    const thumbnails = await this.fieldsService.thumbnailsFor([
      ...new Set(rows.map((row) => row.fieldId)),
    ]);
    return {
      data: rows.map((booking) =>
        toBookingListItem(booking, thumbnails.get(booking.fieldId) ?? null),
      ),
      meta: buildMeta(query.page, query.limit, total),
    };
  }

  /** A booking is only visible to its owner; anyone else gets 404 so ids cannot be probed. */
  async getDetail(id: number, userId: number): Promise<BookingDetail> {
    const booking = await this.bookings.findOne({
      where: { id, userId },
      relations: { field: true, voucher: true, priceItems: true },
    });
    if (!booking) throw new NotFoundException('errors.BOOKING_NOT_FOUND');
    return toBookingDetail(booking);
  }

  /** Users can only cancel bookings still waiting for admin approval. */
  async cancel(id: number, user: User, lang: string): Promise<BookingDetail> {
    const booking = await this.bookings.findOne({
      where: { id, userId: user.id },
      relations: { field: true },
    });
    if (!booking) throw new NotFoundException('errors.BOOKING_NOT_FOUND');

    await this.dataSource.transaction(async (manager) => {
      // the status condition makes this race-safe against a concurrent admin approval
      const updateResult = await manager.query(
        `UPDATE bookings SET status = 'CANCELLED', updated_at = now()
         WHERE id = $1 AND status = 'PENDING' RETURNING id`,
        [id],
      );
      if (!updateResult[0]?.length)
        throw new UnprocessableEntityException(
          'errors.BOOKING_NOT_CANCELLABLE',
        );
      await this.releaseResources(manager, [booking.id]);
    });

    try {
      await this.mailQueue.sendBookingCancelled({
        to: user.email,
        name: user.name,
        fieldName: booking.field.name,
        date: booking.bookingDate,
        startTime: booking.startTime.slice(0, 5),
        endTime: booking.endTime.slice(0, 5),
        lang,
      });
    } catch (error) {
      // the booking is already cancelled; a lost notification must not undo that
      this.logger.error(
        `Could not queue cancellation mail for booking ${id}`,
        error as Error,
      );
    }
    return this.getDetail(id, user.id);
  }

  /**
   * Frees the time slots and gives the voucher use back for cancelled / rejected / expired
   * bookings. Takes many ids so batch jobs need a constant number of queries.
   */
  async releaseResources(
    manager: EntityManager,
    bookingIds: number[],
  ): Promise<void> {
    if (!bookingIds.length) return;
    await manager.delete(BookingSlot, { bookingId: In(bookingIds) });
    await manager.query(
      `UPDATE vouchers SET used_count = GREATEST(vouchers.used_count - usage.count, 0)
       FROM (
         SELECT voucher_id, COUNT(*)::int AS count FROM bookings
         WHERE id = ANY($1::int[]) AND voucher_id IS NOT NULL
         GROUP BY voucher_id
       ) usage
       WHERE vouchers.id = usage.voucher_id`,
      [bookingIds],
    );
  }

  private async buildQuote(
    dto: CreateBookingDto,
    manager: EntityManager,
    lock: boolean,
  ): Promise<Quote> {
    if (!isValidDate(dto.date))
      throw new BadRequestException('errors.INVALID_DATE');

    const fieldQb = manager
      .createQueryBuilder(Field, 'field')
      .where('field.id = :id AND field.status = :status', {
        id: dto.fieldId,
        status: FieldStatus.ACTIVE,
      });
    if (lock) fieldQb.setLock('pessimistic_read');
    const field = await fieldQb.getOne();
    if (!field) throw new NotFoundException('errors.FIELD_NOT_FOUND');

    const now = this.clock.local();
    if (dto.date < now.date)
      throw new UnprocessableEntityException('errors.SLOT_IN_PAST');
    if (dto.date > addDays(now.date, MAX_ADVANCE_DAYS))
      throw new UnprocessableEntityException('errors.DATE_TOO_FAR');

    const [slotMinutes, surcharge, prices] = await Promise.all([
      this.settings.getSlotMinutes(),
      this.settings.getWeekendSurchargePercent(),
      manager.find(FieldPrice, { where: { fieldId: field.id } }),
    ]);

    const grid = generateSlots(field.openTime, field.closeTime, slotMinutes);
    const first = grid.findIndex(
      (slot) => slot.start === toMinutes(dto.startTime),
    );
    if (first < 0 || first + dto.slots > grid.length)
      throw new UnprocessableEntityException('errors.SLOT_INVALID');
    const chosen = grid.slice(first, first + dto.slots);
    if (dto.date === now.date && chosen[0].start <= now.minutes) {
      throw new UnprocessableEntityException('errors.SLOT_IN_PAST');
    }

    const weekend = isWeekend(dto.date);
    const percent = weekend ? surcharge : 0;
    const items = priceRange(
      prices.map((price) => ({
        startTime: price.startTime,
        endTime: price.endTime,
        price: price.price,
      })),
      chosen[0].start,
      chosen.at(-1)!.end,
      percent,
    );
    return {
      field,
      date: dto.date,
      startTime: toHHmm(chosen[0].start),
      endTime: toHHmm(chosen.at(-1)!.end),
      slotStarts: chosen.map((slot) => toHHmm(slot.start)),
      items,
      subtotal: sumAmounts(items),
      isWeekend: weekend,
      weekendSurchargePercent: percent,
    };
  }

  private async assertSlotsFree(
    manager: EntityManager,
    quote: Quote,
  ): Promise<void> {
    const taken = await manager.query(
      `SELECT 1 FROM booking_slots
       WHERE field_id = $1 AND slot_date = $2 AND slot_start = ANY($3::time[]) LIMIT 1`,
      [quote.field.id, quote.date, quote.slotStarts],
    );
    if (taken.length) throw new ConflictException('errors.SLOT_ALREADY_BOOKED');
  }

  private isSlotConflict(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driver = error.driverError as
      { code?: string; constraint?: string } | undefined;
    return (
      driver?.code === UNIQUE_VIOLATION &&
      driver.constraint === 'uq_booking_slots_field_date_start'
    );
  }
}
