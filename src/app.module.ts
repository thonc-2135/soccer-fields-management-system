import { join } from 'node:path';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AcceptLanguageResolver,
  I18nModule,
  I18nService,
  QueryResolver,
} from 'nestjs-i18n';
import { ActivitiesModule } from './activities/activities.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { FavoritesModule } from './favorites/favorites.module.js';
import { FieldsModule } from './fields/fields.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { VouchersModule } from './vouchers/vouchers.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { ClockModule } from './common/clock/clock.module.js';
import { typeOrmConfig } from './config/typeorm.config.js';
import { HealthController } from './health/health.controller.js';
import { RedisModule } from './redis/redis.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: typeOrmConfig }),
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: join(import.meta.dirname, 'i18n'),
        watch: process.env.NODE_ENV !== 'production',
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        AcceptLanguageResolver,
      ],
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // e2e tests use their own prefix so a running dev server cannot consume their jobs
        prefix: config.get<string>('BULL_PREFIX', 'bull'),
        redis: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get('REDIS_PORT', 6379)),
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      }),
    }),
    ScheduleModule.forRoot(),
    ClockModule,
    RedisModule,
    UsersModule,
    AuthModule,
    VouchersModule,
    SettingsModule,
    ReviewsModule,
    FieldsModule,
    FavoritesModule,
    BookingsModule,
    ActivitiesModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    {
      provide: APP_FILTER,
      inject: [I18nService],
      useFactory: (i18n: I18nService) => new AllExceptionsFilter(i18n),
    },
  ],
})
export class AppModule {}
