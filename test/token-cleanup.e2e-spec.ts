import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TokenCleanupService } from '../src/auth/token-cleanup.service.js';
import { createTestApp } from './helpers/create-test-app.js';

describe('Token cleanup (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  const tag = `tc${Date.now()}`;
  let userId: number;

  const countRows = async (table: string): Promise<number> =>
    (
      await db.query(
        `SELECT COUNT(*)::int AS count FROM ${table} WHERE user_id = $1`,
        [userId],
      )
    )[0].count;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    db = app.get(DataSource);
    userId = (
      await db.query(
        `INSERT INTO users(name, email, password) VALUES ('T', $1, 'x') RETURNING id`,
        [`${tag}@example.com`],
      )
    )[0].id;
  });

  afterAll(async () => {
    await db.query(`DELETE FROM users WHERE id = $1`, [userId]); // tokens cascade
    await app.close();
  });

  it('removes expired activation tokens and long-expired refresh tokens only', async () => {
    const accountToken = (hash: string, expiresIn: string) =>
      db.query(
        `INSERT INTO account_tokens(user_id, token_hash, type, expires_at)
         VALUES ($1, $2, 'ACTIVATION', now() + $3::interval)`,
        [userId, `${tag}-a-${hash}`.padEnd(64, '0').slice(0, 64), expiresIn],
      );
    const refreshToken = (hash: string, expiresIn: string) =>
      db.query(
        `INSERT INTO refresh_tokens(user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + $3::interval)`,
        [userId, `${tag}-r-${hash}`.padEnd(64, '0').slice(0, 64), expiresIn],
      );
    await accountToken('old', '-1 hour');
    await accountToken('live', '1 hour');
    await refreshToken('old', '-2 days');
    await refreshToken('recent', '-1 hour'); // kept for reuse detection
    await refreshToken('live', '1 day');

    await app.get(TokenCleanupService).deleteExpired();

    expect(await countRows('account_tokens')).toBe(1);
    expect(await countRows('refresh_tokens')).toBe(2);
  });
});
