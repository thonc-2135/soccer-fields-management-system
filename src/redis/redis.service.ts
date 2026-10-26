import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants.js';

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async setWithTtl(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    if (ttlSeconds <= 0) return;
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  /** Returns true when the key was created (i.e. it did not exist yet). */
  async setIfAbsent(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    return (await this.client.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
  }

  /**
   * Runs `job` only if no other instance holds the lock `name` (cron jobs on several replicas).
   * The lock simply expires after `ttlSeconds`, so a crashed run does not block the next tick.
   * Returns false when another instance already holds it.
   */
  async runExclusive(
    name: string,
    ttlSeconds: number,
    job: () => Promise<unknown>,
  ): Promise<boolean> {
    if (!(await this.setIfAbsent(`lock:${name}`, '1', ttlSeconds)))
      return false;
    await job();
    return true;
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
