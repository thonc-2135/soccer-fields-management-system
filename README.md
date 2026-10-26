# Soccer Fields Management System – Backend

NestJS 12 · TypeORM · PostgreSQL 16 · Redis · JWT · nestjs-i18n (en/vi) · Vitest · pnpm

Docs: [API endpoints](docs/01-api-endpoints.md) · [ERD](docs/02-erd.drawio) · [DB notes](docs/02-database-notes.md)

## Quick start (local dev)

```bash
cp .env.example .env
docker compose up -d postgres redis mailpit   # infra only (mailpit = fake SMTP, UI http://localhost:8025)
pnpm install
pnpm migration:apply                     # create tables
pnpm seed                                # admin + demo users/fields/vouchers
pnpm start:dev                           # http://localhost:3000/api/v1  ·  Swagger: /api/docs
```

Full stack in Docker (api runs migrations on start):

```bash
JWT_SECRET=change-me docker compose --profile app up -d --build
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm lint` / `pnpm format` | oxlint / prettier |
| `pnpm test` | unit tests |
| `pnpm test:e2e` | e2e (needs Postgres + Redis; uses `DB_NAME=soccer_fields_test`, migrate it first: `DB_NAME=soccer_fields_test pnpm migration:apply`) |
| `pnpm seed` / `seed:fresh` | seed demo data (idempotent) / wipe users, fields, vouchers and re-seed. Admin: `admin@soccer.local` / `Admin@123`, demo users `user1..3@soccer.local` / `User@1234` |
| `pnpm migration:add src/database/migrations/Name` | new empty migration |
| `pnpm migration:apply` / `migration:revert` | run / undo migrations |

## Conventions
- Prefix `/api/v1`; success `{ success, data, meta? }`, error `{ success:false, statusCode, message, errors? }`.
- Language: `Accept-Language: vi|en` or `?lang=`. Services throw i18n keys (`errors.EMAIL_TAKEN`), the global filter translates them.
- Auth: access token 15 phút + refresh token 7 ngày (rotation, lưu hash trong DB); `POST /auth/refresh`.
- Registration sends an activation email through a Bull queue (`mail`); in dev read it in Mailpit at http://localhost:8025.
- Time rules (booking in the past, 60-day window) use `APP_TIMEZONE` (default `Asia/Ho_Chi_Minh`).
- Roles: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.ADMIN)`.
- Schema is changed only via hand-written migrations (`synchronize: false`).

## CI/CD
- `.github/workflows/ci.yml`: format, lint, build, unit + e2e (Postgres/Redis services), Docker build.
- `.github/workflows/cd.yml`: after CI passes on `main`, push image to GHCR and deploy over SSH with `docker-compose.prod.yml`.
  Secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH` (environment `production`). On the server put a `.env` next to the compose file.
