import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1792000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "user_role" AS ENUM ('USER', 'ADMIN')`,
    );
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "name" varchar(100) NOT NULL,
        "email" varchar(150) NOT NULL,
        "password" varchar(255) NOT NULL,
        "phone" varchar(20),
        "avatar" varchar,
        "role" "user_role" NOT NULL DEFAULT 'USER',
        "is_active" boolean NOT NULL DEFAULT false,
        "activated_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "uq_users_email" UNIQUE ("email")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_users_role_is_active" ON "users" ("role", "is_active")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "user_role"`);
  }
}
