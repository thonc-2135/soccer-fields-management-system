import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { Role } from '../common/enums/role.enum.js';
import { hashPassword } from '../common/utils/password.util.js';
import { Field } from '../fields/entities/field.entity.js';
import { FieldPrice } from '../fields/entities/field-price.entity.js';
import { FieldType } from '../fields/entities/field-type.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Voucher } from '../vouchers/entities/voucher.entity.js';
import {
  DEMO_USER_PASSWORD,
  DEMO_USERS,
  FIELDS,
  FIELD_TYPES,
  PRICE_WINDOWS,
  VOUCHERS,
} from './seed.data.js';

export interface SeedOptions {
  fresh?: boolean;
  adminOnly?: boolean;
}

/** Idempotent: every record is looked up by its natural key and only created when missing. */
@Injectable()
export class SeedService {
  // the CLI runs with the framework logger muted, so progress goes to stdout
  private readonly logger = {
    log: (m: string) => console.log(m),
    warn: (m: string) => console.warn(m),
  };

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async run(options: SeedOptions): Promise<void> {
    if (options.fresh) {
      if (this.config.get('NODE_ENV') === 'production') {
        throw new Error('--fresh is not allowed when NODE_ENV=production');
      }
      await this.truncateAll();
    }

    await this.dataSource.transaction(async (m) => {
      await this.seedAdmin(m);
      if (options.adminOnly) return;
      await this.seedUsers(m);
      await this.seedFields(m);
      await this.seedVouchers(m);
    });
    this.logger.log('Seeding finished');
  }

  private async truncateAll(): Promise<void> {
    // CASCADE also clears every table that references these (bookings, reviews, ...).
    await this.dataSource.query(
      'TRUNCATE TABLE "users", "field_types", "vouchers" RESTART IDENTITY CASCADE',
    );
    this.logger.warn('Existing data truncated (--fresh)');
  }

  private async seedAdmin(m: EntityManager): Promise<void> {
    const email = this.config.get<string>(
      'SEED_ADMIN_EMAIL',
      'admin@soccer.local',
    );
    const password = this.config.get<string>(
      'SEED_ADMIN_PASSWORD',
      'Admin@123',
    );
    if (await m.exists(User, { where: { email }, withDeleted: true })) {
      this.logger.log(`Admin ${email} already exists`);
      return;
    }
    await m.insert(User, {
      name: 'Administrator',
      email,
      password: await hashPassword(password),
      role: Role.ADMIN,
      isActive: true,
      activatedAt: new Date(),
    });
    this.logger.log(`Admin created: ${email}`);
  }

  private async seedUsers(m: EntityManager): Promise<void> {
    const password = await hashPassword(DEMO_USER_PASSWORD);
    let created = 0;
    for (const u of DEMO_USERS) {
      if (
        await m.exists(User, { where: { email: u.email }, withDeleted: true })
      )
        continue;
      await m.insert(User, {
        ...u,
        password,
        isActive: true,
        activatedAt: new Date(),
      });
      created++;
    }
    this.logger.log(`Demo users: ${created} created`);
  }

  private async seedFields(m: EntityManager): Promise<void> {
    const types = new Map<string, FieldType>();
    for (const t of FIELD_TYPES) {
      let type = await m.findOne(FieldType, { where: { name: t.name } });
      if (!type) {
        type = await m.save(
          m.create(FieldType, {
            name: t.name,
            capacity: t.capacity,
            description: t.description,
          }),
        );
      }
      types.set(t.name, type);
    }

    let created = 0;
    for (const f of FIELDS) {
      if (await m.exists(Field, { where: { name: f.name }, withDeleted: true }))
        continue;
      const type = types.get(f.type)!;
      const field = await m.save(
        m.create(Field, {
          name: f.name,
          address: f.address,
          description: f.description,
          typeId: type.id,
        }),
      );
      const prices = FIELD_TYPES.find((t) => t.name === f.type)!.prices;
      await m.insert(
        FieldPrice,
        PRICE_WINDOWS.map((w, i) => ({
          ...w,
          price: prices[i],
          fieldId: field.id,
        })),
      );
      created++;
    }
    this.logger.log(`Field types: ${types.size}, fields: ${created} created`);
  }

  private async seedVouchers(m: EntityManager): Promise<void> {
    let created = 0;
    for (const v of VOUCHERS) {
      if (await m.exists(Voucher, { where: { code: v.code } })) continue;
      await m.insert(Voucher, v);
      created++;
    }
    this.logger.log(`Vouchers: ${created} created`);
  }
}
