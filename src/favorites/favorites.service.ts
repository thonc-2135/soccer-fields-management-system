import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { emitActivity } from '../activities/activity-events.js';
import {
  buildMeta,
  type PaginationQueryDto,
} from '../common/dto/pagination-query.dto.js';
import { ActivityType } from '../common/enums/activity-type.enum.js';
import { FieldStatus } from '../common/enums/field-status.enum.js';
import type { PaginatedResult } from '../common/interceptors/response.interceptor.js';
import { Field } from '../fields/entities/field.entity.js';
import { FieldsService } from '../fields/fields.service.js';
import { Favorite } from './entities/favorite.entity.js';
import type {
  FavoriteFieldItem,
  FavoriteState,
} from './types/favorite.types.js';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Favorite)
    private readonly favorites: Repository<Favorite>,
    private readonly dataSource: DataSource,
    private readonly fieldsService: FieldsService,
    private readonly events: EventEmitter2,
  ) {}

  /** Idempotent: favoriting twice keeps one row and records the activity once. */
  async add(fieldId: number, userId: number): Promise<FavoriteState> {
    const fieldExists = await this.dataSource.manager.exists(Field, {
      where: { id: fieldId },
    });
    if (!fieldExists) throw new NotFoundException('errors.FIELD_NOT_FOUND');

    // an INSERT ... RETURNING answers with the inserted rows: none means it already existed
    const insertedRows = (await this.dataSource.query(
      `INSERT INTO favorites (user_id, field_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING field_id`,
      [userId, fieldId],
    )) as { field_id: number }[];
    if (insertedRows.length)
      emitActivity(this.events, {
        userId,
        type: ActivityType.FAVORITE_ADDED,
        fieldId,
        refType: 'field',
        refId: fieldId,
      });
    return { fieldId, isFavorite: true };
  }

  /** Idempotent as well; works even if the field has been deleted meanwhile. */
  async remove(fieldId: number, userId: number): Promise<FavoriteState> {
    const [deletedRows] = (await this.dataSource.query(
      `DELETE FROM favorites WHERE user_id = $1 AND field_id = $2 RETURNING field_id`,
      [userId, fieldId],
    )) as [{ field_id: number }[]];
    if (deletedRows.length)
      emitActivity(this.events, {
        userId,
        type: ActivityType.FAVORITE_REMOVED,
        fieldId,
        refType: 'field',
        refId: fieldId,
      });
    return { fieldId, isFavorite: false };
  }

  async findMine(
    userId: number,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<FavoriteFieldItem>> {
    const [rows, total] = await this.favorites
      .createQueryBuilder('favorite')
      .innerJoinAndSelect('favorite.field', 'field')
      .innerJoinAndSelect('field.type', 'type')
      .where('favorite.user_id = :userId', { userId })
      .andWhere('field.status = :status', { status: FieldStatus.ACTIVE })
      .orderBy('favorite.created_at', 'DESC')
      .addOrderBy('favorite.field_id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    const thumbnails = await this.fieldsService.thumbnailsFor(
      rows.map((favorite) => favorite.fieldId),
    );
    return {
      data: rows.map((favorite) => ({
        id: favorite.field.id,
        name: favorite.field.name,
        address: favorite.field.address,
        type: { id: favorite.field.type.id, name: favorite.field.type.name },
        thumbnail: thumbnails.get(favorite.fieldId) ?? null,
        avgRating: favorite.field.avgRating,
        reviewCount: favorite.field.reviewCount,
        favoritedAt: favorite.createdAt,
      })),
      meta: buildMeta(query.page, query.limit, total),
    };
  }
}
