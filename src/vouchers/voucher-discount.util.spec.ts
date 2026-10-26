import { VoucherType } from '../common/enums/voucher-type.enum.js';
import { computeDiscount } from './voucher-discount.util.js';

describe('computeDiscount', () => {
  it('percent voucher: floors to whole VND and respects the cap', () => {
    const rule = { type: VoucherType.PERCENT, value: 10, maxDiscount: 100_000 };
    expect(computeDiscount(rule, 500_000)).toBe(50_000);
    expect(computeDiscount(rule, 1_500_000)).toBe(100_000);
    expect(computeDiscount(rule, 333_333)).toBe(33_333);
  });

  it('percent voucher without a cap', () => {
    expect(
      computeDiscount(
        { type: VoucherType.PERCENT, value: 20, maxDiscount: null },
        1_000_000,
      ),
    ).toBe(200_000);
  });

  it('fixed voucher never exceeds the amount', () => {
    const rule = { type: VoucherType.FIXED, value: 50_000, maxDiscount: null };
    expect(computeDiscount(rule, 300_000)).toBe(50_000);
    expect(computeDiscount(rule, 30_000)).toBe(30_000);
    expect(computeDiscount(rule, 0)).toBe(0);
  });
});
