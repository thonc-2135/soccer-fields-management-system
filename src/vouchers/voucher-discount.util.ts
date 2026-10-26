import { VoucherType } from '../common/enums/voucher-type.enum.js';

export interface DiscountRule {
  type: VoucherType;
  value: number;
  maxDiscount: number | null;
}

/** Discount in whole VND, never more than the amount it is applied to. */
export function computeDiscount(rule: DiscountRule, amount: number): number {
  const raw =
    rule.type === VoucherType.PERCENT
      ? Math.floor((amount * rule.value) / 100)
      : rule.value;
  const capped =
    rule.maxDiscount === null ? raw : Math.min(raw, rule.maxDiscount);
  return Math.max(0, Math.min(capped, amount));
}
