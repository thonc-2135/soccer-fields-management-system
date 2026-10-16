import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBookingsTables1792000000300 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "voucher_type" AS ENUM ('PERCENT', 'FIXED')`);
    await q.query(
      `CREATE TYPE "booking_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED')`,
    );

    await q.query(`
      CREATE TABLE "vouchers" (
        "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "code" varchar(50) NOT NULL,
        "type" "voucher_type" NOT NULL,
        "value" numeric(12,2) NOT NULL CHECK ("value" > 0),
        "max_discount" numeric(12,0),
        "min_order_amount" numeric(12,0) NOT NULL DEFAULT 0,
        "usage_limit" integer,
        "per_user_limit" integer,
        "used_count" integer NOT NULL DEFAULT 0,
        "start_at" timestamptz NOT NULL,
        "end_at" timestamptz NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_vouchers_code" UNIQUE ("code"),
        CONSTRAINT "ck_vouchers_period" CHECK ("start_at" < "end_at"),
        CONSTRAINT "ck_vouchers_percent" CHECK ("type" <> 'PERCENT' OR "value" <= 100)
      )
    `);

    await q.query(`
      CREATE TABLE "bookings" (
        "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "field_id" integer NOT NULL REFERENCES "fields"("id") ON DELETE RESTRICT,
        "voucher_id" integer REFERENCES "vouchers"("id") ON DELETE SET NULL,
        "booking_date" date NOT NULL,
        "start_time" time NOT NULL,
        "end_time" time NOT NULL,
        "status" "booking_status" NOT NULL DEFAULT 'PENDING',
        "subtotal" numeric(12,0) NOT NULL,
        "discount" numeric(12,0) NOT NULL DEFAULT 0,
        "total" numeric(12,0) NOT NULL,
        "note" varchar(255),
        "reject_reason" varchar(255),
        "handled_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_bookings_time" CHECK ("start_time" < "end_time" AND "end_time" <= '23:00'),
        CONSTRAINT "ck_bookings_amounts" CHECK ("subtotal" >= 0 AND "discount" >= 0 AND "total" >= 0)
      )
    `);
    await q.query(
      `CREATE INDEX "idx_bookings_user_created" ON "bookings" ("user_id", "created_at" DESC)`,
    );
    await q.query(
      `CREATE INDEX "idx_bookings_field_date_status" ON "bookings" ("field_id", "booking_date", "status")`,
    );
    await q.query(
      `CREATE INDEX "idx_bookings_status_created" ON "bookings" ("status", "created_at")`,
    );
    await q.query(
      `CREATE INDEX "idx_bookings_voucher_user" ON "bookings" ("voucher_id", "user_id") WHERE "voucher_id" IS NOT NULL`,
    );

    await q.query(`
      CREATE TABLE "booking_slots" (
        "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "booking_id" integer NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
        "field_id" integer NOT NULL REFERENCES "fields"("id") ON DELETE RESTRICT,
        "slot_date" date NOT NULL,
        "slot_start" time NOT NULL,
        CONSTRAINT "uq_booking_slots_field_date_start" UNIQUE ("field_id", "slot_date", "slot_start")
      )
    `);
    await q.query(
      `CREATE INDEX "idx_booking_slots_booking_id" ON "booking_slots" ("booking_id")`,
    );

    await q.query(`
      CREATE TABLE "booking_price_items" (
        "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "booking_id" integer NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
        "from_time" time NOT NULL,
        "to_time" time NOT NULL,
        "unit_price" numeric(12,0) NOT NULL,
        "minutes" integer NOT NULL CHECK ("minutes" > 0),
        "amount" numeric(12,0) NOT NULL
      )
    `);
    await q.query(
      `CREATE INDEX "idx_booking_price_items_booking_id" ON "booking_price_items" ("booking_id")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "booking_price_items"`);
    await q.query(`DROP TABLE "booking_slots"`);
    await q.query(`DROP TABLE "bookings"`);
    await q.query(`DROP TABLE "vouchers"`);
    await q.query(`DROP TYPE "booking_status"`);
    await q.query(`DROP TYPE "voucher_type"`);
  }
}
