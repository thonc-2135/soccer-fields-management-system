import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from './helpers/create-test-app.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const PRICES = [
  { startTime: '06:00', endTime: '17:00', price: 200000 },
  { startTime: '17:00', endTime: '21:00', price: 350000 },
  { startTime: '21:00', endTime: '23:00', price: 250000 },
];

describe('Admin fields API (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  const tag = `adm${Date.now()}`; // lower case: emails are stored lower-cased
  const password = 'Passw0rd!';
  const fieldIds: number[] = [];
  const typeIds: number[] = [];
  const userIds: number[] = [];
  let admin: string;
  let user: string;
  let userId: number;

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = {
    post: (url: string, token = admin) =>
      http().post(`/api/v1${url}`).set(as(token)),
    get: (url: string, token = admin) =>
      http().get(`/api/v1${url}`).set(as(token)),
    patch: (url: string, token = admin) =>
      http().patch(`/api/v1${url}`).set(as(token)),
    put: (url: string, token = admin) =>
      http().put(`/api/v1${url}`).set(as(token)),
    del: (url: string, token = admin) =>
      http().delete(`/api/v1${url}`).set(as(token)),
  };
  const newField = (over: Record<string, unknown> = {}) => ({
    name: `${tag} Field`,
    address: '1 Test Street, Ha Noi',
    type: {
      name: `${tag} type ${Math.random().toString(36).slice(2, 8)}`,
      capacity: 14,
    },
    prices: PRICES,
    ...over,
  });
  const createField = async (over: Record<string, unknown> = {}) => {
    const res = await api.post('/admin/fields').send(newField(over));
    expect(res.status).toBe(201);
    fieldIds.push(res.body.data.id);
    typeIds.push(res.body.data.type.id);
    return res.body.data as { id: number; type: { id: number } };
  };
  const loginAs = async (email: string) =>
    (await http().post('/api/v1/auth/login').send({ email, password })).body
      .data.accessToken as string;
  const uploadDir = (id: number) =>
    join(process.cwd(), 'public', 'uploads', 'fields', String(id));

  beforeAll(async () => {
    ({ app } = await createTestApp());
    db = app.get(DataSource);
    const mk = async (label: string, role: string) => {
      const email = `${tag}_${label}@example.com`;
      await http()
        .post('/api/v1/auth/register')
        .send({ name: label, email, password });
      await db.query(
        `UPDATE users SET is_active = true, role = $2 WHERE email = $1`,
        [email, role],
      );
      const id = (
        await db.query(`SELECT id FROM users WHERE email = $1`, [email])
      )[0].id;
      userIds.push(id);
      return { email, id };
    };
    const a = await mk('admin', 'ADMIN');
    const u = await mk('user', 'USER');
    userId = u.id;
    admin = await loginAs(a.email);
    user = await loginAs(u.email);
  });

  afterAll(async () => {
    await db.query(`DELETE FROM booking_slots WHERE field_id = ANY($1)`, [
      fieldIds,
    ]);
    await db.query(`DELETE FROM bookings WHERE field_id = ANY($1)`, [fieldIds]);
    await db.query(`DELETE FROM fields WHERE id = ANY($1)`, [fieldIds]);
    await db.query(
      `DELETE FROM field_types WHERE id = ANY($1) OR name LIKE $2`,
      [typeIds, `${tag}%`],
    );
    await db.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    for (const id of fieldIds)
      await rm(uploadDir(id), { recursive: true, force: true });
    await app.close();
  });

  describe('access control', () => {
    it('401 without a token, 403 for a normal user', async () => {
      await http().get('/api/v1/admin/fields').expect(401);
      await http().post('/api/v1/admin/fields').send(newField()).expect(401);
      await api.get('/admin/fields', user).expect(403);
      await api.post('/admin/fields', user).send(newField()).expect(403);
      await api
        .post('/admin/field-types', user)
        .send({ name: 'x', capacity: 5 })
        .expect(403);
      await api.del('/admin/fields/1', user).expect(403);
    });
  });

  describe('create', () => {
    it('creates a field together with a new type and price windows', async () => {
      const res = await api.post('/admin/fields').send(newField());
      expect(res.status).toBe(201);
      fieldIds.push(res.body.data.id);
      typeIds.push(res.body.data.type.id);
      expect(res.body.data).toMatchObject({
        name: `${tag} Field`,
        status: 'ACTIVE',
        openTime: '06:00',
        closeTime: '23:00',
        type: { capacity: 14 },
        images: [],
      });
      expect(res.body.data.prices).toMatchObject(PRICES);

      const pub = await http().get('/api/v1/fields').query({ keyword: tag });
      expect(pub.body.data.map((f: { id: number }) => f.id)).toContain(
        res.body.data.id,
      );
    });

    it('can reuse an existing type via typeId', async () => {
      const first = await createField();
      const res = await api.post('/admin/fields').send(
        newField({
          type: undefined,
          typeId: first.type.id,
          name: `${tag} Second`,
        }),
      );
      expect(res.status).toBe(201);
      fieldIds.push(res.body.data.id);
      expect(res.body.data.type.id).toBe(first.type.id);
    });

    it('rejects a missing, duplicated or unknown type', async () => {
      await api
        .post('/admin/fields')
        .send(newField({ type: undefined }))
        .expect(400);
      await api
        .post('/admin/fields')
        .send(newField({ typeId: 1 }))
        .expect(400);
      await api
        .post('/admin/fields')
        .send(newField({ type: undefined, typeId: 999999 }))
        .expect(404);
      const { type } = (await api.get(`/admin/fields/${fieldIds[0]}`)).body
        .data;
      await api
        .post('/admin/fields')
        .send(newField({ type: { name: type.name, capacity: 5 } }))
        .expect(409);
    });

    it('rejects price windows that do not tile the opening hours', async () => {
      const bad = (prices: unknown) =>
        api.post('/admin/fields').send(newField({ prices }));
      const gap = await bad([
        { ...PRICES[0], endTime: '16:00' },
        PRICES[1],
        PRICES[2],
      ]);
      expect(gap.status).toBe(422);
      expect(gap.body.message).toBe('Price windows must not leave gaps');
      expect(
        (await bad([{ ...PRICES[0], endTime: '18:00' }, PRICES[1], PRICES[2]]))
          .status,
      ).toBe(422);
      expect((await bad([PRICES[0], PRICES[1]])).status).toBe(422); // does not reach closing time
      expect((await bad([])).status).toBe(400);
    });

    it('validates opening hours and input shape', async () => {
      await api
        .post('/admin/fields')
        .send(newField({ openTime: '05:00' }))
        .expect(422);
      await api
        .post('/admin/fields')
        .send(newField({ closeTime: '23:30' }))
        .expect(422);
      await api
        .post('/admin/fields')
        .send(newField({ openTime: '25:00' }))
        .expect(400);
      await api
        .post('/admin/fields')
        .send(newField({ name: 'x' }))
        .expect(400);
      await api
        .post('/admin/fields')
        .send(newField({ prices: [{ ...PRICES[0], price: -1 }] }))
        .expect(400);
      await api
        .post('/admin/fields')
        .send({ ...newField(), unknown: 1 })
        .expect(400);
    });

    it('accepts custom opening hours when the prices match them', async () => {
      const res = await api.post('/admin/fields').send(
        newField({
          openTime: '08:00',
          closeTime: '22:00',
          prices: [{ startTime: '08:00', endTime: '22:00', price: 300000 }],
        }),
      );
      expect(res.status).toBe(201);
      fieldIds.push(res.body.data.id);
      typeIds.push(res.body.data.type.id);
      expect(res.body.data).toMatchObject({
        openTime: '08:00',
        closeTime: '22:00',
      });
    });
  });

  describe('list / detail / update', () => {
    let id: number;
    beforeAll(async () => {
      id = (await createField({ name: `${tag} Listed` })).id;
    });

    it('lists fields with filters and pagination, including inactive ones', async () => {
      await api
        .patch(`/admin/fields/${id}`)
        .send({ status: 'INACTIVE' })
        .expect(200);
      const all = await api
        .get('/admin/fields')
        .query({ keyword: tag, limit: 50 });
      expect(all.status).toBe(200);
      expect(all.body.data.map((f: { id: number }) => f.id)).toContain(id);

      const inactive = await api
        .get('/admin/fields')
        .query({ keyword: tag, status: 'INACTIVE' });
      expect(inactive.body.data.map((f: { id: number }) => f.id)).toEqual([id]);
      expect(inactive.body.data[0]).toMatchObject({
        status: 'INACTIVE',
        thumbnail: null,
      });

      const page = await api
        .get('/admin/fields')
        .query({ keyword: tag, limit: 1 });
      expect(page.body.meta).toMatchObject({ page: 1, limit: 1 });
      expect(page.body.meta.total).toBeGreaterThan(1);
      await api.get('/admin/fields').query({ limit: 51 }).expect(400);
    });

    it('an inactive field is hidden publicly but visible to admins', async () => {
      await http().get(`/api/v1/fields/${id}`).expect(404);
      await api.get(`/admin/fields/${id}`).expect(200);
      await api
        .patch(`/admin/fields/${id}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      await http().get(`/api/v1/fields/${id}`).expect(200);
    });

    it('updates plain columns and treats an empty patch as a no-op', async () => {
      const res = await api
        .patch(`/admin/fields/${id}`)
        .send({ name: `${tag} Renamed`, description: 'New text' });
      expect(res.body.data).toMatchObject({
        name: `${tag} Renamed`,
        description: 'New text',
      });
      await api.patch(`/admin/fields/${id}`).send({}).expect(200);
      await api
        .patch(`/admin/fields/${id}`)
        .send({ typeId: 999999 })
        .expect(404);
      await api
        .patch('/admin/fields/999999')
        .send({ name: 'nope!' })
        .expect(404);
    });

    it('changing opening hours needs matching prices, which can be sent in the same request', async () => {
      await api
        .patch(`/admin/fields/${id}`)
        .send({ openTime: '08:00', closeTime: '22:00' })
        .expect(422);
      const ok = await api.patch(`/admin/fields/${id}`).send({
        openTime: '08:00',
        closeTime: '22:00',
        prices: [{ startTime: '08:00', endTime: '22:00', price: 280000 }],
      });
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({
        openTime: '08:00',
        closeTime: '22:00',
      });
      expect(ok.body.data.prices).toHaveLength(1);
    });

    it('PUT /prices replaces the windows and validates them', async () => {
      await api
        .put(`/admin/fields/${id}/prices`)
        .send({ prices: PRICES })
        .expect(422); // still 08:00-22:00
      const ok = await api.put(`/admin/fields/${id}/prices`).send({
        prices: [
          { startTime: '08:00', endTime: '17:00', price: 100000 },
          { startTime: '17:00', endTime: '22:00', price: 400000 },
        ],
      });
      expect(ok.status).toBe(200);
      expect(
        ok.body.data.prices.map((p: { price: number }) => p.price),
      ).toEqual([100000, 400000]);
    });
  });

  describe('images', () => {
    let id: number;
    beforeAll(async () => {
      id = (await createField({ name: `${tag} Images` })).id;
    });
    const upload = (
      n: number,
      fid = id,
      name = 'a.png',
      type = 'image/png',
      content: Buffer = PNG,
    ) => {
      const req = api.post(`/admin/fields/${fid}/images`);
      for (let i = 0; i < n; i++)
        req.attach('images', content, { filename: name, contentType: type });
      return req;
    };

    it('stores several images, the first becomes the thumbnail', async () => {
      const res = await upload(3);
      expect(res.status).toBe(201);
      expect(res.body.data).toHaveLength(3);
      expect(
        res.body.data.map((i: { isThumbnail: boolean }) => i.isThumbnail),
      ).toEqual([true, false, false]);
      for (const img of res.body.data) {
        expect(img.url).toMatch(
          new RegExp(`^/public/uploads/fields/${id}/[0-9a-f-]{36}\\.png$`),
        );
        expect(existsSync(join(process.cwd(), img.url))).toBe(true);
      }
      const detail = await http().get(`/api/v1/fields/${id}`);
      expect(detail.body.data.images).toHaveLength(3);
      expect(detail.body.data.images[0].isThumbnail).toBe(true);
    });

    it('rejects non-images (even with an image mimetype), big files and empty requests', async () => {
      const before = (await api.get(`/admin/fields/${id}`)).body.data.images
        .length;
      await upload(
        1,
        id,
        'evil.png',
        'image/png',
        Buffer.from('<?php echo 1; ?>'),
      ).expect(400);
      await upload(1, id, 'doc.txt', 'text/plain', Buffer.from('hello')).expect(
        400,
      );
      await upload(
        1,
        id,
        'huge.png',
        'image/png',
        Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]),
      ).expect(413);
      await api.post(`/admin/fields/${id}/images`).expect(400);
      await upload(1, 999999).expect(404);
      expect(
        (await api.get(`/admin/fields/${id}`)).body.data.images,
      ).toHaveLength(before);
    });

    it('allows at most 10 images per field (and 10 per request)', async () => {
      await upload(7).expect(201); // 3 + 7 = 10
      await upload(1).expect(422);
      const other = (await createField({ name: `${tag} Images2` })).id;
      await upload(11, other).expect(400);
    });

    it('changes the thumbnail and removes images (file included)', async () => {
      const { images } = (await api.get(`/admin/fields/${id}`)).body.data;
      const [first, second] = images;
      await api
        .patch(`/admin/fields/${id}/images/${second.id}/thumbnail`)
        .expect(204);
      const after = (await api.get(`/admin/fields/${id}`)).body.data.images;
      expect(
        after
          .filter((i: { isThumbnail: boolean }) => i.isThumbnail)
          .map((i: { id: number }) => i.id),
      ).toEqual([second.id]);

      await api.del(`/admin/fields/${id}/images/${second.id}`).expect(204);
      expect(existsSync(join(process.cwd(), second.url))).toBe(false);
      const left = (await api.get(`/admin/fields/${id}`)).body.data.images;
      expect(left.some((i: { isThumbnail: boolean }) => i.isThumbnail)).toBe(
        true,
      ); // promoted
      expect(left.map((i: { id: number }) => i.id)).toContain(first.id);

      await api.del(`/admin/fields/${id}/images/${second.id}`).expect(404);
      await api
        .del(`/admin/fields/${id + 1000000}/images/${first.id}`)
        .expect(404);
    });
  });

  describe('delete', () => {
    const booking = async (fieldId: number, date: string, status: string) =>
      db.query(
        `INSERT INTO bookings(user_id, field_id, booking_date, start_time, end_time, status, subtotal, total)
         VALUES ($1,$2,$3,'18:00','19:30',$4,1,1)`,
        [userId, fieldId, date, status],
      );

    it('is refused while pending or approved upcoming bookings exist', async () => {
      const { id } = await createField({ name: `${tag} Busy` });
      await booking(id, '2099-01-01', 'APPROVED');
      const res = await api.del(`/admin/fields/${id}`);
      expect(res.status).toBe(422);
      expect(res.body.message).toBe(
        'Cannot delete a field that has pending or approved upcoming bookings',
      );

      await db.query(
        `UPDATE bookings SET status = 'PENDING' WHERE field_id = $1`,
        [id],
      );
      await api.del(`/admin/fields/${id}`).expect(422);
      await http().get(`/api/v1/fields/${id}`).expect(200); // still there
    });

    it('works when only cancelled, rejected, completed or past bookings remain', async () => {
      const { id } = await createField({ name: `${tag} Free` });
      await booking(id, '2099-01-01', 'CANCELLED');
      await booking(id, '2099-01-02', 'REJECTED');
      await booking(id, '2000-01-01', 'APPROVED');
      await api.del(`/admin/fields/${id}`).expect(204);

      await http().get(`/api/v1/fields/${id}`).expect(404);
      await api.get(`/admin/fields/${id}`).expect(404);
      await api.del(`/admin/fields/${id}`).expect(404);
      const list = await api
        .get('/admin/fields')
        .query({ keyword: `${tag} Free` });
      expect(list.body.data).toEqual([]);
    });
  });

  describe('field types', () => {
    it('create, rename, conflict and delete rules', async () => {
      const name = `${tag} custom`;
      const created = await api
        .post('/admin/field-types')
        .send({ name, capacity: 8, description: 'd' });
      expect(created.status).toBe(201);
      const id = created.body.data.id;
      typeIds.push(id);

      await api
        .post('/admin/field-types')
        .send({ name, capacity: 8 })
        .expect(409);
      await api
        .post('/admin/field-types')
        .send({ name: `${tag} x`, capacity: 0 })
        .expect(400);

      const renamed = await api
        .patch(`/admin/field-types/${id}`)
        .send({ name: `${name} 2`, capacity: 9 });
      expect(renamed.body.data).toMatchObject({
        name: `${name} 2`,
        capacity: 9,
      });
      await api
        .patch(`/admin/field-types/${id}`)
        .send({ name: `${tag} Field type?` })
        .expect(200);
      await api
        .patch('/admin/field-types/999999')
        .send({ name: 'x' })
        .expect(404);

      const used = await createField();
      await api.del(`/admin/field-types/${used.type.id}`).expect(409);
      await api.del(`/admin/field-types/${id}`).expect(204);
      await api.del(`/admin/field-types/${id}`).expect(404);
    });
  });
});
