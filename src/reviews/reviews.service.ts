import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { emitActivity } from '../activities/activity-events.js';
import { Booking } from '../bookings/entities/booking.entity.js';
import { buildMeta } from '../common/dto/pagination-query.dto.js';
import { ActivityType } from '../common/enums/activity-type.enum.js';
import { BookingStatus } from '../common/enums/booking-status.enum.js';
import { Role } from '../common/enums/role.enum.js';
import type { PaginatedResult } from '../common/interceptors/response.interceptor.js';
import { Field } from '../fields/entities/field.entity.js';
import type { User } from '../users/entities/user.entity.js';
import type {
  CreateReviewDto,
  UpdateReviewDto,
} from './dto/create-review.dto.js';
import type { ListReviewsQueryDto } from './dto/list-reviews-query.dto.js';
import { Review } from './entities/review.entity.js';
import { toReviewResponse } from './mappers/review-response.mapper.js';
import type { ReviewResponse } from './types/review.types.js';

/** Only customers with a confirmed or finished booking at the field may review it. */
const REVIEWABLE_BOOKING_STATUSES = [
  BookingStatus.APPROVED,
  BookingStatus.COMPLETED,
];

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  async listForField(
    fieldId: number,
    query: ListReviewsQueryDto,
  ): Promise<PaginatedResult<ReviewResponse>> {
    const fieldExists = await this.dataSource.manager.exists(Field, {
      where: { id: fieldId },
    });
    if (!fieldExists) throw new NotFoundException('errors.FIELD_NOT_FOUND');

    const queryBuilder = this.reviews
      .createQueryBuilder('review')
      .innerJoinAndSelect('review.user', 'user')
      .where('review.field_id = :fieldId', { fieldId });
    if (query.rating)
      queryBuilder.andWhere('review.rating = :rating', {
        rating: query.rating,
      });

    const [rows, total] = await queryBuilder
      .orderBy('review.created_at', 'DESC')
      .addOrderBy('review.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    const commentCounts = await this.countComments(rows.map((row) => row.id));
    return {
      data: rows.map((review) =>
        toReviewResponse(review, commentCounts.get(review.id) ?? 0),
      ),
      meta: buildMeta(query.page, query.limit, total),
    };
  }

  /**
   * The field row is locked first: rating and review count are recomputed from the reviews table,
   * so two concurrent reviews of one field must not interleave their recalculations.
   */
  async create(
    fieldId: number,
    dto: CreateReviewDto,
    user: User,
  ): Promise<ReviewResponse> {
    const reviewId = await this.dataSource.transaction(async (manager) => {
      await this.lockField(manager, fieldId);
      const hasBooking = await manager.exists(Booking, {
        where: {
          userId: user.id,
          fieldId,
          status: In(REVIEWABLE_BOOKING_STATUSES),
        },
      });
      if (!hasBooking)
        throw new ForbiddenException('errors.REVIEW_REQUIRES_BOOKING');
      if (await manager.exists(Review, { where: { userId: user.id, fieldId } }))
        throw new ConflictException('errors.REVIEW_ALREADY_EXISTS');

      const review = await manager.save(
        manager.create(Review, {
          userId: user.id,
          fieldId,
          rating: dto.rating,
          content: dto.content,
        }),
      );
      await this.refreshFieldRating(manager, fieldId);
      return review.id;
    });

    emitActivity(this.events, {
      userId: user.id,
      type: ActivityType.REVIEW_CREATED,
      fieldId,
      refType: 'review',
      refId: reviewId,
      metadata: { rating: dto.rating },
    });
    return this.getOne(reviewId);
  }

  async update(
    id: number,
    dto: UpdateReviewDto,
    user: User,
  ): Promise<ReviewResponse> {
    if (dto.rating === undefined && dto.content === undefined)
      throw new BadRequestException('errors.NOTHING_TO_UPDATE');
    const review = await this.findLive(id);
    if (review.userId !== user.id)
      throw new ForbiddenException('errors.FORBIDDEN');

    await this.dataSource.transaction(async (manager) => {
      await this.lockField(manager, review.fieldId);
      await manager.update(
        Review,
        { id },
        { rating: dto.rating, content: dto.content },
      );
      await this.refreshFieldRating(manager, review.fieldId);
    });
    return this.getOne(id);
  }

  /** The author or an admin can delete a review (soft delete). */
  async remove(id: number, user: User): Promise<void> {
    const review = await this.findLive(id);
    if (review.userId !== user.id && user.role !== Role.ADMIN)
      throw new ForbiddenException('errors.FORBIDDEN');

    await this.dataSource.transaction(async (manager) => {
      await this.lockField(manager, review.fieldId);
      await manager.softDelete(Review, { id });
      await this.refreshFieldRating(manager, review.fieldId);
    });
  }

  private async getOne(id: number): Promise<ReviewResponse> {
    const review = await this.reviews.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!review) throw new NotFoundException('errors.REVIEW_NOT_FOUND');
    const commentCounts = await this.countComments([id]);
    return toReviewResponse(review, commentCounts.get(id) ?? 0);
  }

  private async findLive(id: number): Promise<Review> {
    const review = await this.reviews.findOne({ where: { id } });
    if (!review) throw new NotFoundException('errors.REVIEW_NOT_FOUND');
    return review;
  }

  private async lockField(
    manager: EntityManager,
    fieldId: number,
  ): Promise<void> {
    const field = await manager
      .createQueryBuilder(Field, 'field')
      .where('field.id = :fieldId', { fieldId })
      .setLock('pessimistic_write')
      .getOne();
    if (!field) throw new NotFoundException('errors.FIELD_NOT_FOUND');
  }

  private async refreshFieldRating(
    manager: EntityManager,
    fieldId: number,
  ): Promise<void> {
    await manager.query(
      `UPDATE fields SET
         avg_rating = COALESCE((SELECT ROUND(AVG(rating), 1) FROM reviews WHERE field_id = $1 AND deleted_at IS NULL), 0),
         review_count = (SELECT COUNT(*)::int FROM reviews WHERE field_id = $1 AND deleted_at IS NULL)
       WHERE id = $1`,
      [fieldId],
    );
  }

  private async countComments(
    reviewIds: number[],
  ): Promise<Map<number, number>> {
    if (!reviewIds.length) return new Map();
    const rows = (await this.dataSource.query(
      `SELECT review_id, COUNT(*)::int AS count FROM comments
       WHERE review_id = ANY($1::int[]) AND deleted_at IS NULL
       GROUP BY review_id`,
      [reviewIds],
    )) as { review_id: number; count: number }[];
    return new Map(rows.map((row) => [row.review_id, row.count]));
  }
}
