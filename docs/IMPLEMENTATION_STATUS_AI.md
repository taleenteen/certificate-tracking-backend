# E-License Implementation Status and AI Handoff

> Audience: AI coding agents continuing this repository.
>
> Last reviewed: 2026-06-15
>
> Master contract: `docs/IMPLEMENTATION_GUIDE_1.md`
> How to work here: `AGENTS.md` · Code style: `docs/CODING_STANDARDS.md`
> Actionable backlog: `docs/FIX_PLAN.md`
>
> This document reports the current repository state. It does not replace or
> override the master contract. When this document conflicts with the guide,
> the guide wins.

## 0. Change Log

- **2026-06-15 (public self-registration + password login)** — Added public
  sign-up: `POST /api/auth/register` (username/email/password → `public` role,
  bcrypt cost 12, auto-login) and `POST /api/auth/login` (password login for
  non-admin users) in `auth.service.ts`/`auth.controller.ts`; `RegisterDto`/
  `LoginDto` in `auth.dto.ts`. **Extends D3**: the `public` role may now use
  password auth alongside Tang Rat; admin tier is still rejected on `/auth/login`
  (must use `/auth/self` with TOTP). Reuses lockout (5→15-min) and
  first-login password-change challenge. Rate limited (register 5/min, login
  10/min). Verified live end-to-end: register 201 + bcrypt `$2b$12$` hash in DB,
  login 200, duplicate 409, bad password 401, admin blocked 401, weak password
  400, register-issued token authorizes a protected route. Build/lint clean,
  unit 16/16. New plain-English guide: `docs/AUTHENTICATION.md`.
- **2026-06-15 (OpenAPI export file)** — Added `npm run swagger:export`
  (`scripts/generate-openapi.ts`) that boots the app without an HTTP server and
  writes `openapi.json` (OpenAPI 3.0, 45 paths) for import into Postman/Insomnia/
  Kong/API Gateway. Refactored `src/swagger.ts` to export `buildSwaggerConfig()`.
- **2026-06-15 (role hierarchy + super_admin)** — Owner-defined role model
  replacing guide D1. Added a 5th role `super_admin` and made roles
  **hierarchical** (`public < inspector < supervisor < admin < super_admin`) via
  `src/common/auth.roles.ts` (`satisfiesRole`, `isAdminTier`, `canGrantRole`,
  `canManageUser`). `RolesGuard` is now rank-based; `ScopeGuard`/`ClientTypeGuard`
  and all services treat `super_admin` as admin tier. Scoped services
  (inspection, supervisor dashboard) handle a null admin scope as "no filter" so
  admins can view/approve across the board without crashing. User management
  enforces caps: only super_admin grants/owns admin & super_admin; admins cannot
  modify equal/higher users. Seed: `superadmin` → `super_admin`, added a plain
  `admin` account. Verified live (promote caps, dashboard inheritance, mToken
  block) + unit 16/16, e2e 8/8. Conventions in `docs/CODING_STANDARDS.md` §4b.
- **2026-06-15 (Swagger / OpenAPI docs)** — Added interactive API docs at
  `/docs` (`/docs-json`) via `@nestjs/swagger` 11 + its CLI plugin
  (`nest-cli.json`, `introspectComments` + `classValidatorShim`). Setup in
  `src/swagger.ts`; all 12 controllers tagged with `@ApiTags`/`@ApiBearerAuth`
  and every endpoint annotated with `@ApiOperation` + response decorators;
  request/query DTOs carry JSDoc + `@example`; typed auth response DTOs in
  `auth.dto.ts`. Generated document: 45 paths / 48 operations / 20 schemas,
  verified live. Conventions documented in `docs/CODING_STANDARDS.md` §10b.
