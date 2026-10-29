import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service.js';

const LOCK_SECONDS = 300;

/** Removes tokens that can never be used again so the token tables do not grow forever. */
@Injectable()
export class TokenCleanupService {
  private readonly logger = new Logger(TokenCleanupService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'cleanup-expired-tokens' })
  async runCleanup(): Promise<void> {
    try {
      await this.redis.runExclusive('cron:cleanup-tokens', LOCK_SECONDS, () =>
        this.deleteExpired(),
      );
    } catch (error) {
      this.logger.error('Token cleanup failed', error as Error);
    }
  }

  /**
   * Refresh tokens are kept one day past expiry: a revoked-but-unexpired token must stay so that
   * its reuse is still detected.
   */
  async deleteExpired(): Promise<{
    accountTokens: number;
    refreshTokens: number;
  }> {
    // account_tokens: hashed single-use email activation tokens (type ACTIVATION)
    const [, accountTokens] = await this.dataSource.query(
      `DELETE FROM account_tokens WHERE expires_at < now()`,
    );
    // refresh_tokens: hashed login refresh tokens
    const [, refreshTokens] = await this.dataSource.query(
      `DELETE FROM refresh_tokens WHERE expires_at < now() - interval '1 day'`,
    );
    this.logger.log(
      `Deleted ${accountTokens} account token(s) and ${refreshTokens} refresh token(s)`,
    );
    return { accountTokens, refreshTokens };
  }
}
