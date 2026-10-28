import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { emitActivity } from '../activities/activity-events.js';
import {
  buildMeta,
  type PaginationQueryDto,
} from '../common/dto/pagination-query.dto.js';
import { ActivityType } from '../common/enums/activity-type.enum.js';
import { Role } from '../common/enums/role.enum.js';
import type { PaginatedResult } from '../common/interceptors/response.interceptor.js';
import type { User } from '../users/entities/user.entity.js';
import type { CreateCommentDto } from './dto/create-comment.dto.js';
import { Comment } from './entities/comment.entity.js';
import { Review } from './entities/review.entity.js';
import { toCommentResponse } from './mappers/review-response.mapper.js';
import type { CommentResponse } from './types/review.types.js';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  /** Root comments of a review (oldest first), each with all of its replies. */
  async listForReview(
    reviewId: number,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<CommentResponse>> {
    await this.findReview(reviewId);

    const [roots, total] = await this.comments.findAndCount({
      where: { reviewId, parentId: IsNull() },
      relations: { user: true },
      order: { createdAt: 'ASC', id: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    const replies = roots.length
      ? await this.comments.find({
          where: { parentId: In(roots.map((root) => root.id)) },
          relations: { user: true },
          order: { createdAt: 'ASC', id: 'ASC' },
        })
      : [];

    return {
      data: roots.map((root) =>
        toCommentResponse(
          root,
          replies.filter((reply) => reply.parentId === root.id),
        ),
      ),
      meta: buildMeta(query.page, query.limit, total),
    };
  }

  async create(
    reviewId: number,
    dto: CreateCommentDto,
    user: User,
  ): Promise<CommentResponse> {
    const review = await this.findReview(reviewId);

    let parentId: number | null = null;
    if (dto.parentId !== undefined) {
      const parent = await this.comments.findOne({
        where: { id: dto.parentId, reviewId },
      });
      if (!parent) throw new NotFoundException('errors.COMMENT_NOT_FOUND');
      // two levels only: a reply to a reply joins the thread of the root comment
      parentId = parent.parentId ?? parent.id;
    }

    const comment = await this.comments.save(
      this.comments.create({
        reviewId,
        userId: user.id,
        parentId,
        content: dto.content,
      }),
    );
    emitActivity(this.events, {
      userId: user.id,
      type: ActivityType.COMMENT_CREATED,
      fieldId: review.fieldId,
      refType: 'comment',
      refId: comment.id,
      metadata: { reviewId, parentId },
    });

    const saved = await this.comments.findOneOrFail({
      where: { id: comment.id },
      relations: { user: true },
    });
    return toCommentResponse(saved);
  }

  /** The author or an admin can delete a comment; its replies go with it. */
  async remove(id: number, user: User): Promise<void> {
    const comment = await this.comments.findOne({ where: { id } });
    if (!comment) throw new NotFoundException('errors.COMMENT_NOT_FOUND');
    if (comment.userId !== user.id && user.role !== Role.ADMIN)
      throw new ForbiddenException('errors.FORBIDDEN');

    await this.dataSource.query(
      `UPDATE comments SET deleted_at = now() WHERE (id = $1 OR parent_id = $1) AND deleted_at IS NULL`,
      [id],
    );
  }

  private async findReview(reviewId: number): Promise<Review> {
    const review = await this.reviews.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('errors.REVIEW_NOT_FOUND');
    return review;
  }
}
