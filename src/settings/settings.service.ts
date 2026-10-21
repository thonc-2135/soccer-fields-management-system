import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from './entities/setting.entity.js';

const CACHE_TTL_MS = 60_000;

/** Reads the key/value `settings` table. Values change rarely, so they are cached for a minute. */
@Injectable()
export class SettingsService {
  private readonly cache = new Map<
    string,
    { value: string | null; expiresAt: number }
  >();

  constructor(
    @InjectRepository(Setting) private readonly repo: Repository<Setting>,
  ) {}

  async getNumber(key: string, fallback: number): Promise<number> {
    const raw = await this.get(key);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  getSlotMinutes(): Promise<number> {
    return this.getNumber('slot_minutes', 90);
  }

  getWeekendSurchargePercent(): Promise<number> {
    return this.getNumber('weekend_surcharge_percent', 10);
  }

  private async get(key: string): Promise<string | null> {
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    const row = await this.repo.findOne({ where: { key } });
    this.cache.set(key, {
      value: row?.value ?? null,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return row?.value ?? null;
  }
}
