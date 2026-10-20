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
import { Field } from '../../fields/entities/field.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Comment } from './comment.entity.js';

// One live review per user per field (partial unique index, see migration).
@Entity('reviews')
@Index(['fieldId', 'createdAt'])
export class Review {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @Column()
  fieldId: number;

  @ManyToOne(() => Field, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'field_id' })
  field: Relation<Field>;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'text' })
  content: string;

  @OneToMany(() => Comment, (c) => c.review)
  comments: Relation<Comment[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
