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
import { Booking } from './booking.entity.js';

/** Price snapshot of one segment of a booking (pro-rata by minutes). */
@Entity('booking_price_items')
export class BookingPriceItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  bookingId: number;

  @ManyToOne(() => Booking, (b) => b.priceItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking: Relation<Booking>;

  @Column({ type: 'time' })
  fromTime: string;

  @Column({ type: 'time' })
  toTime: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 0,
    transformer: numericTransformer,
  })
  unitPrice: number;

  @Column({ type: 'int' })
  minutes: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 0,
    transformer: numericTransformer,
  })
  amount: number;
}