- **2026-06-15 (runtime verification + fixes)** — Brought up live Postgres+MinIO
  and verified the whole stack end-to-end (migrate, seed with exact counts +
  RNG4 invariant, both auth paths, scoped + public endpoints, dashboards, map).
  `lint`/`build` clean, **unit 6/6, e2e 8/8**. Fixed and verified: build output
  path (`nest build` was emitting `dist/src/main.js`, breaking `start:prod` and
  the Docker prod image — now `dist/main.js`); e2e compile + a buggy zone-scope
  test; audit `entityType` (was always `'api'`); forgot-password per-user 3/hour;
  supervisor audit-log zone scope; MinIO private-bucket (malformed deny policy
  removed — anonymous access now returns 403). Details in `docs/FIX_PLAN.md`.
- **2026-06-15** — Migrated to **Prisma 7**: `url` removed from `schema.prisma`,
  added `prisma.config.ts`, `PrismaService` + `prisma/seed.ts` switched to the
  `@prisma/adapter-pg` driver adapter with `pg.Pool` (no more `$connect`/
  `$disconnect`), `package.json` bumped to `^7`. Added `esModuleInterop: true`
  and excluded `prisma.config.ts` in `tsconfig.json` to fix the `cookie-parser`
  runtime crash. Added `AGENTS.md`, `docs/CODING_STANDARDS.md`, `docs/FIX_PLAN.md`.
  **Side effect:** the e2e test files no longer compile under `esModuleInterop`
  (supertest import) — see FIX_PLAN A1. The main app (`src/`) compiles clean.

## 1. Current Repository Shape

The guide describes a monorepo containing:

- `api/`: NestJS API
- `app/`: Next.js user application
- `admin/`: Nuxt administrator portal

This repository currently contains only a NestJS backend at the repository
root. There is no `app/` or `admin/` directory.

Implemented backend modules (all moved under `src/modules/` 2026-06-12):

- `src/modules/auth`
- `src/modules/license`
- `src/modules/business`
- `src/modules/my`
- `src/modules/notification`
- `src/modules/inspection`
- `src/modules/dashboard`
- `src/modules/user`
- `src/modules/zone`
- `src/modules/sync`
- `src/modules/audit`
- `src/modules/export`
- `src/modules/storage`
- `src/modules/external`
- `src/prisma` (stays at root — global module)
- `src/common` (stays at root — cross-cutting)

Infrastructure currently present:

- `prisma/schema.prisma`
- `prisma/migrations/20260612000000_init/migration.sql`
- `prisma/seed.ts`
- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `nginx/nginx.conf`
- `.env.example`

## 2. Status Legend

| Status       | Meaning                                                               |
| ------------ | --------------------------------------------------------------------- |
| `DONE`       | Implemented and statically verified against the contract.             |
| `PARTIAL`    | Main behavior exists, but contract details or required tests remain.  |
| `UNVERIFIED` | Code exists but has not been exercised against PostgreSQL/MinIO.      |
| `MISSING`    | Required work is not present.                                         |
| `DEVIATION`  | Implemented differently from the locked guide and must be reconciled. |

## 3. Phase Comparison

### P0: Scaffold, Database, Migration, Seed

| Requirement                      | Status       | Evidence / Notes                                                                                           |
| -------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------- |
| Monorepo scaffold                | `PARTIAL`    | Backend exists at root; `api/`, `app/`, and `admin/` monorepo layout is not present.                       |
| PostgreSQL 16 Compose service    | `DONE`       | `docker-compose.yml`                                                                                       |
| MinIO Compose service            | `DONE`       | `docker-compose.yml`                                                                                       |
| Exact 17-table Prisma data model | `DONE`       | `prisma/schema.prisma` validates successfully.                                                             |
| Initial migration                | `DONE`       | `prisma/migrations/20260612000000_init/migration.sql`                                                      |
| Mock seed                        | `DONE`       | Counts verified live 2026-06-15: 8 users / 6 zones / 20 businesses / 30 licenses (22/4/4) / 5 types / 10 tasks / 7 reports; 0 RNG4 with expire_date. |
| Run migration                    | `DONE`       | `prisma migrate deploy` applied `20260612000000_init` against live Postgres 16. |
| Run seed                         | `DONE`       | `ts-node prisma/seed.ts` executed successfully against Postgres.               |
| Verify seed data                 | `DONE`       | Verified via direct SQL counts (Prisma Studio not needed).                     |
| Clean-clone Compose startup      | `PARTIAL`    | Infra (`docker-compose.infra.yml`) + host API verified; full `docker compose` (API-in-container) not re-run this session. |

