import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { RefreshToken } from './entities/refresh-token.entity.js';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

/**
 * Opaque refresh tokens with rotation: every refresh revokes the used token and
 * issues a new one. Presenting an already-revoked token means it leaked (or was
 * replayed), so all of that user's sessions are revoked.
 */
@Injectable()
export class RefreshTokensService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly repo: Repository<RefreshToken>,
    private readonly config: ConfigService,
  ) {}

  async issue(userId: number): Promise<string> {
    const token = randomBytes(48).toString('base64url');
    const ttlDays = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS', 7));
    await this.repo.insert({
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
    });
    return token;
  }

  /** Atomically revokes a valid token and returns its owner; throws 401 otherwise. */
  async consume(token: string): Promise<number> {
    const tokenHash = sha256(token);
    const res = await this.repo
      .createQueryBuilder()
      .update()
      .set({ revokedAt: () => 'now()' })
      .where(
        'token_hash = :tokenHash AND revoked_at IS NULL AND expires_at > now()',
        { tokenHash },
      )
      .returning('user_id')
      .execute();

    const row = (res.raw as { user_id: number }[])[0];
    if (row) return row.user_id;

    const reused = await this.repo.findOne({ where: { tokenHash } });
    if (reused?.revokedAt) await this.revokeAllForUser(reused.userId);
    throw new UnauthorizedException('errors.INVALID_REFRESH_TOKEN');
  }

  async revoke(token: string): Promise<void> {
    await this.repo.update(
      { tokenHash: sha256(token), revokedAt: IsNull() },
      { revokedAt: () => 'now()' },
    );
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await this.repo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: () => 'now()' },
    );
  }
}
