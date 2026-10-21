import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from '../config/typeorm.config.js';
import { FieldsModule } from '../fields/fields.module.js';
import { UsersModule } from '../users/users.module.js';
import { VouchersModule } from '../vouchers/vouchers.module.js';
import { SeedCommand } from './seed.command.js';
import { SeedService } from './seed.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: typeOrmConfig }),
    UsersModule,
    FieldsModule,
    VouchersModule,
  ],
  providers: [SeedCommand, SeedService],
})
export class CliModule {}