Important seed notes:

- ADMIN password hash uses bcrypt cost 12.
- RNG4 rows are created with `expireDate = null`.
- Mock provider links, businesses, licenses, checklists, tasks, reports,
  notifications, and sync logs are included.
- The seed refuses to run with `NODE_ENV=production`.
- Validate actual entity counts after running the seed. The guide's stated
  license mix is ambiguous because 20 ACTIVE + 4 SUSPENDED + 4 EXPIRED + 2
  expiring records totals 30 only if the two expiring records are treated as a
  separate category. Current seed data gives the expiring records ACTIVE
  status.

### P1: Auth, Guards, Audit, Public API

| Requirement                        | Status    | Evidence / Notes                                                                                                     |
| ---------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| Tang Rat mock login                | `DONE`    | `src/auth/auth.service.ts`, `src/external/tangrat.provider.ts`                                                       |
| Self login for ADMIN               | `DONE`    | Password, lockout, development TOTP, and password-change token implemented.                                          |
| RS256 access JWT                   | `DONE`    | 15-minute configurable TTL; production requires environment keys.                                                    |
| Refresh token hashing and rotation | `DONE`    | SHA-256 hashes and ROTATED session state implemented.                                                                |
| Refresh replay response            | `PARTIAL` | Revokes active sessions and audits suspicious reuse; requires integration test.                                      |
| Logout                             | `DONE`    | Revokes the matching JTI session.                                                                                    |
| Password change/reset              | `PARTIAL` | Main behavior exists; rate limiting and audit coverage require review.                                               |
| JWT guard with JTI lookup          | `DONE`    | `src/common/guards/jwt-auth.guard.ts`                                                                                |
| Roles guard                        | `DONE`    | `src/common/guards/roles.guard.ts`                                                                                   |
| Scope guard                        | `DONE`    | Scope is derived from JWT claims. Service-level coverage still needs integration tests.                              |
| ADMIN client-type guard            | `PARTIAL` | Rejects non-`web_admin` ADMIN claims. It does not enforce the guide's `/api/admin-portal` route namespace condition. |
| Global audit interceptor           | `PARTIAL` | Redaction exists, but audit writes are fire-and-forget and some auth mutations use `@SkipAudit()`.                   |
| Public license type endpoint       | `DONE`    | `GET /api/license-types`                                                                                             |
| Business search/detail/map         | `DONE`    | `GET /api/businesses`, `/:id`, `/map`                                                                                |
| License detail/QR verify           | `DONE`    | Presigned document URLs and QR throttling included.                                                                  |
| My licenses                        | `DONE`    | Personal and mock DBD juristic lookup implemented.                                                                   |
| Notifications                      | `DONE`    | Paginated list, read one, and read all implemented.                                                                  |
| Next.js public application         | `MISSING` | No `app/` directory exists.                                                                                          |
| P1 security integration tests      | `MISSING` | Only unit tests exist.                                                                                               |

### P2: Inspection, Dashboards, Export, User Application

