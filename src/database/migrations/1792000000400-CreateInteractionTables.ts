import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInteractionTables1792000000400 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TYPE "activity_type" AS ENUM (
        'BOOKING_CREATED', 'BOOKING_CANCELLED', 'BOOKING_APPROVED', 'BOOKING_REJECTED',
        'REVIEW_CREATED', 'COMMENT_CREATED', 'FAVORITE_ADDED', 'FAVORITE_REMOVED'
      )
    `);

    await q.query(`
      CREATE TABLE "reviews" (
        "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "field_id" integer NOT NULL REFERENCES "fields"("id") ON DELETE RESTRICT,
        "rating" smallint NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
        "content" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);
    // one live review per user per field; a soft-deleted review does not block a new one
    await q.query(
      `CREATE UNIQUE INDEX "uq_reviews_user_field" ON "reviews" ("user_id", "field_id") WHERE "deleted_at" IS NULL`,
    );
    await q.query(
      `CREATE INDEX "idx_reviews_field_created" ON "reviews" ("field_id", "created_at" DESC)`,
    );

    await q.query(`
      CREATE TABLE "comments" (
        "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "review_id" integer NOT NULL REFERENCES "reviews"("id") ON DELETE CASCADE,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "parent_id" integer REFERENCES "comments"("id") ON DELETE CASCADE,
        "content" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);
    await q.query(
      `CREATE INDEX "idx_comments_review_parent_created" ON "comments" ("review_id", "parent_id", "created_at")`,
    );

    await q.query(`
      CREATE TABLE "favorites" (
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "field_id" integer NOT NULL REFERENCES "fields"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("user_id", "field_id")
      )
    `);
    await q.query(
      `CREATE INDEX "idx_favorites_field_id" ON "favorites" ("field_id")`,
    );

    await q.query(`
      CREATE TABLE "activities" (
        "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type" "activity_type" NOT NULL,
        "field_id" integer REFERENCES "fields"("id") ON DELETE SET NULL,
        "ref_type" varchar(30),
        "ref_id" integer,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX "idx_activities_user_created" ON "activities" ("user_id", "created_at" DESC)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "activities"`);
    await q.query(`DROP TABLE "favorites"`);
    await q.query(`DROP TABLE "comments"`);
    await q.query(`DROP TABLE "reviews"`);
    await q.query(`DROP TYPE "activity_type"`);
  }
}
