import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthTokensTables1792000000100 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "account_token_type" AS ENUM ('ACTIVATION')`);
    await q.query(`
      CREATE TABLE "account_tokens" (
        "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token_hash" varchar(64) NOT NULL,
        "type" "account_token_type" NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_account_tokens_token_hash" UNIQUE ("token_hash")
      )
    `);
    await q.query(
      `CREATE INDEX "idx_account_tokens_user_id" ON "account_tokens" ("user_id")`,
    );
    await q.query(
      `CREATE INDEX "idx_account_tokens_expires_at" ON "account_tokens" ("expires_at")`,
    );

    await q.query(`
      CREATE TABLE "refresh_tokens" (
        "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token_hash" varchar(64) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_refresh_tokens_token_hash" UNIQUE ("token_hash")
      )
    `);
    await q.query(
      `CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")`,
    );
    await q.query(
      `CREATE INDEX "idx_refresh_tokens_expires_at" ON "refresh_tokens" ("expires_at")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "refresh_tokens"`);
    await q.query(`DROP TABLE "account_tokens"`);
    await q.query(`DROP TYPE "account_token_type"`);
  }
}
