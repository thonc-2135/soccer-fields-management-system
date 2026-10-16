import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { ActivityType } from '../../common/enums/activity-type.enum.js';
import { Field } from '../../fields/entities/field.entity.js';
import { User } from '../../users/entities/user.entity.js';

/** Append-only user timeline. */
@Entity('activities')
@Index(['userId', 'createdAt'])
export class Activity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @Column({ type: 'enum', enum: ActivityType, enumName: 'activity_type' })
  type: ActivityType;

  @Column({ type: 'int', nullable: true })
  fieldId: number | null;

  @ManyToOne(() => Field, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'field_id' })
  field: Relation<Field> | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  refType: string | null;

  @Column({ type: 'int', nullable: true })
  refId: number | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
