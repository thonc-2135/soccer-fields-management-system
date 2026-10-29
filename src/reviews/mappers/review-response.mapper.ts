import type { Comment } from '../entities/comment.entity.js';
import type { Review } from '../entities/review.entity.js';
import type {
  CommentResponse,
  ReviewResponse,
  UserSummary,
} from '../types/review.types.js';

const toUserSummary = (user: Review['user']): UserSummary => ({
  id: user.id,
  name: user.name,
  avatar: user.avatar,
});

/** Expects `user` to be loaded. */
export function toReviewResponse(
  review: Review,
  commentCount: number,
): ReviewResponse {
  return {
    id: review.id,
    fieldId: review.fieldId,
    rating: review.rating,
    content: review.content,
    user: toUserSummary(review.user),
    commentCount,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

/** Expects `user` to be loaded. */
export function toCommentResponse(
  comment: Comment,
  replies: Comment[] = [],
): CommentResponse {
  return {
    id: comment.id,
    reviewId: comment.reviewId,
    parentId: comment.parentId,
    content: comment.content,
    user: toUserSummary(comment.user),
    createdAt: comment.createdAt,
    replies: replies.map((reply) => toCommentResponse(reply)),
  };
}
