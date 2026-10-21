import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Accent-insensitive keyword search ("my dinh" finds "Mỹ Đình") that can still use an index:
 * `unaccent` is not IMMUTABLE, so it is wrapped in an immutable function and a trigram GIN
 * index is built on top of it (makes `ILIKE '%keyword%'` avoid a full scan).
 */
export class AddFieldsSearchIndexes1792000000500 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await q.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);
    await q.query(`
      CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
      AS $$ SELECT public.unaccent('public.unaccent', $1) $$
      LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    `);
    await q.query(
      `CREATE INDEX "idx_fields_name_trgm" ON "fields" USING gin (immutable_unaccent("name") gin_trgm_ops)`,
    );
    await q.query(
      `CREATE INDEX "idx_fields_address_trgm" ON "fields" USING gin (immutable_unaccent("address") gin_trgm_ops)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "idx_fields_address_trgm"`);
    await q.query(`DROP INDEX "idx_fields_name_trgm"`);
    await q.query(`DROP FUNCTION immutable_unaccent(text)`);
  }
}
