import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { FieldStatus } from '../../common/enums/field-status.enum.js';
import { numericTransformer } from '../../common/utils/numeric.transformer.js';
import { FieldImage } from './field-image.entity.js';
import { FieldPrice } from './field-price.entity.js';
import { FieldType } from './field-type.entity.js';

@Entity('fields')
export class Field {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  typeId: number;

  @ManyToOne(() => FieldType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'type_id' })
  type: Relation<FieldType>;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ length: 255 })
  address: string;

  @Column({ type: 'time', default: '06:00' })
  openTime: string;

  @Column({ type: 'time', default: '23:00' })
  closeTime: string;

  @Column({
    type: 'enum',
    enum: FieldStatus,
    enumName: 'field_status',
    default: FieldStatus.ACTIVE,
  })
  status: FieldStatus;

  /** Denormalized from reviews to avoid AVG() on every list request. */
  @Column({
    type: 'numeric',
    precision: 2,
    scale: 1,
    default: 0,
    transformer: numericTransformer,
  })
  avgRating: number;

  @Column({ type: 'int', default: 0 })
  reviewCount: number;

  @OneToMany(() => FieldImage, (i) => i.field)
  images: Relation<FieldImage[]>;

  @OneToMany(() => FieldPrice, (p) => p.field)
  prices: Relation<FieldPrice[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
