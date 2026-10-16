import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

// Requires Postgres + Redis (see docker-compose.yml). DB_NAME defaults to the *_test database.
process.env.DB_NAME ??= 'soccer_fields_test';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const email = `e2e_${Date.now()}@example.com`;
  const password = 'Passw0rd!';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM users WHERE email = $1', [email]);
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('rejects a weak password with field-level errors', async () => {
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ name: 'Tester', email, password: 'abcdefgh' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors[0].field).toBe('password');
  });

  it('translates errors using Accept-Language', async () => {
    const res = await http()
      .post('/api/v1/auth/register')
      .set('Accept-Language', 'vi')
      .send({ name: 'Tester', email, password: 'abcdefgh' });
    expect(res.body.message).toBe('Dữ liệu không hợp lệ');
  });

  it('registers an inactive account', async () => {
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ name: 'Tester', email, password });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      email,
      isActive: false,
      role: 'USER',
    });
    expect(res.body.data.password).toBeUndefined();
  });

  it('rejects a duplicate email with 409', async () => {
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ name: 'Tester', email, password });
    expect(res.status).toBe(409);
  });

  it('forbids login until the account is activated', async () => {
    const res = await http()
      .post('/api/v1/auth/login')
      .send({ email, password });
    expect(res.status).toBe(403);
  });

  it('rejects a wrong password with 401', async () => {
    await dataSource.query(
      'UPDATE users SET is_active = true WHERE email = $1',
      [email],
    );
    const res = await http()
      .post('/api/v1/auth/login')
      .send({ email, password: 'Wrong123!' });
    expect(res.status).toBe(401);
  });

  it('logs in, reads /me, then the token is invalid after logout', async () => {
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email, password });
    expect(login.status).toBe(200);
    const { accessToken } = login.body.data;

    const me = await http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(email);

    const out = await http()
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(out.status).toBe(200);

    const after = await http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(after.status).toBe(401);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email, password });
    const first = login.body.data.refreshToken;

    const rotated = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first });
    expect(rotated.status).toBe(200);
    const second = rotated.body.data.refreshToken;
    expect(second).not.toBe(first);
    expect(rotated.body.data.accessToken).toBeDefined();

    // replaying the old token fails and revokes the whole chain
    const replay = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first });
    expect(replay.status).toBe(401);
    const afterReplay = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: second });
    expect(afterReplay.status).toBe(401);
  });

  it('logout also revokes the supplied refresh token', async () => {
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email, password });
    const { accessToken, refreshToken } = login.body.data;
    await http()
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);
    await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('rejects an unknown refresh token', async () => {
    await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'nope' })
      .expect(401);
  });

  it('requires a token for /me', async () => {
    expect((await http().get('/api/v1/auth/me')).status).toBe(401);
  });

  it('exposes a health check', async () => {
    const res = await http().get('/api/v1/health');
    expect(res.body.data).toEqual({ status: 'ok' });
  });
});
