import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { Field } from '../../fields/entities/field.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity('favorites')
export class Favorite {
  @PrimaryColumn()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @Index()
  @PrimaryColumn()
  fieldId: number;

  @ManyToOne(() => Field, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'field_id' })
  field: Relation<Field>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
