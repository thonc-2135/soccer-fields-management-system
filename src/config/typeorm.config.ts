import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { buildDataSourceOptions } from '../database/data-source-options.js';

export function typeOrmConfig(): TypeOrmModuleOptions {
  return {
    ...buildDataSourceOptions(process.env),
    autoLoadEntities: true,
  };
}
