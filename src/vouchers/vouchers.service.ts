import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ClockService } from '../common/clock/clock.service.js';
import { Voucher } from './entities/voucher.entity.js';
import { computeDiscount } from './voucher-discount.util.js';

export interface VoucherEvaluation {
  voucher: Voucher;
  discount: number;
}

@Injectable()
export class VouchersService {
  constructor(
    @InjectRepository(Voucher) private readonly vouchers: Repository<Voucher>,
    private readonly clock: ClockService,
  ) {}

  /**
   * Checks every rule of a voucher for `userId` and an order of `subtotal` VND.
   * With `lock` (inside a transaction) the voucher row stays locked until commit, so the
   * usage limits cannot be exceeded by concurrent bookings.
   */
  async evaluate(
    code: string,
    subtotal: number,
    userId: number,
    options: { manager?: EntityManager; lock?: boolean } = {},
  ): Promise<VoucherEvaluation> {
    const manager = options.manager ?? this.vouchers.manager;
    const queryBuilder = manager
      .createQueryBuilder(Voucher, 'voucher')
      .where('voucher.code = :code', { code: code.trim().toUpperCase() });
    if (options.lock) queryBuilder.setLock('pessimistic_write');
    const voucher = await queryBuilder.getOne();

    if (!voucher) throw new NotFoundException('errors.VOUCHER_NOT_FOUND');
    if (!voucher.isActive)
      throw new UnprocessableEntityException('errors.VOUCHER_INACTIVE');
    const now = this.clock.now();
    if (now < voucher.startAt)
      throw new UnprocessableEntityException('errors.VOUCHER_NOT_STARTED');
    if (now >= voucher.endAt)
      throw new UnprocessableEntityException('errors.VOUCHER_EXPIRED');
    if (
      voucher.usageLimit !== null &&
      voucher.usedCount >= voucher.usageLimit
    ) {
      throw new UnprocessableEntityException('errors.VOUCHER_EXHAUSTED');
    }
    if (subtotal < voucher.minOrderAmount)
      throw new UnprocessableEntityException('errors.VOUCHER_MIN_ORDER');

    if (voucher.perUserLimit !== null) {
      const [{ count }] = (await manager.query(
        `SELECT COUNT(*)::int AS count FROM bookings
         WHERE voucher_id = $1 AND user_id = $2 AND status NOT IN ('CANCELLED', 'REJECTED')`,
        [voucher.id, userId],
      )) as { count: number }[];
      if (count >= voucher.perUserLimit)
        throw new UnprocessableEntityException('errors.VOUCHER_USER_LIMIT');
    }

    return { voucher, discount: computeDiscount(voucher, subtotal) };
  }
}