| Requirement                        | Status      | Evidence / Notes                                                                                                        |
| ---------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| Scoped task list/detail            | `DONE`      | Inspector ownership and supervisor zone/agency filters exist.                                                           |
| Task creation                      | `DONE`      | Inspector role, agency, zone, and conflict-of-interest checks exist.                                                    |
| Sequential task number             | `PARTIAL`   | Finds the last number and increments it; concurrent requests can collide.                                               |
| Start/cancel task transitions      | `DONE`      | State checks implemented.                                                                                               |
| Draft report update                | `DONE`      | Owner and editable-state checks implemented.                                                                            |
| Evidence upload/delete             | `PARTIAL`   | Size, MIME type, random object key, and MinIO calls exist; MinIO privacy/bucket setup is unverified.                    |
| Report submit                      | `DONE`      | Moves task to `PENDING_REVIEW` and notifies supervisors.                                                                |
| Report approve                     | `DONE`      | Handles APPROVED state and license suspend/reactivate side effects.                                                     |
| Report return                      | `DONE`      | Requires comment through DTO and returns report to inspector.                                                           |
| Inspector dashboard                | `DONE`      | Counts and recent task query implemented.                                                                               |
| Supervisor dashboard               | `PARTIAL`   | Prototype ratio implemented; output shape should be validated against frontend needs.                                   |
| Admin dashboard                    | `DONE`      | User, zone, license, and sync summary implemented.                                                                      |
| PDF/XLSX export                    | `ACCEPTED DEVIATION` | Uses PDFKit/XLSX and streams directly instead of Puppeteer→MinIO→presigned. Owner-approved 2026-06-15 (no headless-Chrome dependency; sufficient for prototype). |
| Inspector/supervisor Next.js pages | `MISSING`   | No `app/` directory exists.                                                                                             |
| Scope/conflict integration tests   | `MISSING`   | Required cross-zone and cross-agency tests are not present.                                                             |

### P3: Admin, Sync, Cron

| Requirement                | Status      | Evidence / Notes                                                                                     |
| -------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| User list/create           | `DONE`      | Supervisor agency scope and ADMIN create implemented.                                                |
| ADMIN-only role assignment | `DONE`      | `PATCH /api/users/:id/roles` uses `@Roles('admin')`.                                                 |
| Agency/zone management     | `DONE`      | Supervisor restrictions and ADMIN access implemented.                                                |
| Suspend/delete user        | `DONE`      | Session revocation and soft delete implemented.                                                      |
| Zone CRUD                  | `PARTIAL`   | GET/POST/PUT exist; no delete route, matching the endpoint table but not generic CRUD wording.       |
| ACFS mock sync             | `DONE`      | Five mock records and five-minute agency rate check implemented.                                     |
| DIW CSV import             | `PARTIAL`   | Validation and upsert exist; transactionality and malformed-date handling need tests.                |
| Sync status                | `DONE`      | Latest per agency query implemented.                                                                 |
| Audit log list             | `PARTIAL`   | Admin/all and supervisor agency filtering exist; zone-level supervisor filtering is not implemented. |
| Audit export               | `ACCEPTED DEVIATION` | Streams PDFKit/XLSX; owner-approved 2026-06-15 (see PDF/XLSX export row).            |
| License expiry cron        | `DONE`      | 90/30-day notifications, expiration, and seven-day deduplication implemented.                        |
| RNG4 fee cron              | `DONE`      | Uses the required `MOCK_OVERDUE` rule; never sets RNG4 to EXPIRED.                                   |
| Session cleanup cron       | `DONE`      | Hourly cleanup implemented.                                                                          |
| Nuxt 4 admin portal        | `MISSING`   | No `admin/` directory exists.                                                                        |
| Full checklist tests       | `MISSING`   | Runtime and integration coverage is incomplete.                                                      |

## 4. API Contract Coverage

### Auth

| Endpoint                         | Status    |
| -------------------------------- | --------- |
| `POST /api/auth/tang-rat`        | `DONE`    |
| `POST /api/auth/self`            | `DONE`    |
| `POST /api/auth/refresh`         | `DONE`    |
| `POST /api/auth/logout`          | `DONE`    |
| `POST /api/auth/change-password` | `DONE`    |
| `POST /api/auth/forgot-password` | `PARTIAL` |
| `POST /api/auth/reset-password`  | `PARTIAL` |

`forgot-password` uses IP throttling instead of the guide's per-user
three-per-hour rule. Password reset and forgot-password routes skip the global
audit interceptor.

### Public and Personal Data

All endpoints listed in guide section 5.2 are present.

Contract detail to verify:

- `GET /businesses/:id` now filters included licenses to ACTIVE.
- `GET /businesses/map` uses a minimal business selection plus one license
  status relation.
- Juristic not-found uses Nest's `NotFoundException({ found: false })`; verify
  the serialized response matches frontend expectations.

### Inspection

All endpoints listed in guide section 5.3 are present.

Known risks:

