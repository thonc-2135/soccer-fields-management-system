import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { numericTransformer } from '../../common/utils/numeric.transformer.js';
import { Field } from './field.entity.js';

/** Price per hour (VND) for the time window [startTime, endTime). */
@Entity('field_prices')
@Index(['fieldId', 'startTime'], { unique: true })
export class FieldPrice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  fieldId: number;

  @ManyToOne(() => Field, (f) => f.prices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'field_id' })
  field: Relation<Field>;

  @Column({ type: 'time' })
  startTime: string;

  @Column({ type: 'time' })
  endTime: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 0,
    transformer: numericTransformer,
  })
  price: number;
}
