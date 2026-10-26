import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { addDays } from '../src/bookings/booking-calendar.js';
import { createTestApp, type FakeMailer } from './helpers/create-test-app.js';

// 10:00 on Thursday 2030-01-10 in Vietnam (UTC+7). Everything below is relative to this instant.
const NOW = new Date('2030-01-10T03:00:00Z');
const TODAY = '2030-01-10';
const inDays = (days: number) => addDays(TODAY, days);
const THU = inDays(7); // 2030-01-17
const TUE = inDays(5); // 2030-01-15
const WED = inDays(6);
const MON = inDays(4);
const SAT = inDays(2); // 2030-01-12
const SUN = inDays(3);

describe('Bookings (e2e)', () => {
  let app: INestApplication;
  let mailer: FakeMailer;
  let db: DataSource;
  const tag = `bk${Date.now()}`;
  const password = 'Passw0rd!';
  let fieldId: number;
  let inactiveFieldId: number;
  const users: Record<string, { id: number; email: string; token: string }> =
    {};
  const voucherCodes: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const auth = (userKey: string) => ({
    Authorization: `Bearer ${users[userKey].token}`,
  });
  const post = (
    url: string,
    userKey: string,
    body: object,
    headers: Record<string, string> = {},
  ) => http().post(`/api/v1${url}`).set(auth(userKey)).set(headers).send(body);
  const get = (url: string, userKey = 'u1') =>
    http().get(`/api/v1${url}`).set(auth(userKey));
  const book = (
    userKey: string,
    date: string,
    startTime: string,
    extra: object = {},
  ) => post('/bookings', userKey, { fieldId, date, startTime, ...extra });
  const slotsOf = async (date: string) =>
    (await http().get(`/api/v1/fields/${fieldId}/availability`).query({ date }))
      .body.data.slots as {
      startTime: string;
      status: string;
      price: number;
    }[];
  const statusAt = async (date: string, start: string) =>
    (await slotsOf(date)).find((slot) => slot.startTime === start)!.status;

  beforeAll(async () => {
    ({ app, mailer } = await createTestApp({ now: NOW }));
    db = app.get(DataSource);

    const typeId = (
      await db.query(
        `INSERT INTO field_types(name, capacity) VALUES ($1, 14) RETURNING id`,
        [`${tag} type`],
      )
    )[0].id;
    const mkField = async (name: string, status: string) => {
      const id = (
        await db.query(
          `INSERT INTO fields(type_id, name, address, status) VALUES ($1,$2,'1 Test St',$3) RETURNING id`,
          [typeId, name, status],
        )
      )[0].id;
      for (const [startTime, endTime, price] of [
        ['06:00', '17:00', 200000],
        ['17:00', '21:00', 350000],
        ['21:00', '23:00', 250000],
      ]) {
        await db.query(
          `INSERT INTO field_prices(field_id, start_time, end_time, price) VALUES ($1,$2,$3,$4)`,
          [id, startTime, endTime, price],
        );
      }
      return id as number;
    };
    fieldId = await mkField(`${tag} Field`, 'ACTIVE');
    inactiveFieldId = await mkField(`${tag} Hidden`, 'INACTIVE');

    const mkVoucher = async (
      key: string,
      overrides: Record<string, unknown>,
    ) => {
      const code = `${tag}-${key}`.toUpperCase();
      voucherCodes[key] = code;
      const voucher = {
        type: 'PERCENT',
        value: 10,
        max_discount: 100000,
        min_order_amount: 200000,
        usage_limit: null,
        per_user_limit: 2,
        start_at: '2029-12-01T00:00:00Z',
        end_at: '2030-12-31T00:00:00Z',
        is_active: true,
        ...overrides,
      };
      await db.query(
        `INSERT INTO vouchers(code,type,value,max_discount,min_order_amount,usage_limit,per_user_limit,start_at,end_at,is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          code,
          voucher.type,
          voucher.value,
          voucher.max_discount,
          voucher.min_order_amount,
          voucher.usage_limit,
          voucher.per_user_limit,
          voucher.start_at,
          voucher.end_at,
          voucher.is_active,
        ],
      );
    };
    await mkVoucher('sale', {});
    await mkVoucher('fixed', {
      type: 'FIXED',
      value: 50000,
      max_discount: null,
      per_user_limit: null,
    });
    await mkVoucher('once', { per_user_limit: 1 });
    await mkVoucher('limited', { usage_limit: 1, per_user_limit: null });
    await mkVoucher('expired', { end_at: '2030-01-05T00:00:00Z' });
    await mkVoucher('future', { start_at: '2030-02-01T00:00:00Z' });
    await mkVoucher('off', { is_active: false });
    await mkVoucher('big', { min_order_amount: 5000000 });

    for (const label of ['u1', 'u2', 'u3']) {
      const email = `${tag}_${label}@example.com`;
      await http()
        .post('/api/v1/auth/register')
        .send({ name: label.toUpperCase(), email, password });
      await db.query(`UPDATE users SET is_active = true WHERE email = $1`, [
        email,
      ]);
      const id = (
        await db.query(`SELECT id FROM users WHERE email = $1`, [email])
      )[0].id;
      const token = (
        await http().post('/api/v1/auth/login').send({ email, password })
      ).body.data.accessToken;
      users[label] = { id, email, token };
    }
  });

  afterAll(async () => {
    const ids = [fieldId, inactiveFieldId];
    await db.query(`DELETE FROM bookings WHERE field_id = ANY($1)`, [ids]); // slots + price items cascade
    await db.query(`DELETE FROM fields WHERE id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM field_types WHERE name = $1`, [`${tag} type`]);
    await db.query(`DELETE FROM vouchers WHERE code LIKE $1`, [
      `${tag.toUpperCase()}-%`,
    ]);
    await db.query(`DELETE FROM users WHERE email LIKE $1`, [`${tag}_%`]);
    await app.close();
  });

  describe('availability', () => {
    it('lists the 90-minute slots of a weekday with their prices', async () => {
      const response = await http()
        .get(`/api/v1/fields/${fieldId}/availability`)
        .query({ date: TUE });
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        fieldId,
        date: TUE,
        isWeekend: false,
        slotMinutes: 90,
      });
      const slots = response.body.data.slots;
      expect(slots).toHaveLength(11);
      expect(slots[0]).toEqual({
        startTime: '06:00',
        endTime: '07:30',
        status: 'AVAILABLE',
        price: 300000,
      });
      expect(
        slots.find((slot: { startTime: string }) => slot.startTime === '16:30')
          .price,
      ).toBe(450000); // 30' + 60' split
      expect(
        slots.find((slot: { startTime: string }) => slot.startTime === '18:00')
          .price,
      ).toBe(525000);
      expect(slots.at(-1)).toMatchObject({
        startTime: '21:00',
        endTime: '22:30',
        price: 375000,
      });
    });

    it('adds the 10% weekend surcharge', async () => {
      const slots = await slotsOf(SAT);
      expect(slots.find((slot) => slot.startTime === '18:00')!.price).toBe(
        577500,
      );
    });

    it('marks slots that already started today as PAST', async () => {
      const slots = await slotsOf(TODAY);
      expect(
        slots
          .filter((slot) => slot.status === 'PAST')
          .map((slot) => slot.startTime),
      ).toEqual(['06:00', '07:30', '09:00']);
      expect(slots.find((slot) => slot.startTime === '10:30')!.status).toBe(
        'AVAILABLE',
      );
      expect(
        (await slotsOf(inDays(-1))).every((slot) => slot.status === 'PAST'),
      ).toBe(true);
    });

    it('shows PENDING and BOOKED slots', async () => {
      const response = await book('u1', WED, '12:00').expect(201);
      expect(await statusAt(WED, '12:00')).toBe('PENDING');
      await db.query(`UPDATE bookings SET status = 'APPROVED' WHERE id = $1`, [
        response.body.data.id,
      ]);
      expect(await statusAt(WED, '12:00')).toBe('BOOKED');
    });

    it('rejects bad input and unknown / inactive fields', async () => {
      await http()
        .get(`/api/v1/fields/${fieldId}/availability`)
        .query({ date: '2030-02-30' })
        .expect(400);
      await http().get(`/api/v1/fields/${fieldId}/availability`).expect(400);
      await http()
        .get(`/api/v1/fields/999999999/availability`)
        .query({ date: TUE })
        .expect(404);
      await http()
        .get(`/api/v1/fields/${inactiveFieldId}/availability`)
        .query({ date: TUE })
        .expect(404);
    });
  });

  describe('preview', () => {
    it('prices a slot that straddles two price windows pro rata', async () => {
      const response = await post('/bookings/preview', 'u1', {
        fieldId,
        date: TUE,
        startTime: '16:30',
      });
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        startTime: '16:30',
        endTime: '18:00',
        isWeekend: false,
        subtotal: 450000,
        discount: 0,
        total: 450000,
        voucher: null,
      });
      expect(response.body.data.priceBreakdown).toEqual([
        {
          from: '16:30',
          to: '17:00',
          unitPrice: 200000,
          minutes: 30,
          amount: 100000,
        },
        {
          from: '17:00',
          to: '18:00',
          unitPrice: 350000,
          minutes: 60,
          amount: 350000,
        },
      ]);
      expect(await statusAt(TUE, '16:30')).toBe('AVAILABLE'); // nothing was stored
    });

    it('applies the weekend surcharge and consecutive slots', async () => {
      const sat = await post('/bookings/preview', 'u1', {
        fieldId,
        date: SAT,
        startTime: '18:00',
      });
      expect(sat.body.data).toMatchObject({
        isWeekend: true,
        weekendSurchargePercent: 10,
        subtotal: 577500,
      });
      expect(sat.body.data.priceBreakdown[0].unitPrice).toBe(385000);

      const twoSlots = await post('/bookings/preview', 'u1', {
        fieldId,
        date: SUN,
        startTime: '18:00',
        slots: 2,
      });
      expect(twoSlots.body.data).toMatchObject({
        startTime: '18:00',
        endTime: '21:00',
        subtotal: 1155000,
      });
    });

    it('applies percent (capped) and fixed vouchers', async () => {
      const pct = await post('/bookings/preview', 'u1', {
        fieldId,
        date: TUE,
        startTime: '18:00',
        voucherCode: voucherCodes.sale.toLowerCase(),
      });
      expect(pct.body.data).toMatchObject({
        subtotal: 525000,
        discount: 52500,
        total: 472500,
        voucher: { code: voucherCodes.sale },
      });
      const capped = await post('/bookings/preview', 'u1', {
        fieldId,
        date: SUN,
        startTime: '18:00',
        slots: 2,
        voucherCode: voucherCodes.sale,
      });
      expect(capped.body.data.discount).toBe(100000); // 10% of 1.155.000 is capped
      const fixed = await post('/bookings/preview', 'u1', {
        fieldId,
        date: TUE,
        startTime: '18:00',
        voucherCode: voucherCodes.fixed,
      });
      expect(fixed.body.data).toMatchObject({ discount: 50000, total: 475000 });
    });

    it('explains why a voucher cannot be used', async () => {
      const preview = (code: string) =>
        post('/bookings/preview', 'u1', {
          fieldId,
          date: TUE,
          startTime: '18:00',
          voucherCode: code,
        });
      expect((await preview('NOPE')).status).toBe(404);
      expect((await preview(voucherCodes.expired)).body.message).toBe(
        'This voucher has expired',
      );
      expect((await preview(voucherCodes.future)).body.message).toBe(
        'This voucher is not valid yet',
      );
      expect((await preview(voucherCodes.off)).body.message).toBe(
        'This voucher is no longer active',
      );
      expect((await preview(voucherCodes.big)).body.message).toBe(
        'The order amount is below the minimum required for this voucher',
      );
    });

    it('rejects slots that cannot be booked', async () => {
      const bad = (body: object) =>
        post('/bookings/preview', 'u1', {
          fieldId,
          date: TUE,
          startTime: '18:00',
          ...body,
        });
      expect((await bad({ startTime: '18:15' })).status).toBe(422); // off the grid
      expect((await bad({ startTime: '05:00' })).status).toBe(422); // before opening
      expect((await bad({ startTime: '21:00', slots: 2 })).status).toBe(422); // would end after 23:00
      expect((await bad({ startTime: '22:30' })).status).toBe(422);
      expect(
        (await bad({ date: TODAY, startTime: '09:00' })).body.message,
      ).toBe('This slot has already started or passed');
      expect((await bad({ date: inDays(-1) })).status).toBe(422);
      expect((await bad({ date: inDays(61) })).body.message).toBe(
        'Bookings can only be made up to 60 days ahead',
      );
      expect((await bad({ date: inDays(60) })).status).toBe(200);
      expect((await bad({ date: TODAY, startTime: '10:30' })).status).toBe(200);
      expect((await bad({ slots: 4 })).status).toBe(400);
      expect((await bad({ slots: 0 })).status).toBe(400);
      expect((await bad({ startTime: '7pm' })).status).toBe(400);
      expect((await bad({ date: '2030-02-30' })).status).toBe(400);
      expect((await bad({ fieldId: 999999999 })).status).toBe(404);
      expect((await bad({ fieldId: inactiveFieldId })).status).toBe(404);
      expect((await bad({ extra: 1 })).status).toBe(400);
      await http().post('/api/v1/bookings/preview').send({}).expect(401);
    });

    it('tells the user when the slot is already taken', async () => {
      await book('u2', inDays(9), '15:00').expect(201);
      expect(
        (
          await post('/bookings/preview', 'u1', {
            fieldId,
            date: inDays(9),
            startTime: '15:00',
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await post('/bookings/preview', 'u1', {
            fieldId,
            date: inDays(9),
            startTime: '13:30',
            slots: 2,
          })
        ).status,
      ).toBe(409); // overlaps 15:00
    });
  });

  describe('create', () => {
    it('stores a PENDING booking with the price breakdown', async () => {
      const response = await book('u1', MON, '16:30', {
        note: 'bring own ball',
      });
      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        status: 'PENDING',
        date: MON,
        startTime: '16:30',
        endTime: '18:00',
        subtotal: 450000,
        discount: 0,
        total: 450000,
        note: 'bring own ball',
        voucher: null,
        field: { id: fieldId },
      });
      expect(response.body.data.priceBreakdown).toHaveLength(2);
      const slots = await db.query(
        `SELECT slot_start FROM booking_slots WHERE booking_id = $1`,
        [response.body.data.id],
      );
      expect(
        slots.map((slot: { slot_start: string }) => slot.slot_start),
      ).toEqual(['16:30:00']);
      expect(await statusAt(MON, '16:30')).toBe('PENDING');
    });

    it('a second booking of the same slot gets 409, including overlaps from multi-slot bookings', async () => {
      await book('u1', THU, '18:00', { slots: 2 }).expect(201); // holds 18:00 and 19:30
      const same = await book('u2', THU, '18:00');
      expect(same.status).toBe(409);
      expect(same.body.message).toBe('This time slot is already booked');
      await book('u2', THU, '19:30').expect(409);
      await book('u2', THU, '16:30', { slots: 2 }).expect(409); // 16:30 + 18:00
      await book('u2', THU, '21:00').expect(201); // the neighbour is still free
    });

    it('lets exactly one of many simultaneous requests win', async () => {
      const date = inDays(10);
      const results = await Promise.all(
        ['u1', 'u2', 'u3', 'u1', 'u2', 'u3', 'u1', 'u2'].map((userKey) =>
          book(userKey, date, '19:30'),
        ),
      );
      expect(results.filter((result) => result.status === 201)).toHaveLength(1);
      expect(results.filter((result) => result.status === 409)).toHaveLength(7);
      const rows = await db.query(
        `SELECT 1 FROM booking_slots WHERE field_id = $1 AND slot_date = $2 AND slot_start = '19:30'`,
        [fieldId, date],
      );
      expect(rows).toHaveLength(1);
      const bookings = await db.query(
        `SELECT 1 FROM bookings WHERE field_id = $1 AND booking_date = $2`,
        [fieldId, date],
      );
      expect(bookings).toHaveLength(1); // the losers' transactions were rolled back completely
    });

    it('uses a voucher, counts it, and enforces the per-user limit', async () => {
      const usedCount = async () =>
        (
          await db.query(`SELECT used_count FROM vouchers WHERE code = $1`, [
            voucherCodes.sale,
          ])
        )[0].used_count;
      const first = await book('u3', inDays(12), '18:00', {
        voucherCode: voucherCodes.sale,
      });
      expect(first.body.data).toMatchObject({
        subtotal: 525000,
        discount: 52500,
        total: 472500,
        voucher: { code: voucherCodes.sale },
      });
      await book('u3', inDays(13), '18:00', {
        voucherCode: voucherCodes.sale,
      }).expect(201);
      expect(await usedCount()).toBe(2);

      const third = await book('u3', inDays(14), '18:00', {
        voucherCode: voucherCodes.sale,
      });
      expect(third.status).toBe(422);
      expect(third.body.message).toBe(
        'You have already used this voucher the maximum number of times',
      );
      expect(await statusAt(inDays(14), '18:00')).toBe('AVAILABLE'); // the failed attempt left nothing behind
      expect(await usedCount()).toBe(2);

      // another user is unaffected
      await book('u1', inDays(14), '18:00', {
        voucherCode: voucherCodes.sale,
      }).expect(201);
      await post(
        `/bookings/${first.body.data.id}/cancel`.replace(
          '/bookings',
          '/bookings',
        ),
        'u3',
        {},
      ).catch(() => undefined);
    });

    it('a usage-limited voucher can only be taken once, even by simultaneous requests', async () => {
      const results = await Promise.all(
        ['u1', 'u2', 'u3'].map((userKey, index) =>
          book(userKey, inDays(15), ['06:00', '07:30', '09:00'][index], {
            voucherCode: voucherCodes.limited,
          }),
        ),
      );
      expect(results.filter((result) => result.status === 201)).toHaveLength(1);
      expect(
        results
          .filter((result) => result.status === 422)
          .every(
            (result) =>
              result.body.message === 'This voucher has been fully used',
          ),
      ).toBe(true);
      expect(
        (
          await db.query(`SELECT used_count FROM vouchers WHERE code = $1`, [
            voucherCodes.limited,
          ])
        )[0].used_count,
      ).toBe(1);
    });

    it('validates the body and needs a token', async () => {
      await http()
        .post('/api/v1/bookings')
        .send({ fieldId, date: TUE, startTime: '18:00' })
        .expect(401);
      await post('/bookings', 'u1', { date: TUE, startTime: '18:00' }).expect(
        400,
      );
      await book('u1', TUE, '18:00', { note: 'x'.repeat(256) }).expect(400);
    });
  });

  describe('my bookings', () => {
    it('lists only my bookings, newest first, with filters and pagination', async () => {
      const all = await get('/bookings/me?limit=50');
      expect(all.status).toBe(200);
      const ids = all.body.data.map((booking: { id: number }) => booking.id);
      expect(ids).toEqual(
        [...ids].sort((left: number, right: number) => right - left),
      );
      expect(
        all.body.data.every(
          (booking: { field: { id: number } }) => booking.field.id === fieldId,
        ),
      ).toBe(true);
      const mine = await db.query(
        `SELECT COUNT(*)::int c FROM bookings WHERE user_id = $1`,
        [users.u1.id],
      );
      expect(all.body.meta.total).toBe(mine[0].c);

      const page = await get('/bookings/me?limit=2&page=2');
      expect(page.body.meta).toMatchObject({ page: 2, limit: 2 });
      expect(page.body.data).toHaveLength(2);

      const range = await get(`/bookings/me?fromDate=${MON}&toDate=${MON}`);
      expect(
        range.body.data.map((booking: { date: string }) => booking.date),
      ).toEqual([MON]);
      expect(range.body.data[0]).toMatchObject({
        status: 'PENDING',
        total: 450000,
        startTime: '16:30',
      });

      const approved = await get('/bookings/me?status=APPROVED');
      expect(
        approved.body.data.every(
          (booking: { status: string }) => booking.status === 'APPROVED',
        ),
      ).toBe(true);
      await get('/bookings/me?status=BOGUS').expect(400);
      await get('/bookings/me?limit=51').expect(400);
      await http().get('/api/v1/bookings/me').expect(401);
    });

    it('shows a booking to its owner only', async () => {
      const created = await book('u2', inDays(20), '10:30').expect(201);
      const id = created.body.data.id;
      expect((await get(`/bookings/${id}`, 'u2')).body.data).toMatchObject({
        id,
        status: 'PENDING',
        startTime: '10:30',
      });
      await get(`/bookings/${id}`, 'u1').expect(404);
      await get('/bookings/999999999', 'u1').expect(404);
      await get('/bookings/abc', 'u1').expect(400);
    });
  });

  describe('cancel', () => {
    const cancel = (
      id: number,
      userKey: string,
      headers: Record<string, string> = {},
    ) =>
      http()
        .patch(`/api/v1/bookings/${id}/cancel`)
        .set(auth(userKey))
        .set(headers);

    it('frees the slot, gives the voucher back and sends an email', async () => {
      const usedCount = async () =>
        (
          await db.query(`SELECT used_count FROM vouchers WHERE code = $1`, [
            voucherCodes.once,
          ])
        )[0].used_count;
      const created = await book('u1', inDays(25), '09:00', {
        voucherCode: voucherCodes.once,
      }).expect(201);
      const id = created.body.data.id;
      expect(await usedCount()).toBe(1);
      await book('u1', inDays(26), '09:00', {
        voucherCode: voucherCodes.once,
      }).expect(422); // per-user limit 1

      const response = await cancel(id, 'u1');
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ id, status: 'CANCELLED' });
      expect(await statusAt(inDays(25), '09:00')).toBe('AVAILABLE');
      expect(await usedCount()).toBe(0);
      await book('u2', inDays(25), '09:00').expect(201); // someone else can take it now
      await book('u1', inDays(26), '09:00', {
        voucherCode: voucherCodes.once,
      }).expect(201); // and the voucher is usable again

      const mail = await mailer.waitFor(users.u1.email, 5000, (message) =>
        message.subject.includes('cancelled'),
      );
      expect(mail.text).toContain(`${tag} Field`);
      expect(mail.text).toContain(inDays(25));
    });

    it('writes the email in the request language', async () => {
      const created = await book('u2', inDays(27), '09:00').expect(201);
      await cancel(created.body.data.id, 'u2', {
        'Accept-Language': 'vi',
      }).expect(200);
      const mail = await mailer.waitFor(users.u2.email, 5000, (message) =>
        message.subject.includes('hủy'),
      );
      expect(mail.subject).toBe('Đơn đặt sân của bạn đã được hủy');
    });

    it('only works once, only while PENDING and only for the owner', async () => {
      const created = await book('u1', inDays(28), '09:00').expect(201);
      const id = created.body.data.id;
      await cancel(id, 'u2').expect(404);
      await cancel(id, 'u1').expect(200);
      const again = await cancel(id, 'u1');
      expect(again.status).toBe(422);
      expect(again.body.message).toBe(
        'Only bookings waiting for admin approval can be cancelled',
      );

      const approved = await book('u1', inDays(29), '09:00').expect(201);
      await db.query(`UPDATE bookings SET status = 'APPROVED' WHERE id = $1`, [
        approved.body.data.id,
      ]);
      await cancel(approved.body.data.id, 'u1').expect(422);
      await cancel(999999999, 'u1').expect(404);
      await http().patch(`/api/v1/bookings/${id}/cancel`).expect(401);
    });

    it('two simultaneous cancellations free the voucher use only once', async () => {
      const created = await book('u3', inDays(30), '09:00', {
        voucherCode: voucherCodes.fixed,
      }).expect(201);
      const before = (
        await db.query(`SELECT used_count FROM vouchers WHERE code = $1`, [
          voucherCodes.fixed,
        ])
      )[0].used_count;
      const [first, second] = await Promise.all([
        cancel(created.body.data.id, 'u3'),
        cancel(created.body.data.id, 'u3'),
      ]);
      expect(
        [first.status, second.status].sort((left, right) => left - right),
      ).toEqual([200, 422]);
      const after = (
        await db.query(`SELECT used_count FROM vouchers WHERE code = $1`, [
          voucherCodes.fixed,
        ])
      )[0].used_count;
      expect(after).toBe(before - 1);
    });
  });

  describe('voucher validation endpoint', () => {
    it('returns the discount for an order amount', async () => {
      const response = await post('/vouchers/validate', 'u1', {
        code: voucherCodes.sale,
        amount: 500000,
      });
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        valid: true,
        code: voucherCodes.sale,
        discount: 50000,
        total: 450000,
      });
    });

    it('rejects unknown codes, small orders and anonymous calls', async () => {
      expect(
        (
          await post('/vouchers/validate', 'u1', {
            code: 'NOPE',
            amount: 500000,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await post('/vouchers/validate', 'u1', {
            code: voucherCodes.sale,
            amount: 1000,
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await post('/vouchers/validate', 'u1', {
            code: voucherCodes.sale,
            amount: -1,
          })
        ).status,
      ).toBe(400);
      await http()
        .post('/api/v1/vouchers/validate')
        .send({ code: 'x', amount: 1 })
        .expect(401);
    });
  });
});