- Task number generation is not concurrency-safe.
- Tasks without `licenseId` are accepted for supervisor scope but have no
  agency-bearing relation. Confirm whether this is acceptable.
- Evidence file extension comes from the original filename after MIME
  validation. Consider deriving extension from MIME type.
- Upload handler should explicitly reject a missing multipart file before
  reading `file.mimetype`.

### Dashboards

All three dashboard endpoints are present.

### User and Zone Management

All explicitly listed endpoint methods are present.

### Sync, Audit, and Export

All listed routes are present, but export implementation deviates from the
required Puppeteer/MinIO design.

## 5. Security Checklist Comparison

| Guide Item                                        | Status    | Required Follow-up                                                             |
| ------------------------------------------------- | --------- | ------------------------------------------------------------------------------ |
| bcrypt cost >= 12                                 | `DONE`    | Add an assertion against seeded/user-created hashes.                           |
| RS256, 15-minute JWT, JTI revocation              | `PARTIAL` | Implementation exists; run DB-backed e2e tests to verify.                      |
| Refresh rotation and replay detection             | `PARTIAL` | `test/security.e2e-spec.ts` written; requires DB to run fully.                 |
| ADMIN blocked from Tang Rat and wrong client type | `PARTIAL` | Unit test covers client type; `test/security.e2e-spec.ts` covers Tang Rat.     |
| Cross-zone/cross-agency scope tests               | `PARTIAL` | `test/security.e2e-spec.ts` covers both; requires DB seed to run fully.        |
| Conflict-of-interest test                         | `PARTIAL` | `test/security.e2e-spec.ts` covers it; requires DB seed to run fully.          |
| Upload security and private MinIO                 | `PARTIAL` | App checks done; `StorageService.onModuleInit` now provisions private bucket.  |
| Helmet and CORS allowlist                         | `DONE`    | Present in `src/main.ts`; runtime header test missing.                         |
| Strict global ValidationPipe                      | `DONE`    | Present in `src/main.ts`.                                                      |
| No unsafe raw Prisma                              | `DONE`    | No `$queryRawUnsafe` usage found.                                              |
| Nginx and Nest throttling                         | `PARTIAL` | Nginx zones and selected decorators exist; forgot-password semantics differ.   |
| Audit redaction                                   | `DONE`    | `audit.interceptor.ts` now uses `switchMap`+`await`; redaction preserved.      |
| Global soft-delete middleware                     | `DONE`    | Explicit `deletedAt: null` comprehensively applied on all soft-delete models.  |
| AllExceptionsFilter                               | `DONE`    | `src/common/filters/all-exceptions.filter.ts` wired in `main.ts`.              |
| D3 ADMIN namespace                                | `DONE`    | `ClientTypeGuard` enforces `web_admin`; documented DECISION comment.           |
| Concurrency-safe task numbers                     | `DONE`    | `InspectionService.createTask` moves sequence inside tx + retries on P2002.    |

Security gaps — **all closed and verified 2026-06-15** (see `docs/FIX_PLAN.md`
"Completed & verified"):

1. ✅ e2e suite compiles and passes 8/8 against a seeded DB (was A1, B4).
2. ✅ Audit `entityType` records the resource segment, not `'api'` (was B1).
3. ✅ Forgot-password enforces per-user 3/hour (was B2).
4. ✅ Supervisor audit-log listing is zone+agency scoped (was B3).
5. ✅ MinIO bucket is private — anonymous access returns 403; presigned reads
   work (was B5).

Remaining (non-blocking) deviations tracked as FIX_PLAN C1–C4: export uses PDFKit
(needs Puppeteer decision), evidence extension from filename not MIME, CSV-import
transactionality, and the two-env-file footgun.

## 6. Performance Checklist Comparison

