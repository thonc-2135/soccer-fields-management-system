import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFieldsTables1792000000200 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "field_status" AS ENUM ('ACTIVE', 'INACTIVE')`);

    await q.query(`
      CREATE TABLE "field_types" (
        "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "name" varchar(100) NOT NULL,
        "capacity" integer NOT NULL CHECK ("capacity" > 0),
        "description" text,
        CONSTRAINT "uq_field_types_name" UNIQUE ("name")
      )
    `);

    await q.query(`
      CREATE TABLE "fields" (
        "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "type_id" integer NOT NULL REFERENCES "field_types"("id") ON DELETE RESTRICT,
        "name" varchar(150) NOT NULL,
        "description" text,
        "address" varchar(255) NOT NULL,
        "open_time" time NOT NULL DEFAULT '06:00',
        "close_time" time NOT NULL DEFAULT '23:00',
        "status" "field_status" NOT NULL DEFAULT 'ACTIVE',
        "avg_rating" numeric(2,1) NOT NULL DEFAULT 0,
        "review_count" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "ck_fields_open_hours" CHECK ("open_time" >= '06:00' AND "close_time" <= '23:00' AND "open_time" < "close_time")
      )
    `);
    await q.query(`CREATE INDEX "idx_fields_type_id" ON "fields" ("type_id")`);
    await q.query(
      `CREATE INDEX "idx_fields_status_deleted_at" ON "fields" ("status", "deleted_at")`,
    );

    await q.query(`
      CREATE TABLE "field_images" (
        "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "field_id" integer NOT NULL REFERENCES "fields"("id") ON DELETE CASCADE,
        "url" varchar(255) NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_thumbnail" boolean NOT NULL DEFAULT false
      )
    `);
    await q.query(
      `CREATE INDEX "idx_field_images_field_id" ON "field_images" ("field_id")`,
    );

    await q.query(`
      CREATE TABLE "field_prices" (
        "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "field_id" integer NOT NULL REFERENCES "fields"("id") ON DELETE CASCADE,
        "start_time" time NOT NULL,
        "end_time" time NOT NULL,
        "price" numeric(12,0) NOT NULL CHECK ("price" >= 0),
        CONSTRAINT "ck_field_prices_window" CHECK ("start_time" < "end_time"),
        CONSTRAINT "uq_field_prices_field_start" UNIQUE ("field_id", "start_time")
      )
    `);

    await q.query(`
      CREATE TABLE "settings" (
        "key" varchar(50) PRIMARY KEY,
        "value" varchar(255) NOT NULL
      )
    `);
    await q.query(`
      INSERT INTO "settings" ("key", "value") VALUES
        ('weekend_surcharge_percent', '10'),
        ('slot_minutes', '90')
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "settings"`);
    await q.query(`DROP TABLE "field_prices"`);
    await q.query(`DROP TABLE "field_images"`);
    await q.query(`DROP TABLE "fields"`);
    await q.query(`DROP TABLE "field_types"`);
    await q.query(`DROP TYPE "field_status"`);
  }
}
