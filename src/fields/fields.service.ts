import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import { buildMeta } from '../common/dto/pagination-query.dto.js';
import { FieldStatus } from '../common/enums/field-status.enum.js';
import type { PaginatedResult } from '../common/interceptors/response.interceptor.js';
import { escapeLike } from '../common/utils/escape-like.util.js';
import { SettingsService } from '../settings/settings.service.js';
import type {
  ListFieldsQueryDto,
  FieldSort,
} from './dto/list-fields-query.dto.js';
import { FieldImage } from './entities/field-image.entity.js';
import { FieldPrice } from './entities/field-price.entity.js';
import { FieldType } from './entities/field-type.entity.js';
import { Field } from './entities/field.entity.js';
import {
  toFieldListItem,
  toHHmm,
  type FieldDetail,
  type FieldListItem,
  type FieldListRow,
} from './mappers/field-response.mapper.js';

type OrderBy = [
  column: string,
  direction: 'ASC' | 'DESC',
  nulls?: 'NULLS LAST',
];

const ORDER_BY: Record<FieldSort, OrderBy[]> = {
  'createdAt:desc': [['f.created_at', 'DESC']],
  'name:asc': [['f.name', 'ASC']],
  'price:asc': [['pr.min_price', 'ASC', 'NULLS LAST']],
  'price:desc': [['pr.min_price', 'DESC', 'NULLS LAST']],
  'rating:desc': [
    ['f.avg_rating', 'DESC'],
    ['f.review_count', 'DESC'],
  ],
};

@Injectable()
export class FieldsService {
  constructor(
    @InjectRepository(Field) private readonly fields: Repository<Field>,
    @InjectRepository(FieldImage)
    private readonly images: Repository<FieldImage>,
    @InjectRepository(FieldPrice)
    private readonly prices: Repository<FieldPrice>,
    @InjectRepository(FieldType) private readonly types: Repository<FieldType>,
    private readonly settings: SettingsService,
  ) {}

  /**
   * One query returns the page (+ total via a window function); thumbnails and favourite
   * flags are then fetched for the whole page in one query each, so there is no N+1.
   */
  async findAll(
    query: ListFieldsQueryDto,
    userId?: number,
  ): Promise<PaginatedResult<FieldListItem>> {
    if (query.startTime && !query.date) {
      throw new BadRequestException('errors.START_TIME_REQUIRES_DATE');
    }
    const slotSeconds = (await this.settings.getSlotMinutes()) * 60;
    const qb = this.buildListQuery(query, slotSeconds);

    const rows = await qb
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getRawMany<FieldListRow>();

    // an out-of-range page has no rows to carry the window total
    const total = rows.length
      ? Number(rows[0].total)
      : query.page > 1
        ? await qb.getCount()
        : 0;
    const ids = rows.map((r) => r.id);
    const [thumbnails, favorites] = await Promise.all([
      this.thumbnailsFor(ids),
      this.favoritesFor(ids, userId),
    ]);

    return {
      data: rows.map((r) =>
        toFieldListItem(r, thumbnails.get(r.id) ?? null, favorites.has(r.id)),
      ),
      meta: buildMeta(query.page, query.limit, total),
    };
  }

  async findOne(id: number, userId?: number): Promise<FieldDetail> {
    const field = await this.fields.findOne({
      where: { id, status: FieldStatus.ACTIVE },
      relations: { type: true },
    });
    if (!field) throw new NotFoundException('errors.FIELD_NOT_FOUND');

    const [images, prices, favorites, slotMinutes, weekendSurchargePercent] =
      await Promise.all([
        this.images.find({
          where: { fieldId: id },
          order: { isThumbnail: 'DESC', sortOrder: 'ASC', id: 'ASC' },
        }),
        this.prices.find({
          where: { fieldId: id },
          order: { startTime: 'ASC' },
        }),
        this.favoritesFor([id], userId),
        this.settings.getSlotMinutes(),
        this.settings.getWeekendSurchargePercent(),
      ]);

    return {
      id: field.id,
      name: field.name,
      description: field.description,
      address: field.address,
      status: field.status,
      type: {
        id: field.type.id,
        name: field.type.name,
        capacity: field.type.capacity,
      },
      images: images.map((i) => ({
        id: i.id,
        url: i.url,
        isThumbnail: i.isThumbnail,
      })),
      prices: prices.map((p) => ({
        id: p.id,
        startTime: toHHmm(p.startTime),
        endTime: toHHmm(p.endTime),
        price: p.price,
      })),
      weekendSurchargePercent,
      slotMinutes,
      openTime: toHHmm(field.openTime),
      closeTime: toHHmm(field.closeTime),
      avgRating: field.avgRating,
      reviewCount: field.reviewCount,
      isFavorite: favorites.has(id),
    };
  }

  findTypes(): Promise<FieldType[]> {
    return this.types.find({ order: { capacity: 'ASC', id: 'ASC' } });
  }

