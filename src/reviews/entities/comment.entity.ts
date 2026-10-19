import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { Review } from './review.entity.js';

@Entity('comments')
@Index(['reviewId', 'parentId', 'createdAt'])
export class Comment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  reviewId: number;

  @ManyToOne(() => Review, (r) => r.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'review_id' })
  review: Relation<Review>;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  /** Parent comment for replies (comment on a comment). */
  @Column({ type: 'int', nullable: true })
  parentId: number | null;

  @ManyToOne(() => Comment, (c) => c.replies, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'parent_id' })
  parent: Relation<Comment> | null;

  @OneToMany(() => Comment, (c) => c.parent)
  replies: Relation<Comment[]>;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
