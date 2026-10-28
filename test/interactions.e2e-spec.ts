import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { addDays } from '../src/bookings/booking-calendar.js';
import { createTestApp } from './helpers/create-test-app.js';

// 10:00 on Thursday 2030-01-10 in Vietnam (UTC+7)
const NOW = new Date('2030-01-10T03:00:00Z');
const TODAY = '2030-01-10';
const inDays = (days: number) => addDays(TODAY, days);

describe('Reviews, comments, favorites and timeline (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  const tag = `ix${Date.now()}`;
  const password = 'Passw0rd!';
  let fieldId: number;
  let secondFieldId: number;
  const users: Record<string, { id: number; email: string; token: string }> =
    {};

  const http = () => request(app.getHttpServer());
  const as = (userKey: string) => ({
    Authorization: `Bearer ${users[userKey].token}`,
  });
  const get = (url: string, userKey?: string) => {
    const call = http().get(`/api/v1${url}`);
    return userKey ? call.set(as(userKey)) : call;
  };
  const send = (
    method: 'post' | 'patch' | 'delete',
    url: string,
    userKey: string,
    body: object = {},
  ) => http()[method](`/api/v1${url}`).set(as(userKey)).send(body);

  const makeBooking = async (
    userKey: string,
    onField: number,
    status: string,
    date = inDays(-3),
    start = '07:00',
  ) =>
    (
      await db.query(
        `INSERT INTO bookings(user_id, field_id, booking_date, start_time, end_time, status, subtotal, discount, total)
         VALUES ($1,$2,$3,$4,'08:30',$5,300000,0,300000) RETURNING id`,
        [users[userKey].id, onField, date, start, status],
      )
    )[0].id as number;
  const review = (userKey: string, rating: number, content = 'Sân tốt') =>
    send('post', `/fields/${fieldId}/reviews`, userKey, { rating, content });
  const fieldStats = async (id = fieldId) =>
    (
      await db.query(
        `SELECT avg_rating::float AS avg, review_count AS count FROM fields WHERE id = $1`,
        [id],
      )
    )[0] as { avg: number; count: number };
  /** Activities are written asynchronously by an event listener. */
  const activitiesOf = async (
    userKey: string,
    expected: number,
    query = '',
  ): Promise<{ type: string; [key: string]: unknown }[]> => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const response = await get(`/activities/me?limit=50${query}`, userKey);
      if (response.body.data.length >= expected) return response.body.data;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return (await get(`/activities/me?limit=50${query}`, userKey)).body.data;
  };

  beforeAll(async () => {
    ({ app } = await createTestApp({ now: NOW }));
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
    secondFieldId = await makeField(`${tag} Second`);

    for (const label of ['admin', 'u1', 'u2', 'u3', 'u4']) {
      const email = `${tag}_${label}@example.com`;
      await http()
        .post('/api/v1/auth/register')
        .send({ name: label.toUpperCase(), email, password });
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
    // u1, u2, u3 have a finished / confirmed booking at the field; u4 only a pending one
    await makeBooking('u1', fieldId, 'COMPLETED');
    await makeBooking('u2', fieldId, 'APPROVED');
    await makeBooking('u3', fieldId, 'COMPLETED');
    await makeBooking('u4', fieldId, 'PENDING');
  });

  afterAll(async () => {
    const ids = [fieldId, secondFieldId];
    await db.query(
      `DELETE FROM comments WHERE review_id IN (SELECT id FROM reviews WHERE field_id = ANY($1))`,
      [ids],
    );
    await db.query(`DELETE FROM reviews WHERE field_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM bookings WHERE field_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM fields WHERE id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM field_types WHERE name = $1`, [`${tag} type`]);
    await db.query(`DELETE FROM users WHERE email LIKE $1`, [`${tag}_%`]); // activities cascade
    await app.close();
  });

  describe('reviews', () => {
    let u1ReviewId: number;

    it('needs a login and a confirmed or finished booking at the field', async () => {
      const anonymous = await http()
        .post(`/api/v1/fields/${fieldId}/reviews`)
        .send({ rating: 5, content: 'x' });
      expect(anonymous.status).toBe(401);

      expect((await review('u4', 5)).status).toBe(403); // only a PENDING booking
      expect(
        (
          await send('post', `/fields/${secondFieldId}/reviews`, 'u1', {
            rating: 5,
            content: 'x',
          })
        ).status,
      ).toBe(403); // no booking at that field
      expect(
        (
          await send('post', '/fields/999999999/reviews', 'u1', {
            rating: 5,
            content: 'x',
          })
        ).status,
      ).toBe(404);
    });

    it('validates rating and content', async () => {
      for (const body of [
        { rating: 0, content: 'x' },
        { rating: 6, content: 'x' },
        { rating: 3.5, content: 'x' },
        { rating: 3, content: '   ' },
        { rating: 3 },
      ]) {
        const response = await send(
          'post',
          `/fields/${fieldId}/reviews`,
          'u1',
          body,
        );
        expect(response.status).toBe(400);
      }
    });

    it('creates a review, updates the field rating and allows only one per user', async () => {
      const response = await review('u1', 4, '  Mặt sân đẹp  ');
      expect(response.status).toBe(201);
      u1ReviewId = response.body.data.id;
      expect(response.body.data).toMatchObject({
        fieldId,
        rating: 4,
        content: 'Mặt sân đẹp',
        commentCount: 0,
        user: { id: users.u1.id, name: 'U1' },
      });
      expect(await fieldStats()).toEqual({ avg: 4, count: 1 });

      expect((await review('u1', 5)).status).toBe(409);
      expect(await fieldStats()).toEqual({ avg: 4, count: 1 });
    });

    it('averages ratings of different users', async () => {
      expect((await review('u2', 5)).status).toBe(201);
      expect(await fieldStats()).toEqual({ avg: 4.5, count: 2 });
    });

    it('keeps rating and count right when reviews arrive at the same time', async () => {
      const [first, second] = await Promise.all([
        review('u3', 2),
        // u3 is the only new reviewer; a duplicate from the same user must lose cleanly
        review('u3', 3),
      ]);
      expect([first.status, second.status].sort()).toEqual([201, 409]);
      const stats = await fieldStats();
      expect(stats.count).toBe(3);
      const rows = await db.query(
        `SELECT ROUND(AVG(rating), 1)::float AS avg FROM reviews WHERE field_id = $1 AND deleted_at IS NULL`,
        [fieldId],
      );
      expect(stats.avg).toBe(rows[0].avg);
    });

    it('lists reviews publicly, newest first, filterable by rating and paginated', async () => {
      const all = await get(`/fields/${fieldId}/reviews`);
      expect(all.status).toBe(200);
      expect(all.body.meta.total).toBe(3);
      expect(all.body.data[0].user.id).toBe(users.u3.id);

      const fives = await get(`/fields/${fieldId}/reviews?rating=5`);
      expect(
        fives.body.data.map((item: { id: number }) => item.id),
      ).toHaveLength(1);
      const page = await get(`/fields/${fieldId}/reviews?limit=2&page=2`);
      expect(page.body.data).toHaveLength(1);
      expect((await get('/fields/999999999/reviews')).status).toBe(404);
    });

    it('shows the new rating on the field itself', async () => {
      const detail = await get(`/fields/${fieldId}`);
      expect(detail.body.data.reviewCount).toBe(3);
    });

    it('lets only the author edit a review', async () => {
      expect(
        (await send('patch', `/reviews/${u1ReviewId}`, 'u2', { rating: 1 }))
          .status,
      ).toBe(403);
      expect(
        (await send('patch', `/reviews/${u1ReviewId}`, 'u1', {})).status,
      ).toBe(400);

      const response = await send('patch', `/reviews/${u1ReviewId}`, 'u1', {
        rating: 2,
        content: 'Sửa lại',
      });
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        rating: 2,
        content: 'Sửa lại',
      });
      const stats = await fieldStats();
      expect(stats.count).toBe(3);
      expect(
        (await send('patch', '/reviews/999999999', 'u1', { rating: 1 })).status,
      ).toBe(404);
    });

    it('lets the author or an admin delete, recalculates, and allows a new review', async () => {
      const before = await fieldStats();
      expect(
        (await send('delete', `/reviews/${u1ReviewId}`, 'u2')).status,
      ).toBe(403);

      expect(
        (await send('delete', `/reviews/${u1ReviewId}`, 'admin')).status,
      ).toBe(204);
      const after = await fieldStats();
      expect(after.count).toBe(before.count - 1);
      expect((await get(`/fields/${fieldId}/reviews`)).body.meta.total).toBe(2);
      expect(
        (await send('delete', `/reviews/${u1ReviewId}`, 'admin')).status,
      ).toBe(404);

      // a deleted review does not block a new one
      expect((await review('u1', 5)).status).toBe(201);
      expect((await fieldStats()).count).toBe(3);
    });
  });

  describe('comments', () => {
    let reviewId: number;
    let rootId: number;
    let replyId: number;

    const comment = (userKey: string, body: object, onReview = reviewId) =>
      send('post', `/reviews/${onReview}/comments`, userKey, body);

    beforeAll(async () => {
      reviewId = (await get(`/fields/${fieldId}/reviews?rating=5`)).body.data[0]
        .id;
    });

    it('needs a login and a valid body', async () => {
      expect(
        (
          await http()
            .post(`/api/v1/reviews/${reviewId}/comments`)
            .send({ content: 'x' })
        ).status,
      ).toBe(401);
      expect((await comment('u2', { content: '  ' })).status).toBe(400);
      expect((await comment('u2', {}, reviewId)).status).toBe(400);
      expect((await comment('u2', { content: 'x' }, 999999999)).status).toBe(
        404,
      );
    });

    it('lets any logged-in user comment, even without a booking', async () => {
      const response = await comment('u4', { content: ' Cảm ơn bạn ' });
      expect(response.status).toBe(201);
      rootId = response.body.data.id;
      expect(response.body.data).toMatchObject({
        reviewId,
        parentId: null,
        content: 'Cảm ơn bạn',
        user: { id: users.u4.id },
        replies: [],
      });
    });

    it('supports replies, and keeps threads two levels deep', async () => {
      const reply = await comment('u2', { content: 'Reply', parentId: rootId });
      expect(reply.status).toBe(201);
      replyId = reply.body.data.id;
      expect(reply.body.data.parentId).toBe(rootId);

      // replying to a reply joins the root's thread
      const nested = await comment('u3', {
        content: 'Nested',
        parentId: replyId,
      });
      expect(nested.status).toBe(201);
      expect(nested.body.data.parentId).toBe(rootId);

      // a parent from another review is refused
      const otherReviewId = (
        await db.query(
          `INSERT INTO reviews(user_id, field_id, rating, content) VALUES ($1,$2,4,'x') RETURNING id`,
          [users.u3.id, secondFieldId],
        )
      )[0].id;
      const foreignComment = (
        await send('post', `/reviews/${otherReviewId}/comments`, 'u3', {
          content: 'Elsewhere',
        })
      ).body.data.id;
      const strangerParent = await comment('u2', {
        content: 'x',
        parentId: foreignComment,
      });
      expect(strangerParent.status).toBe(404);
    });

    it('serves the tree publicly, paginated by root comment', async () => {
      await comment('u3', { content: 'Second root' });
      const tree = await get(`/reviews/${reviewId}/comments`);
      expect(tree.status).toBe(200);
      expect(tree.body.meta.total).toBe(2);
      expect(tree.body.data[0]).toMatchObject({
        id: rootId,
        content: 'Cảm ơn bạn',
      });
      expect(
        tree.body.data[0].replies.map(
          (reply: { content: string }) => reply.content,
        ),
      ).toEqual(['Reply', 'Nested']);
      expect(tree.body.data[1].replies).toEqual([]);

      const page = await get(`/reviews/${reviewId}/comments?limit=1&page=2`);
      expect(page.body.data).toHaveLength(1);
      expect(page.body.data[0].content).toBe('Second root');

      expect((await get('/reviews/999999999/comments')).status).toBe(404);
      const reviews = await get(`/fields/${fieldId}/reviews?rating=5`);
      expect(reviews.body.data[0].commentCount).toBe(4);
    });

    it('lets the author or an admin delete; deleting a root removes its replies', async () => {
      expect((await send('delete', `/comments/${replyId}`, 'u3')).status).toBe(
        403,
      );
      expect((await send('delete', `/comments/${replyId}`, 'u2')).status).toBe(
        204,
      );
      let tree = await get(`/reviews/${reviewId}/comments`);
      expect(
        tree.body.data[0].replies.map(
          (reply: { content: string }) => reply.content,
        ),
      ).toEqual(['Nested']);

      expect(
        (await send('delete', `/comments/${rootId}`, 'admin')).status,
      ).toBe(204);
      tree = await get(`/reviews/${reviewId}/comments`);
      expect(tree.body.meta.total).toBe(1);
      expect(tree.body.data[0].content).toBe('Second root');
      expect(
        (await send('delete', `/comments/${rootId}`, 'admin')).status,
      ).toBe(404);
    });
  });

  describe('favorites', () => {
    it('needs a login', async () => {
      expect(
        (await http().post(`/api/v1/fields/${fieldId}/favorite`)).status,
      ).toBe(401);
      expect((await http().get('/api/v1/favorites')).status).toBe(401);
    });

    it('adds idempotently and shows up in the list and on the field', async () => {
      const first = await send('post', `/fields/${fieldId}/favorite`, 'u1');
      expect(first.status).toBe(200);
      expect(first.body.data).toEqual({ fieldId, isFavorite: true });
      const again = await send('post', `/fields/${fieldId}/favorite`, 'u1');
      expect(again.body.data).toEqual({ fieldId, isFavorite: true });
      await send('post', `/fields/${secondFieldId}/favorite`, 'u1');

      const list = await get('/favorites', 'u1');
      expect(list.status).toBe(200);
      expect(list.body.meta.total).toBe(2);
      expect(list.body.data[0]).toMatchObject({
        id: secondFieldId,
        name: `${tag} Second`,
        type: { name: `${tag} type` },
      });
      expect(list.body.data[1].id).toBe(fieldId);

      expect((await get(`/fields/${fieldId}`, 'u1')).body.data.isFavorite).toBe(
        true,
      );
      expect((await get(`/fields/${fieldId}`, 'u2')).body.data.isFavorite).toBe(
        false,
      );
      expect((await get('/favorites', 'u2')).body.meta.total).toBe(0);
    });

    it('removes idempotently', async () => {
      const removed = await send(
        'delete',
        `/fields/${secondFieldId}/favorite`,
        'u1',
      );
      expect(removed.status).toBe(200);
      expect(removed.body.data).toEqual({
        fieldId: secondFieldId,
        isFavorite: false,
      });
      const again = await send(
        'delete',
        `/fields/${secondFieldId}/favorite`,
        'u1',
      );
      expect(again.status).toBe(200);
      expect((await get('/favorites', 'u1')).body.meta.total).toBe(1);
    });

    it('refuses an unknown field and paginates', async () => {
      expect(
        (await send('post', '/fields/999999999/favorite', 'u1')).status,
      ).toBe(404);
      const page = await get('/favorites?limit=1&page=2', 'u1');
      expect(page.body.data).toEqual([]);
      expect(page.body.meta).toMatchObject({ page: 2, limit: 1, total: 1 });
    });
  });

  describe('timeline', () => {
    it('needs a login', async () => {
      expect((await http().get('/api/v1/activities/me')).status).toBe(401);
    });

    it('records favorites once per real change, newest first, and only for the owner', async () => {
      // u1 so far: review x2 (second after delete), favorite add x2 (field, second), favorite remove x1
      const items = await activitiesOf('u1', 5);
      const types = items.map((item) => item.type);
      expect(types.filter((type) => type === 'FAVORITE_ADDED')).toHaveLength(2);
      expect(types.filter((type) => type === 'FAVORITE_REMOVED')).toHaveLength(
        1,
      );
      expect(types.filter((type) => type === 'REVIEW_CREATED')).toHaveLength(2);
      const times = items.map((item) => String(item.createdAt));
      expect(times).toEqual([...times].sort().reverse());

      const removal = items.find((item) => item.type === 'FAVORITE_REMOVED')!;
      expect(removal).toMatchObject({
        field: { id: secondFieldId, name: `${tag} Second` },
        refType: 'field',
        refId: secondFieldId,
      });
      expect(
        items.find((item) => item.type === 'REVIEW_CREATED')!.metadata,
      ).toEqual({ rating: 5 });

      const others = await get('/activities/me?limit=50', 'u2');
      expect(
        others.body.data.every(
          (item: { refId: number | null; type: string }) =>
            item.type !== 'FAVORITE_ADDED',
        ),
      ).toBe(true);
    });

    it('records comments with the review they belong to', async () => {
      const items = await activitiesOf('u3', 1, '&type=COMMENT_CREATED');
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0]).toMatchObject({
        type: 'COMMENT_CREATED',
        field: { id: fieldId },
        refType: 'comment',
      });
      expect(items[0].metadata).toHaveProperty('reviewId');
    });

    it('records the whole life of a booking for its customer', async () => {
      const date = inDays(9);
      const created = await send('post', '/bookings', 'u2', {
        fieldId: secondFieldId,
        date,
        startTime: '07:30',
      });
      expect(created.status).toBe(201);
      const cancelled = await send(
        'patch',
        `/bookings/${created.body.data.id}/cancel`,
        'u2',
      );
      expect(cancelled.status).toBe(200);

      const approvedId = (
        await send('post', '/bookings', 'u2', {
          fieldId: secondFieldId,
          date,
          startTime: '09:00',
        })
      ).body.data.id;
      await send('patch', `/admin/bookings/${approvedId}/approve`, 'admin');
      const rejectedId = (
        await send('post', '/bookings', 'u2', {
          fieldId: secondFieldId,
          date,
          startTime: '10:30',
        })
      ).body.data.id;
      await send('patch', `/admin/bookings/${rejectedId}/reject`, 'admin', {
        reason: 'Pitch under repair',
      });

      const booking = await activitiesOf('u2', 8);
      const byType = (type: string) =>
        booking.filter((item) => item.type === type);
      expect(byType('BOOKING_CREATED')).toHaveLength(3);
      expect(byType('BOOKING_CANCELLED')).toHaveLength(1);
      expect(byType('BOOKING_APPROVED')).toHaveLength(1);
      expect(byType('BOOKING_REJECTED')).toHaveLength(1);
      expect(byType('BOOKING_REJECTED')[0].metadata).toMatchObject({
        reason: 'Pitch under repair',
        date,
        startTime: '10:30',
        endTime: '12:00',
      });
      expect(byType('BOOKING_APPROVED')[0]).toMatchObject({
        field: { id: secondFieldId },
        refType: 'booking',
        refId: approvedId,
      });
    });

    it('filters by type, date and paginates', async () => {
      const onlyBookings = await get(
        '/activities/me?type=BOOKING_APPROVED',
        'u2',
      );
      expect(
        onlyBookings.body.data.every(
          (item: { type: string }) => item.type === 'BOOKING_APPROVED',
        ),
      ).toBe(true);

      // the clock is frozen but rows are stamped by the database: today in the real calendar
      const realToday = new Date().toISOString().slice(0, 10);
      const dayBefore = addDays(realToday, -3);
      const future = await get(
        `/activities/me?fromDate=${addDays(realToday, 2)}`,
        'u2',
      );
      expect(future.body.meta.total).toBe(0);
      const past = await get(`/activities/me?toDate=${dayBefore}`, 'u2');
      expect(past.body.meta.total).toBe(0);
      const range = await get(
        `/activities/me?fromDate=${dayBefore}&toDate=${addDays(realToday, 1)}`,
        'u2',
      );
      expect(range.body.meta.total).toBeGreaterThan(0);

      const page = await get('/activities/me?limit=2&page=2', 'u2');
      expect(page.body.data).toHaveLength(2);
      expect(page.body.meta.limit).toBe(2);
      expect((await get('/activities/me?type=NOPE', 'u2')).status).toBe(400);
    });
  });
});
