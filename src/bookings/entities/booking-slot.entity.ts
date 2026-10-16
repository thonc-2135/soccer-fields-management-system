import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Booking } from './booking.entity.js';

/**
 * One row per reserved 90-minute slot. The unique index is what prevents double
 * booking at DB level; rows are deleted when a booking is cancelled/rejected.
 */
@Entity('booking_slots')
@Index(['fieldId', 'slotDate', 'slotStart'], { unique: true })
export class BookingSlot {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  bookingId: number;

  @ManyToOne(() => Booking, (b) => b.slots, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking: Relation<Booking>;

  @Column()
  fieldId: number;

  @Column({ type: 'date' })
  slotDate: string;

  @Column({ type: 'time' })
  slotStart: string;
}
