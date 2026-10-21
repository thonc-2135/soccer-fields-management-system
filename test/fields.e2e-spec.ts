import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from './helpers/create-test-app.js';

/**
 * Creates its own fields (unique name prefix) so it does not depend on the seeder
 * and can filter its own data with `keyword`.
 */
describe('Fields public API (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  const tag = `E2E${Date.now()}`;
  const ids: Record<string, number> = {};
  let typeSmall: number;
  let typeBig: number;
  let userId: number;
  let userEmail: string;
  const password = 'Passw0rd!';
  const day = '2030-01-15';

  const http = () => request(app.getHttpServer());
  const list = (q: Record<string, string | number> = {}) =>
    http()
      .get('/api/v1/fields')
      .query({ keyword: tag, ...q });
  const names = (res: request.Response) =>
    res.body.data.map((f: { name: string }) => f.name);

  beforeAll(async () => {
    ({ app } = await createTestApp());
    db = app.get(DataSource);

    typeSmall = (
      await db.query(
        `INSERT INTO field_types(name, capacity) VALUES ($1, 10) RETURNING id`,
        [`${tag}-5`],
      )
    )[0].id;
    typeBig = (
      await db.query(
        `INSERT INTO field_types(name, capacity) VALUES ($1, 22) RETURNING id`,
        [`${tag}-11`],
      )
    )[0].id;

    const add = async (
      key: string,
      typeId: number,
      address: string,
      rating: number,
      prices: number[],
      status = 'ACTIVE',
    ) => {
      const name = `${tag} ${key}`;
      const id = (
        await db.query(
          `INSERT INTO fields(type_id, name, address, status, avg_rating, review_count)
           VALUES ($1, $2, $3, $4, $5, 3) RETURNING id`,
          [typeId, name, address, status, rating],
        )
      )[0].id;
      const windows = [
        ['06:00', '17:00'],
        ['17:00', '21:00'],
        ['21:00', '23:00'],
      ];
      for (const [i, price] of prices.entries()) {
        await db.query(
          `INSERT INTO field_prices(field_id, start_time, end_time, price) VALUES ($1,$2,$3,$4)`,
          [id, windows[i][0], windows[i][1], price],
        );
      }
      ids[key] = id;
    };
    await add(
      'Alpha',
      typeSmall,
      '1 Trang Tien, Hoan Kiem',
      4.5,
      [150000, 250000, 180000],
    ); // 150k-250k
    await add(
      'Beta',
      typeSmall,
      '2 Hai Ba Trung 100%_sale',
      3.0,
      [200000, 350000, 250000],
    ); // 200k-350k
    await add('Gamma', typeBig, '3 Nguyễn Huệ', 5.0, [400000, 700000, 500000]); // 400k-700k
    await add('Hidden', typeBig, '4 Hidden St', 5.0, [100000], 'INACTIVE');
    await add('Deleted', typeBig, '5 Gone St', 5.0, [100000]);
    await db.query(`UPDATE fields SET deleted_at = now() WHERE id = $1`, [
      ids.Deleted,
    ]);
    await add('NoPrice', typeBig, '6 Free St', 1.0, []);

    await db.query(
      `INSERT INTO field_images(field_id, url, sort_order, is_thumbnail) VALUES
        ($1, '/img/alpha-2.jpg', 2, false), ($1, '/img/alpha-1.jpg', 1, false), ($1, '/img/alpha-thumb.jpg', 3, true)`,
      [ids.Alpha],
    );

    userEmail = `fields_${Date.now()}@example.com`;
    await http()
      .post('/api/v1/auth/register')
      .send({ name: 'Tester', email: userEmail, password });
    await db.query(`UPDATE users SET is_active = true WHERE email = $1`, [
      userEmail,
    ]);
    userId = (
      await db.query(`SELECT id FROM users WHERE email = $1`, [userEmail])
    )[0].id;
    await db.query(`INSERT INTO favorites(user_id, field_id) VALUES ($1, $2)`, [
      userId,
      ids.Alpha,
    ]);
  });

  afterAll(async () => {
    const fieldIds = Object.values(ids);
    await db.query(`DELETE FROM booking_slots WHERE field_id = ANY($1)`, [
      fieldIds,
    ]);
    await db.query(`DELETE FROM bookings WHERE field_id = ANY($1)`, [fieldIds]);
    await db.query(`DELETE FROM fields WHERE id = ANY($1)`, [fieldIds]);
    await db.query(`DELETE FROM field_types WHERE id = ANY($1)`, [
      [typeSmall, typeBig],
    ]);
    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await app.close();
  });

  describe('list', () => {
    it('hides inactive and soft-deleted fields and returns the documented shape', async () => {
      const res = await list({ sort: 'name:asc' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(names(res)).toEqual([
        `${tag} Alpha`,
        `${tag} Beta`,
        `${tag} Gamma`,
        `${tag} NoPrice`,
      ]);
      const alpha = res.body.data[0];
      expect(alpha).toMatchObject({
        id: ids.Alpha,
        address: '1 Trang Tien, Hoan Kiem',
        type: { id: typeSmall, name: `${tag}-5` },
        minPrice: 150000,
        maxPrice: 250000,
        avgRating: 4.5,
        reviewCount: 3,
        isFavorite: false,
        thumbnail: '/img/alpha-thumb.jpg',
      });
      expect(res.body.data[3]).toMatchObject({
        minPrice: null,
        maxPrice: null,
        thumbnail: null,
      });
    });

    it('paginates with a total and caps the page size', async () => {
      const page1 = await list({ sort: 'name:asc', limit: 3 });
      expect(page1.body.meta).toEqual({
        page: 1,
        limit: 3,
        total: 4,
        totalPages: 2,
      });
      expect(page1.body.data).toHaveLength(3);

      const page2 = await list({ sort: 'name:asc', limit: 3, page: 2 });
      expect(names(page2)).toEqual([`${tag} NoPrice`]);

      const beyond = await list({ limit: 3, page: 5 });
      expect(beyond.body.data).toEqual([]);
      expect(beyond.body.meta.total).toBe(4);

      await list({ limit: 51 }).expect(400);
      await list({ page: 0 }).expect(400);
    });

    it('searches by keyword in name or address, treating % and _ literally', async () => {
      expect(
        names(
          await http()
            .get('/api/v1/fields')
            .query({ keyword: `${tag} alpha` }),
        ),
      ).toEqual([`${tag} Alpha`]);
      expect(
        names(
          await http().get('/api/v1/fields').query({ keyword: 'nguyen hue' }),
        ).includes(`${tag} Gamma`),
      ).toBe(true);
      expect(
        names(
          await http().get('/api/v1/fields').query({ keyword: '100%_sale' }),
        ),
      ).toEqual([`${tag} Beta`]);
      expect(
        names(
          await http()
            .get('/api/v1/fields')
            .query({ keyword: `${tag} %` }),
        ),
      ).toEqual([]);
    });

    it('ignores accents and case: "my dinh" finds "Mỹ Đình"', async () => {
      await db.query(
        `UPDATE fields SET address = '7 Đường Mỹ Đình' WHERE id = $1`,
        [ids.Alpha],
      );
      for (const keyword of ['duong my dinh', 'MY DINH', 'Mỹ Đình']) {
        const res = await http()
          .get('/api/v1/fields')
          .query({ keyword, limit: 50 });
        expect(res.body.data.map((f: { id: number }) => f.id)).toContain(
          ids.Alpha,
        );
      }
      await db.query(
        `UPDATE fields SET address = '1 Trang Tien, Hoan Kiem' WHERE id = $1`,
        [ids.Alpha],
      );
    });

    it('filters by type (one or several)', async () => {
      expect(names(await list({ typeId: typeBig, sort: 'name:asc' }))).toEqual([
        `${tag} Gamma`,
        `${tag} NoPrice`,
      ]);
      expect(
        (await list({ typeId: `${typeSmall},${typeBig}` })).body.meta.total,
      ).toBe(4);
    });

    it('filters by price range (overlap with the field price range)', async () => {
      expect(names(await list({ maxPrice: 160000, sort: 'name:asc' }))).toEqual(
        [`${tag} Alpha`],
      );
      expect(names(await list({ minPrice: 600000 }))).toEqual([`${tag} Gamma`]);
      expect(
        names(
          await list({ minPrice: 300000, maxPrice: 450000, sort: 'name:asc' }),
        ),
      ).toEqual([`${tag} Beta`, `${tag} Gamma`]);
    });

    it('filters by minimum rating', async () => {
      expect(names(await list({ minRating: 4, sort: 'name:asc' }))).toEqual([
        `${tag} Alpha`,
        `${tag} Gamma`,
      ]);
    });

    it('combines several criteria at once', async () => {
      const res = await list({
        typeId: typeSmall,
        minPrice: 100000,
        maxPrice: 220000,
        minRating: 4,
      });
      expect(names(res)).toEqual([`${tag} Alpha`]);
    });

    it('sorts by price and rating, keeping fields without prices last', async () => {
      expect(names(await list({ sort: 'price:asc' }))).toEqual([
        `${tag} Alpha`,
        `${tag} Beta`,
        `${tag} Gamma`,
        `${tag} NoPrice`,
      ]);
      expect(names(await list({ sort: 'price:desc' }))).toEqual([
        `${tag} Gamma`,
        `${tag} Beta`,
        `${tag} Alpha`,
        `${tag} NoPrice`,
      ]);
      expect(names(await list({ sort: 'rating:desc' }))).toEqual([
        `${tag} Gamma`,
        `${tag} Alpha`,
        `${tag} Beta`,
        `${tag} NoPrice`,
      ]);
    });

    describe('availability', () => {
      beforeAll(async () => {
        const plus90 = (hhmm: string) => {
          const mins =
            Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) + 90;
          return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
        };
        const mk = async (fieldId: number, start: string) => {
          const end = plus90(start);
          const b = (
            await db.query(
              `INSERT INTO bookings(user_id, field_id, booking_date, start_time, end_time, status, subtotal, total)
               VALUES ($1,$2,$3,$4,$5,'APPROVED',1,1) RETURNING id`,
              [userId, fieldId, day, start, end],
            )
          )[0].id;
          await db.query(
            `INSERT INTO booking_slots(booking_id, field_id, slot_date, slot_start) VALUES ($1,$2,$3,$4)`,
            [b, fieldId, day, start],
          );
        };
        await mk(ids.Alpha, '18:00');
        // Beta is fully booked that day: 06:00 + 11 x 90 min
        const starts = [
          '06:00',
          '07:30',
          '09:00',
          '10:30',
          '12:00',
          '13:30',
          '15:00',
          '16:30',
          '18:00',
          '19:30',
          '21:00',
        ];
        for (const s of starts) await mk(ids.Beta, s);
      });

      it('date: only fields that still have a free slot', async () => {
        expect(names(await list({ date: day, sort: 'name:asc' }))).toEqual([
          `${tag} Alpha`,
          `${tag} Gamma`,
          `${tag} NoPrice`,
        ]);
        expect(
          names(await list({ date: '2030-01-16', sort: 'name:asc' })),
        ).toContain(`${tag} Beta`);
      });

      it('date + startTime: that exact slot must be free and valid', async () => {
        expect(
          names(
            await list({ date: day, startTime: '18:00', sort: 'name:asc' }),
          ),
        ).toEqual([`${tag} Gamma`, `${tag} NoPrice`]);
        expect(
          names(
            await list({ date: day, startTime: '19:30', sort: 'name:asc' }),
          ),
        ).toEqual([`${tag} Alpha`, `${tag} Gamma`, `${tag} NoPrice`]);
        // not on the 90-minute grid / outside opening hours / slot would end after closing
        expect(
          (await list({ date: day, startTime: '18:15' })).body.data,
        ).toEqual([]);
        expect(
          (await list({ date: day, startTime: '05:00' })).body.data,
        ).toEqual([]);
        expect(
          (await list({ date: day, startTime: '22:30' })).body.data,
        ).toEqual([]);
      });

      it('startTime without date and malformed values are rejected', async () => {
        await list({ startTime: '18:00' }).expect(400);
        await list({ date: '2030-13-45' }).expect(400);
        await list({ date: day, startTime: '7pm' }).expect(400);
        await list({ sort: 'color:asc' }).expect(400);
      });
    });
  });

  describe('favorite flag', () => {
    it('is set only for the logged-in user; an invalid token is treated as a guest', async () => {
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: userEmail, password });
      const token = login.body.data.accessToken;

      const asUser = await list({ sort: 'name:asc' }).set(
        'Authorization',
        `Bearer ${token}`,
      );
      expect(
        asUser.body.data.map((f: { isFavorite: boolean }) => f.isFavorite),
      ).toEqual([true, false, false, false]);

      const asBadToken = await list({ sort: 'name:asc' }).set(
        'Authorization',
        'Bearer nope',
      );
      expect(asBadToken.status).toBe(200);
      expect(asBadToken.body.data[0].isFavorite).toBe(false);
    });
  });

  describe('detail', () => {
    it('returns images, price windows, type and booking settings', async () => {
      const res = await http().get(`/api/v1/fields/${ids.Alpha}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: ids.Alpha,
        status: 'ACTIVE',
        type: { id: typeSmall, name: `${tag}-5`, capacity: 10 },
        openTime: '06:00',
        closeTime: '23:00',
        slotMinutes: 90,
        weekendSurchargePercent: 10,
        isFavorite: false,
      });
      expect(res.body.data.images.map((i: { url: string }) => i.url)).toEqual([
        '/img/alpha-thumb.jpg',
        '/img/alpha-1.jpg',
        '/img/alpha-2.jpg',
      ]);
      expect(res.body.data.prices).toMatchObject([
        { startTime: '06:00', endTime: '17:00', price: 150000 },
        { startTime: '17:00', endTime: '21:00', price: 250000 },
        { startTime: '21:00', endTime: '23:00', price: 180000 },
      ]);
    });

    it('404 for missing, inactive and soft-deleted fields; 400 for a bad id', async () => {
      await http().get('/api/v1/fields/999999999').expect(404);
      await http().get(`/api/v1/fields/${ids.Hidden}`).expect(404);
      await http().get(`/api/v1/fields/${ids.Deleted}`).expect(404);
      await http().get('/api/v1/fields/abc').expect(400);
    });
  });

  describe('field types', () => {
    it('lists types ordered by capacity', async () => {
      const res = await http().get('/api/v1/field-types');
      expect(res.status).toBe(200);
      const mine = res.body.data.filter((t: { name: string }) =>
        t.name.startsWith(tag),
      );
      expect(mine.map((t: { capacity: number }) => t.capacity)).toEqual([
        10, 22,
      ]);
    });
  });
});