| Guide Item                         | Status    | Notes                                                                             |
| ---------------------------------- | --------- | --------------------------------------------------------------------------------- |
| Prisma indexes                     | `DONE`    | Migration contains schema indexes.                                                |
| Run `EXPLAIN` for map/task queries | `MISSING` | Requires PostgreSQL with seed data.                                               |
| Minimal map query                  | `DONE`    | Uses `select` and one status relation.                                            |
| Dashboard aggregates avoid N+1     | `PARTIAL` | Grouping is used; license expiry cron intentionally loops and queries recipients. |
| React Query caching                | `MISSING` | Frontend absent.                                                                  |
| Dynamic Mapbox/QR imports          | `MISSING` | Frontend absent.                                                                  |
| Pagination capped at 100           | `DONE`    | `PaginationDto` enforces maximum 100.                                             |
| Puppeteer singleton                | `MISSING` | Export currently uses PDFKit.                                                     |

## 7. Tests and Verification Performed

The following passed in a clean temporary dependency environment:

```text
npm run lint
npm run build
npm test -- --runInBand --watchman=false
npx prisma validate
```

Test result:

- 3 suites passed
- 6 tests passed

Current tests cover:

- Default application controller
- ADMIN app-session rejection by `ClientTypeGuard`
- JWT-derived scope assignment
- Deterministic Tang Rat mock identity
- Mock DBD lookup
- Five-record mock GDX response

Current tests do not cover database-backed application behavior.

Runtime verification not performed:

- PostgreSQL migration
- Seed execution
- MinIO upload/download
- Full Docker Compose startup
- Any authenticated HTTP endpoint
- Inspection happy path
- Inspection return/resubmit path
- Refresh-token replay
- Cron execution

## 8. Environment Caveat

The repository's existing `node_modules` directory is root-owned and could not
be updated by the current user. Verification was performed using a clean copy
under `/tmp/elicense-build-20260612`.

Before continuing locally:

1. Fix or replace the root-owned `node_modules` outside the agent sandbox.
2. Run `npm ci` from the repository root.
3. Copy `.env.example` to `.env`.
4. Generate RS256 keys as documented in `README.md`.

Do not commit `.env` or PEM key files.

## 9. Required Next Work

Continue in the master guide's implementation order.

### Step 1: Finish and Verify P0

1. Start PostgreSQL and MinIO.
2. Run `prisma migrate deploy`.
3. Run the seed.
4. Query and verify all required seed counts and RNG4 invariants.
5. Add MinIO bucket initialization with private access.
6. Verify Compose from a clean clone.

### Step 2: Close P1 Security Gaps

1. Implement reliable audit persistence and complete auth audit coverage.
2. Implement the required soft-delete behavior globally.
3. Reconcile and test ADMIN route namespace enforcement.
4. Add refresh rotation/replay integration tests.
5. Add Tang Rat ADMIN rejection integration test.
6. Add public endpoint integration tests against seed data.

### Step 3: Close P2 Gaps

1. Make task number generation concurrency-safe without changing the schema.
2. Add cross-zone and cross-agency task/report integration tests.
3. Add conflict-of-interest endpoint test.
4. Add evidence upload/delete tests against MinIO.
5. Replace PDFKit report PDF export with the required Puppeteer + MinIO flow.
6. Build the Next.js application. If an existing wireframe is later added,
   follow `docs/FRONTEND_INTEGRATION_GUIDE.md` and create
   `frontend-audit.md` before editing pages.

### Step 4: Finish P3

1. Add sync/CSV integration tests and transaction safety.
2. Correct supervisor audit filtering to include required zone scope.
3. Build the Nuxt 4 administrator portal.
4. Run the complete security and performance checklists.

## 10. Rules for the Next AI Agent

> Full operating manual: `AGENTS.md`. Code conventions: `docs/CODING_STANDARDS.md`.
> Always update this document in the same change set as any code change.

1. Read `docs/IMPLEMENTATION_GUIDE_1.md` before changing code.
2. Treat the current backend as partial, not complete.
3. Do not add fields to `prisma/schema.prisma`.
4. Preserve exact enum values.
5. Preserve the RNG4 rule: no expiry date and no EXPIRED transition.
6. Keep external integrations behind mock-provider interfaces.
7. Do not weaken server-side zone or agency filtering.
8. Do not claim a phase complete until database-backed tests and runtime
   verification pass.
9. Update this document whenever implementation status changes.
