import 'dotenv/config';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source-options.js';

// Works for both `src` (ts-node) and `dist` (compiled js) thanks to the glob extension.
const root = join(import.meta.dirname, '..');

export default new DataSource({
  ...buildDataSourceOptions(process.env),
  entities: [join(root, '**/*.entity.{ts,js}')],
  migrations: [join(root, 'database/migrations/*.{ts,js}')],
});
