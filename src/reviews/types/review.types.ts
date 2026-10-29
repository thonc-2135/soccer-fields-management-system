export interface UserSummary {
  id: number;
  name: string;
  avatar: string | null;
}

export interface ReviewResponse {
  id: number;
  fieldId: number;
  rating: number;
  content: string;
  user: UserSummary;
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommentResponse {
  id: number;
  reviewId: number;
  parentId: number | null;
  content: string;
  user: UserSummary;
  createdAt: Date;
  /** Only filled on root comments; replies are never nested deeper. */
  replies: CommentResponse[];
}
