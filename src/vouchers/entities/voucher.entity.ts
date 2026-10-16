import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { VoucherType } from '../../common/enums/voucher-type.enum.js';
import { numericTransformer } from '../../common/utils/numeric.transformer.js';

@Entity('vouchers')
export class Voucher {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, unique: true })
  code: string;

  @Column({ type: 'enum', enum: VoucherType, enumName: 'voucher_type' })
  type: VoucherType;

  /** Percent (0-100) for PERCENT, amount in VND for FIXED. */
  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  value: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 0,
    nullable: true,
    transformer: numericTransformer,
  })
  maxDiscount: number | null;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 0,
    default: 0,
    transformer: numericTransformer,
  })
  minOrderAmount: number;

  @Column({ type: 'int', nullable: true })
  usageLimit: number | null;

  /** Max uses per user; null = unlimited. */
  @Column({ type: 'int', nullable: true })
  perUserLimit: number | null;

  @Column({ type: 'int', default: 0 })
  usedCount: number;

  @Column({ type: 'timestamptz' })
  startAt: Date;

  @Column({ type: 'timestamptz' })
  endAt: Date;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