  private buildListQuery(
    q: ListFieldsQueryDto,
    slotSeconds: number,
  ): SelectQueryBuilder<Field> {
    const qb = this.fields
      .createQueryBuilder('f')
      .innerJoin('f.type', 't')
      .leftJoin(
        (sub) =>
          sub
            .select('p.field_id', 'field_id')
            .addSelect('MIN(p.price)', 'min_price')
            .addSelect('MAX(p.price)', 'max_price')
            .from(FieldPrice, 'p')
            .groupBy('p.field_id'),
        'pr',
        'pr.field_id = f.id',
      )
      .select('f.id', 'id')
      .addSelect('f.name', 'name')
      .addSelect('f.address', 'address')
      .addSelect('f.avg_rating', 'avg_rating')
      .addSelect('f.review_count', 'review_count')
      .addSelect('t.id', 'type_id')
      .addSelect('t.name', 'type_name')
      .addSelect('pr.min_price', 'min_price')
      .addSelect('pr.max_price', 'max_price')
      .addSelect('COUNT(*) OVER()', 'total')
      .where('f.status = :status', { status: FieldStatus.ACTIVE });

    if (q.keyword) {
      qb.andWhere(
        '(immutable_unaccent(f.name) ILIKE immutable_unaccent(:kw) OR immutable_unaccent(f.address) ILIKE immutable_unaccent(:kw))',
        { kw: `%${escapeLike(q.keyword)}%` },
      );
    }
    if (q.typeId?.length)
      qb.andWhere('f.type_id IN (:...typeIds)', { typeIds: q.typeId });
    if (q.minPrice !== undefined)
      qb.andWhere('pr.max_price >= :minPrice', { minPrice: q.minPrice });
    if (q.maxPrice !== undefined)
      qb.andWhere('pr.min_price <= :maxPrice', { maxPrice: q.maxPrice });
    if (q.minRating !== undefined)
      qb.andWhere('f.avg_rating >= :minRating', { minRating: q.minRating });
    if (q.date) this.applyAvailability(qb, q.date, q.startTime, slotSeconds);

    ORDER_BY[q.sort].forEach(([col, dir, nulls], i) =>
      i === 0 ? qb.orderBy(col, dir, nulls) : qb.addOrderBy(col, dir, nulls),
    );
    // NULLS LAST keeps fields without prices at the end; the id tie-break makes paging stable
    return qb.addOrderBy('f.id', 'DESC');
  }

  /**
   * `date` alone: the field still has an unbooked slot that day.
   * `date` + `startTime`: that exact slot is bookable (on the slot grid, inside opening
   * hours) and not taken. Slots held by PENDING/APPROVED bookings live in booking_slots.
   */
  private applyAvailability(
    qb: SelectQueryBuilder<Field>,
    date: string,
    startTime: string | undefined,
    slotSeconds: number,
  ): void {
    const params = { date, slotSeconds, startTime };
    if (startTime) {
      qb.andWhere(
        `CAST(:startTime AS time) >= f.open_time
         AND EXTRACT(EPOCH FROM f.close_time) - EXTRACT(EPOCH FROM CAST(:startTime AS time)) >= :slotSeconds
         AND MOD(CAST(EXTRACT(EPOCH FROM (CAST(:startTime AS time) - f.open_time)) AS integer), :slotSeconds) = 0
         AND NOT EXISTS (
           SELECT 1 FROM booking_slots bs
           WHERE bs.field_id = f.id AND bs.slot_date = :date AND bs.slot_start = CAST(:startTime AS time)
         )`,
        params,
      );
      return;
    }
    qb.andWhere(
      `(SELECT COUNT(*) FROM booking_slots bs WHERE bs.field_id = f.id AND bs.slot_date = :date)
        < FLOOR(EXTRACT(EPOCH FROM (f.close_time - f.open_time)) / :slotSeconds)`,
      params,
    );
  }

  private async thumbnailsFor(ids: number[]): Promise<Map<number, string>> {
    if (!ids.length) return new Map();
    // first image per field: the thumbnail if any, otherwise the lowest sort_order
    const rows: { field_id: number; url: string }[] =
      await this.images.manager.query(
        `SELECT DISTINCT ON (field_id) field_id, url
       FROM field_images
       WHERE field_id = ANY($1)
       ORDER BY field_id, is_thumbnail DESC, sort_order ASC, id ASC`,
        [ids],
      );
    return new Map(rows.map((r) => [r.field_id, r.url]));
  }

  private async favoritesFor(
    ids: number[],
    userId?: number,
  ): Promise<Set<number>> {
    if (!userId || !ids.length) return new Set();
    const rows: { field_id: number }[] = await this.fields.manager.query(
      'SELECT field_id FROM favorites WHERE user_id = $1 AND field_id = ANY($2)',
      [userId, ids],
    );
    return new Set(rows.map((r) => r.field_id));
  }
}
