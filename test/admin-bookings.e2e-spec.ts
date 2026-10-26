import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { addDays } from '../src/bookings/booking-calendar.js';
import { BookingTasksService } from '../src/bookings/booking-tasks.service.js';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../src/redis/redis.constants.js';
import { createTestApp, type FakeMailer } from './helpers/create-test-app.js';

// 10:00 on Thursday 2030-01-10 in Vietnam (UTC+7)
const NOW = new Date('2030-01-10T03:00:00Z');
const TODAY = '2030-01-10';
const inDays = (days: number) => addDays(TODAY, days);

describe('Admin bookings (e2e)', () => {
  let app: INestApplication;
  let mailer: FakeMailer;
  let db: DataSource;
  const tag = `adm${Date.now()}`;
  const password = 'Passw0rd!';
  let fieldId: number;
  let otherFieldId: number;
  let voucherCode: string;
  const users: Record<string, { id: number; email: string; token: string }> =
    {};

  const http = () => request(app.getHttpServer());
  const as = (userKey: string) => ({
    Authorization: `Bearer ${users[userKey].token}`,
  });
  const get = (url: string, userKey = 'admin') =>
    http().get(`/api/v1${url}`).set(as(userKey));
  const patch = (url: string, userKey = 'admin', body: object = {}) =>
    http().patch(`/api/v1${url}`).set(as(userKey)).send(body);
  const book = async (
    userKey: string,
    date: string,
    startTime: string,
    extra: object = {},
    field = fieldId,
  ): Promise<number> => {
    const response = await http()
      .post('/api/v1/bookings')
      .set(as(userKey))
      .send({ fieldId: field, date, startTime, ...extra });
    expect(response.status).toBe(201);
    return response.body.data.id;
  };
  const statusOf = async (id: number): Promise<string> =>
    (await db.query(`SELECT status FROM bookings WHERE id = $1`, [id]))[0]
      .status;
  const slotCount = async (id: number): Promise<number> =>
    (
      await db.query(
        `SELECT COUNT(*)::int AS count FROM booking_slots WHERE booking_id = $1`,
        [id],
      )
    )[0].count;
  /** A booking that bypasses the API rules, to set up past or already-decided bookings. */
  const insertBooking = async (
    userKey: string,
    date: string,
    startTime: string,
    endTime: string,
    status: string,
  ): Promise<number> => {
    const id = (
      await db.query(
        `INSERT INTO bookings(user_id, field_id, booking_date, start_time, end_time, status, subtotal, discount, total)
         VALUES ($1,$2,$3,$4,$5,$6,300000,0,300000) RETURNING id`,
        [users[userKey].id, fieldId, date, startTime, endTime, status],
      )
    )[0].id;
    await db.query(
      `INSERT INTO booking_slots(booking_id, field_id, slot_date, slot_start) VALUES ($1,$2,$3,$4)`,
      [id, fieldId, date, startTime],
    );
    return id;
  };

  beforeAll(async () => {
    ({ app, mailer } = await createTestApp({ now: NOW }));
    db = app.get(DataSource);

    const typeId = (
      await db.query(
        `INSERT INTO field_types(name, capacity) VALUES ($1, 14) RETURNING id`,
        [`${tag} type`],
      )
    )[0].id;
    const makeField = async (name: string) => {
      const id = (
        await db.query(
          `INSERT INTO fields(type_id, name, address, status) VALUES ($1,$2,'1 Test St','ACTIVE') RETURNING id`,
          [typeId, name],
        )
      )[0].id;
      await db.query(
        `INSERT INTO field_prices(field_id, start_time, end_time, price) VALUES ($1,'06:00','23:00',200000)`,
        [id],
      );
      return id as number;
    };
    fieldId = await makeField(`${tag} Field`);
    otherFieldId = await makeField(`${tag} Other`);

    voucherCode = `${tag}-sale`.toUpperCase();
    await db.query(
      `INSERT INTO vouchers(code,type,value,max_discount,min_order_amount,per_user_limit,start_at,end_at,is_active)
       VALUES ($1,'FIXED',20000,NULL,0,NULL,'2029-12-01T00:00:00Z','2030-12-31T00:00:00Z',true)`,
      [voucherCode],
    );

    for (const label of ['admin', 'u1', 'u2']) {
      const email = `${tag}_${label}@example.com`;
      await http()
        .post('/api/v1/auth/register')
        .send({
          name: label === 'u1' ? 'Nguyễn Văn An' : label.toUpperCase(),
          email,
          password,
        });
      await db.query(
        `UPDATE users SET is_active = true, role = $2 WHERE email = $1`,
        [email, label === 'admin' ? 'ADMIN' : 'USER'],
      );
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
    const ids = [fieldId, otherFieldId];
    await db.query(`DELETE FROM bookings WHERE field_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM fields WHERE id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM field_types WHERE name = $1`, [`${tag} type`]);
    await db.query(`DELETE FROM vouchers WHERE code = $1`, [voucherCode]);
    await db.query(`DELETE FROM users WHERE email LIKE $1`, [`${tag}_%`]);
    await app.close();
  });

  describe('access', () => {
    it('rejects anonymous callers and plain users', async () => {
      expect((await http().get('/api/v1/admin/bookings')).status).toBe(401);
      expect((await get('/admin/bookings', 'u1')).status).toBe(403);
      expect((await patch('/admin/bookings/1/approve', 'u1')).status).toBe(403);
      expect(
        (await get(`/admin/bookings/calendar?from=${TODAY}&to=${TODAY}`, 'u1'))
          .status,
      ).toBe(403);
    });
  });

  describe('approve', () => {
    it('approves a pending booking, records the admin and emails the customer', async () => {
      const id = await book('u1', inDays(10), '07:30');
      const response = await patch(`/admin/bookings/${id}/approve`);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id,
        status: 'APPROVED',
        user: { id: users.u1.id, email: users.u1.email },
        handledBy: { id: users.admin.id },
      });
      const mail = await mailer.waitFor(users.u1.email, 5000, (message) =>
        /approved|xác nhận/i.test(message.subject),
      );
      expect(mail.text).toContain(`${tag} Field`);
      expect(mail.text).toContain(inDays(10));
    });

    it('only decides a booking once', async () => {
      const id = await book('u1', inDays(10), '09:00');
      await patch(`/admin/bookings/${id}/approve`);
      const again = await patch(`/admin/bookings/${id}/approve`);
      expect(again.status).toBe(422);
      const reject = await patch(`/admin/bookings/${id}/reject`, 'admin', {
        reason: 'too late',
      });
      expect(reject.status).toBe(422);
      expect(await statusOf(id)).toBe('APPROVED');
    });

    it('stops the customer from cancelling once approved', async () => {
      const id = await book('u1', inDays(10), '10:30');
      await patch(`/admin/bookings/${id}/approve`);
      const cancel = await patch(`/bookings/${id}/cancel`, 'u1');
      expect(cancel.status).toBe(422);
    });

    it('refuses a booking whose start time has already passed', async () => {
      const id = await insertBooking('u1', TODAY, '08:00', '09:30', 'PENDING');
      const response = await patch(`/admin/bookings/${id}/approve`);
      expect(response.status).toBe(422);
      expect(await statusOf(id)).toBe('PENDING');
    });

    it('returns 404 for an unknown booking', async () => {
      expect((await patch('/admin/bookings/999999999/approve')).status).toBe(
        404,
      );
    });

    it('lets exactly one of an admin approval and a customer cancellation win', async () => {
      for (const date of [inDays(11), inDays(12), inDays(13)]) {
        const id = await book('u2', date, '07:30');
        const [approve, cancel] = await Promise.all([
          patch(`/admin/bookings/${id}/approve`),
          patch(`/bookings/${id}/cancel`, 'u2'),
        ]);
        expect([approve.status, cancel.status].sort()).toEqual([200, 422]);
        expect(await statusOf(id)).toBe(
          approve.status === 200 ? 'APPROVED' : 'CANCELLED',
        );
      }
    });
  });

  describe('reject', () => {
    it('requires a reason', async () => {
      const id = await book('u1', inDays(14), '07:30');
      const response = await patch(`/admin/bookings/${id}/reject`, 'admin', {});
      expect(response.status).toBe(400);
      expect(await statusOf(id)).toBe('PENDING');
    });

    it('rejects, frees the slot and the voucher use, and emails the reason', async () => {
      const date = inDays(14);
      const id = await book('u1', date, '09:00', { voucherCode });
      const usedBefore = (
        await db.query(`SELECT used_count FROM vouchers WHERE code = $1`, [
          voucherCode,
        ])
      )[0].used_count;
      expect(usedBefore).toBe(1);

      const response = await patch(`/admin/bookings/${id}/reject`, 'admin', {
        reason: 'Pitch under repair',
      });
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        status: 'REJECTED',
        rejectReason: 'Pitch under repair',
        handledBy: { id: users.admin.id },
      });
      expect(await slotCount(id)).toBe(0);
      expect(
        (
          await db.query(`SELECT used_count FROM vouchers WHERE code = $1`, [
            voucherCode,
          ])
        )[0].used_count,
      ).toBe(0);

      const mail = await mailer.waitFor(
        users.u1.email,
        5000,
        (message) => message.text?.includes('Pitch under repair') ?? false,
      );
      expect(mail.text).toContain(date);

      // the slot can be booked by someone else again
      await book('u2', date, '09:00');
    });
  });

  describe('list and detail', () => {
    let pendingId: number;
    let approvedId: number;
    let otherFieldBookingId: number;

    beforeAll(async () => {
      pendingId = await book('u1', inDays(20), '07:30');
      approvedId = await book('u2', inDays(21), '07:30');
      await patch(`/admin/bookings/${approvedId}/approve`);
      otherFieldBookingId = await book(
        'u1',
        inDays(22),
        '07:30',
        {},
        otherFieldId,
      );
    });

    const ids = (response: request.Response): number[] =>
      response.body.data.map((item: { id: number }) => item.id);

    it('filters by status, field and user', async () => {
      const byStatus = await get(
        `/admin/bookings?status=APPROVED&fieldId=${fieldId}&limit=50`,
      );
      expect(byStatus.status).toBe(200);
      expect(ids(byStatus)).toContain(approvedId);
      expect(ids(byStatus)).not.toContain(pendingId);

      const byField = await get(
        `/admin/bookings?fieldId=${otherFieldId}&userId=${users.u1.id}`,
      );
      expect(ids(byField)).toEqual([otherFieldBookingId]);
    });

    it('filters by play date and by creation date', async () => {
      const byDate = await get(
        `/admin/bookings?fieldId=${fieldId}&fromDate=${inDays(20)}&toDate=${inDays(20)}`,
      );
      expect(ids(byDate)).toEqual([pendingId]);

      const created = await get(
        `/admin/bookings?fieldId=${fieldId}&createdFrom=2000-01-01&createdTo=2000-01-02`,
      );
      expect(created.body.meta.total).toBe(0);
      const createdToday = await get(
        `/admin/bookings?fieldId=${fieldId}&createdFrom=2000-01-01&createdTo=2100-01-01`,
      );
      expect(createdToday.body.meta.total).toBeGreaterThan(0);
    });

    it('searches the customer by name (accent-insensitive) or email', async () => {
      const byName = await get(
        `/admin/bookings?keyword=nguyen van an&fieldId=${fieldId}`,
      );
      expect(ids(byName)).toContain(pendingId);
      expect(ids(byName)).not.toContain(approvedId);

      const byEmail = await get(
        `/admin/bookings?keyword=${encodeURIComponent(users.u2.email)}&fieldId=${fieldId}`,
      );
      expect(ids(byEmail)).toContain(approvedId);
      expect(ids(byEmail)).not.toContain(pendingId);
    });

    it('sorts and paginates', async () => {
      const response = await get(
        `/admin/bookings?fieldId=${fieldId}&sort=date:asc&limit=2&page=1`,
      );
      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(2);
      const dates = response.body.data.map(
        (item: { date: string }) => item.date,
      );
      expect(dates).toEqual([...dates].sort());
      expect(response.body.meta).toMatchObject({ page: 1, limit: 2 });

      expect((await get('/admin/bookings?sort=nope')).status).toBe(400);
    });

    it('shows one booking with its customer, or 404', async () => {
      const response = await get(`/admin/bookings/${pendingId}`);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id: pendingId,
        status: 'PENDING',
        user: { email: users.u1.email },
        handledBy: null,
      });
      expect(response.body.data.priceBreakdown.length).toBeGreaterThan(0);
      expect((await get('/admin/bookings/999999999')).status).toBe(404);
    });
  });

  describe('calendar', () => {
    it('lists active bookings of the range, optionally for one field', async () => {
      const date = inDays(30);
      const kept = await book('u1', date, '07:30');
      const rejected = await book('u2', date, '09:00');
      await patch(`/admin/bookings/${rejected}/reject`, 'admin', {
        reason: 'x',
      });
      const elsewhere = await book('u1', date, '07:30', {}, otherFieldId);

      const response = await get(
        `/admin/bookings/calendar?from=${date}&to=${date}&fieldId=${fieldId}`,
      );
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([
        {
          bookingId: kept,
          fieldId,
          fieldName: `${tag} Field`,
          user: { id: users.u1.id, name: 'Nguyễn Văn An' },
          start: `${date}T07:30`,
          end: `${date}T09:00`,
          status: 'PENDING',
        },
      ]);

      const all = await get(`/admin/bookings/calendar?from=${date}&to=${date}`);
      const calendarIds = all.body.data.map(
        (entry: { bookingId: number }) => entry.bookingId,
      );
      expect(calendarIds).toEqual(expect.arrayContaining([kept, elsewhere]));
      expect(calendarIds).not.toContain(rejected);
    });

    it('validates the range', async () => {
      const bad = [
        `from=${inDays(5)}&to=${inDays(4)}`,
        `from=${TODAY}&to=${inDays(62)}`,
        `from=${TODAY}`,
        `from=nope&to=${TODAY}`,
      ];
      const statuses = await Promise.all(
        bad.map(
          async (query) =>
            (await get(`/admin/bookings/calendar?${query}`)).status,
        ),
      );
      expect(statuses).toEqual([422, 422, 400, 400]);
      expect(
        (await get(`/admin/bookings/calendar?from=${TODAY}&to=${inDays(61)}`))
          .status,
      ).toBe(200);
    });
  });

  describe('scheduled jobs', () => {
    it('cancels pending bookings that started without a decision and tells the customer', async () => {
      const stale = await insertBooking(
        'u2',
        TODAY,
        '07:00',
        '08:30',
        'PENDING',
      );
      const later = await insertBooking(
        'u2',
        TODAY,
        '15:00',
        '16:30',
        'PENDING',
      );
      const yesterday = await insertBooking(
        'u2',
        inDays(-1),
        '15:00',
        '16:30',
        'PENDING',
      );

      const tasks = app.get(BookingTasksService);
      expect(await tasks.expirePending()).toBeGreaterThanOrEqual(2);

      expect(await statusOf(stale)).toBe('CANCELLED');
      expect(await statusOf(yesterday)).toBe('CANCELLED');
      expect(await slotCount(stale)).toBe(0);
      expect(await statusOf(later)).toBe('PENDING');
      expect(await slotCount(later)).toBe(1);
      await mailer.waitFor(users.u2.email, 5000, (message) =>
        /hết hạn|expired/i.test(message.subject),
      );
    });

    it('completes approved bookings that have finished', async () => {
      const done = await insertBooking(
        'u1',
        TODAY,
        '07:00',
        '08:30',
        'APPROVED',
      );
      const playing = await insertBooking(
        'u1',
        TODAY,
        '09:30',
        '11:00',
        'APPROVED',
      );
      const old = await insertBooking(
        'u1',
        inDays(-3),
        '07:00',
        '08:30',
        'APPROVED',
      );
      const future = await insertBooking(
        'u1',
        inDays(40),
        '07:00',
        '08:30',
        'APPROVED',
      );
      const tasks = app.get(BookingTasksService);
      expect(await tasks.completeFinished()).toBeGreaterThanOrEqual(2);

      expect(await statusOf(done)).toBe('COMPLETED');
      expect(await statusOf(old)).toBe('COMPLETED');
      expect(await statusOf(playing)).toBe('APPROVED');
      expect(await statusOf(future)).toBe('APPROVED');
    });

    it('runs a job on one instance at a time', async () => {
      const tasks = app.get(BookingTasksService);
      await app.get<Redis>(REDIS_CLIENT).del('lock:cron:expire-pending'); // left over from an earlier run
      const spy = vi.spyOn(tasks, 'expirePending');
      await Promise.all([tasks.runExpirePending(), tasks.runExpirePending()]);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });
});
