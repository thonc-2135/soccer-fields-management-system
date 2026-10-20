import { VoucherType } from '../common/enums/voucher-type.enum.js';

export const DEMO_USER_PASSWORD = 'User@1234';

export const DEMO_USERS = [
  { name: 'Nguyen Van A', email: 'user1@soccer.local', phone: '0901000001' },
  { name: 'Tran Thi B', email: 'user2@soccer.local', phone: '0901000002' },
  { name: 'Le Van C', email: 'user3@soccer.local', phone: '0901000003' },
];

/** price = VND per hour for each window; 17:00-21:00 is the peak window. */
export const FIELD_TYPES = [
  {
    name: 'Sân 5',
    capacity: 10,
    description: 'Sân mini 5 người',
    prices: [150_000, 250_000, 180_000],
  },
  {
    name: 'Sân 7',
    capacity: 14,
    description: 'Sân 7 người',
    prices: [200_000, 350_000, 250_000],
  },
  {
    name: 'Sân 11',
    capacity: 22,
    description: 'Sân tiêu chuẩn 11 người',
    prices: [400_000, 700_000, 500_000],
  },
];

export const PRICE_WINDOWS = [
  { startTime: '06:00', endTime: '17:00' },
  { startTime: '17:00', endTime: '21:00' },
  { startTime: '21:00', endTime: '23:00' },
];

export const FIELDS = [
  {
    name: 'Sân Thống Nhất A1',
    type: 'Sân 5',
    address: '138 Nguyễn Thị Minh Khai, Quận 3, TP.HCM',
    description: 'Sân cỏ nhân tạo, có đèn chiếu sáng.',
  },
  {
    name: 'Sân Thống Nhất A2',
    type: 'Sân 5',
    address: '138 Nguyễn Thị Minh Khai, Quận 3, TP.HCM',
    description: 'Sân cỏ nhân tạo, mái che.',
  },
  {
    name: 'Sân Phú Thọ B1',
    type: 'Sân 7',
    address: '1 Lữ Gia, Quận 11, TP.HCM',
    description: 'Sân 7 cỏ nhân tạo thế hệ mới.',
  },
  {
    name: 'Sân Phú Thọ B2',
    type: 'Sân 7',
    address: '1 Lữ Gia, Quận 11, TP.HCM',
    description: 'Sân 7, có khán đài nhỏ.',
  },
  {
    name: 'Sân Bình Thạnh C1',
    type: 'Sân 7',
    address: '25 Xô Viết Nghệ Tĩnh, Bình Thạnh, TP.HCM',
    description: 'Sân 7, bãi giữ xe rộng.',
  },
  {
    name: 'Sân Quân Khu 7 D1',
    type: 'Sân 11',
    address: '202 Hoàng Văn Thụ, Tân Bình, TP.HCM',
    description: 'Sân 11 tiêu chuẩn, cỏ tự nhiên.',
  },
];

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

export const VOUCHERS = [
  {
    code: 'SALE10',
    type: VoucherType.PERCENT,
    value: 10,
    maxDiscount: 100_000,
    minOrderAmount: 200_000,
    usageLimit: 100,
    perUserLimit: 2,
    startAt: new Date(now - DAY),
    endAt: new Date(now + 180 * DAY),
  },
  {
    code: 'GIAM50K',
    type: VoucherType.FIXED,
    value: 50_000,
    maxDiscount: null,
    minOrderAmount: 300_000,
    usageLimit: null,
    perUserLimit: 1,
    startAt: new Date(now - DAY),
    endAt: new Date(now + 180 * DAY),
  },
  // already expired: handy for testing the "voucher expired" path
  {
    code: 'EXPIRED',
    type: VoucherType.PERCENT,
    value: 20,
    maxDiscount: null,
    minOrderAmount: 0,
    usageLimit: null,
    perUserLimit: null,
    startAt: new Date(now - 60 * DAY),
    endAt: new Date(now - 30 * DAY),
  },
];
