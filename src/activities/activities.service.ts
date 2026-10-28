import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClockService } from '../common/clock/clock.service.js';
import { buildMeta } from '../common/dto/pagination-query.dto.js';
import type { PaginatedResult } from '../common/interceptors/response.interceptor.js';
import type { ActivityRecordEvent } from './activity-events.js';
import type { ListActivitiesQueryDto } from './dto/list-activities-query.dto.js';
import { Activity } from './entities/activity.entity.js';
import type { ActivityItem } from './types/activity.types.js';

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(Activity)
    private readonly activities: Repository<Activity>,
    private readonly clock: ClockService,
  ) {}

  async record(event: ActivityRecordEvent): Promise<void> {
    await this.activities.save(
      this.activities.create({
        userId: event.userId,
        type: event.type,
        fieldId: event.fieldId ?? null,
        refType: event.refType ?? null,
        refId: event.refId ?? null,
        metadata: event.metadata ?? null,
      }),
    );
  }

  async findMine(
    userId: number,
    query: ListActivitiesQueryDto,
  ): Promise<PaginatedResult<ActivityItem>> {
    const queryBuilder = this.activities
      .createQueryBuilder('activity')
      .leftJoinAndSelect('activity.field', 'field')
      .where('activity.user_id = :userId', { userId });
    if (query.type)
      queryBuilder.andWhere('activity.type = :type', { type: query.type });
    // created_at is a timestamptz: compare against the local day, not the UTC one
    if (query.fromDate)
      queryBuilder.andWhere(
        '(activity.created_at AT TIME ZONE :timeZone)::date >= :fromDate',
        { fromDate: query.fromDate, timeZone: this.clock.timeZone },
      );
    if (query.toDate)
      queryBuilder.andWhere(
        '(activity.created_at AT TIME ZONE :timeZone)::date <= :toDate',
        { toDate: query.toDate, timeZone: this.clock.timeZone },
      );

    const [rows, total] = await queryBuilder
      .orderBy('activity.created_at', 'DESC')
      .addOrderBy('activity.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      data: rows.map((activity) => ({
        id: activity.id,
        type: activity.type,
        createdAt: activity.createdAt,
        field: activity.field
          ? { id: activity.field.id, name: activity.field.name }
          : null,
        refType: activity.refType,
        refId: activity.refId,
        metadata: activity.metadata ?? {},
      })),
      meta: buildMeta(query.page, query.limit, total),
    };
  }
}
