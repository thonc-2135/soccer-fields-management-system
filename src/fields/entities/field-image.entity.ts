import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Field } from './field.entity.js';

@Entity('field_images')
export class FieldImage {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  fieldId: number;

  @ManyToOne(() => Field, (f) => f.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'field_id' })
  field: Relation<Field>;

  @Column({ length: 255 })
  url: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ default: false })
  isThumbnail: boolean;
}
