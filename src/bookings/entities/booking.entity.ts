import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { BookingStatus } from '../../common/enums/booking-status.enum.js';
import { numericTransformer } from '../../common/utils/numeric.transformer.js';
import { Field } from '../../fields/entities/field.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Voucher } from '../../vouchers/entities/voucher.entity.js';
import { BookingPriceItem } from './booking-price-item.entity.js';
import { BookingSlot } from './booking-slot.entity.js';

@Entity('bookings')
@Index(['userId', 'createdAt'])
@Index(['fieldId', 'bookingDate', 'status'])
@Index(['status', 'createdAt'])
export class Booking {
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

  @Column({ type: 'int', nullable: true })
  voucherId: number | null;

  @ManyToOne(() => Voucher, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'voucher_id' })
  voucher: Relation<Voucher> | null;

  @Column({ type: 'date' })
  bookingDate: string;

  @Column({ type: 'time' })
  startTime: string;

  @Column({ type: 'time' })
  endTime: string;

  @Column({
    type: 'enum',
    enum: BookingStatus,
    enumName: 'booking_status',
    default: BookingStatus.PENDING,
  })
  status: BookingStatus;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 0,
    transformer: numericTransformer,
  })
  subtotal: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 0,
    default: 0,
    transformer: numericTransformer,
  })
  discount: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 0,
    transformer: numericTransformer,
  })
  total: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  rejectReason: string | null;

  /** Admin who approved / rejected the booking. */
  @Column({ type: 'int', nullable: true })
  handledBy: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'handled_by' })
  handler: Relation<User> | null;

  @OneToMany(() => BookingSlot, (s) => s.booking)
  slots: Relation<BookingSlot[]>;

  @OneToMany(() => BookingPriceItem, (i) => i.booking)
  priceItems: Relation<BookingPriceItem[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
