import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AccountTokenType } from '../common/enums/account-token-type.enum.js';
import { User } from '../users/entities/user.entity.js';
import { AccountToken } from './entities/account-token.entity.js';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class AccountTokensService {
  constructor(
    @InjectRepository(AccountToken)
    private readonly repo: Repository<AccountToken>,
    private readonly config: ConfigService,
  ) {}

  /** Creates a new activation token and invalidates the user's previous unused ones. */
  async issueActivation(userId: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const ttlHours = Number(this.config.get('ACTIVATION_TOKEN_TTL_HOURS', 24));
    await this.repo.manager.transaction(async (m) => {
      await m.update(
        AccountToken,
        { userId, type: AccountTokenType.ACTIVATION, usedAt: IsNull() },
        { usedAt: () => 'now()' },
      );
      await m.insert(AccountToken, {
        userId,
        type: AccountTokenType.ACTIVATION,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
      });
    });
    return token;
  }

  /**
   * Atomically consumes a valid token and activates its owner in one transaction,
   * so a token can never be used twice (even by concurrent requests).
   */
  async activate(token: string): Promise<void> {
    await this.repo.manager.transaction(async (m) => {
      const res = await m
        .createQueryBuilder()
        .update(AccountToken)
        .set({ usedAt: () => 'now()' })
        .where(
          'token_hash = :hash AND type = :type AND used_at IS NULL AND expires_at > now()',
          {
            hash: sha256(token),
            type: AccountTokenType.ACTIVATION,
          },
        )
        .returning('user_id')
        .execute();

      const row = (res.raw as { user_id: number }[])[0];
      if (!row)
        throw new BadRequestException('errors.INVALID_ACTIVATION_TOKEN');

      await m.update(
        User,
        { id: row.user_id },
        { isActive: true, activatedAt: () => 'now()' },
      );
    });
  }
}
