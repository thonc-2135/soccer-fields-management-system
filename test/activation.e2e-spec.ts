import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  createTestApp,
  tokenFromMail,
  type FakeMailer,
} from './helpers/create-test-app.js';

describe('Account activation (e2e)', () => {
  let app: INestApplication;
  let mailer: FakeMailer;
  let dataSource: DataSource;
  const stamp = Date.now();
  const password = 'Passw0rd!';
  const emails: string[] = [];

  const newEmail = (label: string) => {
    const email = `act_${label}_${stamp}@example.com`;
    emails.push(email);
    return email;
  };
  const http = () => request(app.getHttpServer());
  const register = (email: string, headers: Record<string, string> = {}) =>
    http()
      .post('/api/v1/auth/register')
      .set(headers)
      .send({ name: 'Tester', email, password });

  beforeAll(async () => {
    ({ app, mailer } = await createTestApp());
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
    await app.close();
  });

  it('sends an activation mail; the link activates the account and login then works', async () => {
    const email = newEmail('flow');
    await register(email).expect(201);

    const mail = await mailer.waitFor(email);
    expect(mail.subject).toContain('Activate');
    const token = tokenFromMail(mail);

    await http()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(403);
    const res = await http().get('/api/v1/auth/activate').query({ token });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ activated: true });
    await http()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
  });

  it('writes the mail in the language of the request', async () => {
    const email = newEmail('vi');
    await register(email, { 'Accept-Language': 'vi' }).expect(201);
    expect((await mailer.waitFor(email)).subject).toContain('Kích hoạt');
  });

  it('a token can only be used once', async () => {
    const email = newEmail('once');
    await register(email);
    const token = tokenFromMail(await mailer.waitFor(email));
    await http().get('/api/v1/auth/activate').query({ token }).expect(200);
    await http().get('/api/v1/auth/activate').query({ token }).expect(400);
  });

  it('rejects unknown, missing and expired tokens', async () => {
    await http()
      .get('/api/v1/auth/activate')
      .query({ token: 'nope' })
      .expect(400);
    await http().get('/api/v1/auth/activate').expect(400);

    const email = newEmail('expired');
    await register(email);
    const token = tokenFromMail(await mailer.waitFor(email));
    await dataSource.query(
      `UPDATE account_tokens SET expires_at = now() - interval '1 minute'
       WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [email],
    );
    await http().get('/api/v1/auth/activate').query({ token }).expect(400);
  });

  it('resend issues a fresh token, invalidates the old one and is rate limited', async () => {
    const email = newEmail('resend');
    await register(email);
    const oldToken = tokenFromMail(await mailer.waitFor(email));
    const before = mailer.messages.filter((m) => m.to === email).length;

    await http()
      .post('/api/v1/auth/resend-activation')
      .send({ email })
      .expect(200);
    while (mailer.messages.filter((m) => m.to === email).length === before) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const newToken = tokenFromMail(await mailer.waitFor(email));
    expect(newToken).not.toBe(oldToken);

    await http()
      .post('/api/v1/auth/resend-activation')
      .send({ email })
      .expect(429);
    await http()
      .get('/api/v1/auth/activate')
      .query({ token: oldToken })
      .expect(400);
    await http()
      .get('/api/v1/auth/activate')
      .query({ token: newToken })
      .expect(200);
  });

  it('resend does not reveal whether an email is registered or already active', async () => {
    const unknown = await http()
      .post('/api/v1/auth/resend-activation')
      .send({ email: newEmail('unknown') });
    expect(unknown.status).toBe(200);
    expect(unknown.body.data).toEqual({ sent: true });
    expect(mailer.messages.some((m) => m.to === emails.at(-1))).toBe(false);
  });
});
