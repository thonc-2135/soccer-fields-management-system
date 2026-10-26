import type { VoucherType } from '../../common/enums/voucher-type.enum.js';
import type { Voucher } from '../entities/voucher.entity.js';

export interface VoucherEvaluation {
  voucher: Voucher;
  discount: number;
}

export interface VoucherValidation {
  valid: true;
  code: string;
  type: VoucherType;
  value: number;
  discount: number;
  total: number;
}
