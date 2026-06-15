# AGENTS.md — Rules for AI Agents Working on This Repo

> **Read this first, every session.** It is the operating manual for any AI
> agent (Claude, GPT, Gemini, etc.) touching this codebase. It exists because
> past agents wrote code that did not match the project's style or broke locked
> rules. Follow it exactly.

## What this project is

NestJS 11 backend for a Thai e-licensing platform that plugs into the ทางรัฐ
(Tang Rat) super app. PostgreSQL 16 + Prisma 7 + MinIO. All external
integrations are **mock providers**. This repo is the `api/` only; the `app/`
(Next.js) and `admin/` (Nuxt) frontends are not built yet.

## The three documents — and their order of authority

1. **`docs/IMPLEMENTATION_GUIDE_1.md`** — the master contract. Schema, endpoints,
   security rules, locked decisions. **When anything conflicts, the guide wins.**
2. **`docs/CODING_STANDARDS.md`** — *how* to write code so it matches the rest of
   the codebase ("Claude style"). Read before writing any code.
3. **`docs/FIX_PLAN.md`** — the prioritized backlog: what is broken, why, and how
   to fix it. Pick work from here.

Status tracking lives in **`docs/IMPLEMENTATION_STATUS_AI.md`**.

## Mandatory workflow (do not skip steps)

1. Read `docs/IMPLEMENTATION_GUIDE_1.md` (or the relevant section) before editing.
2. Read `docs/CODING_STANDARDS.md`. Match the existing patterns — do not invent
   your own structure, error style, or naming.
3. Pick one item from `docs/FIX_PLAN.md`. Do **one** item per change set.
4. Implement it the way the existing code does it. Look at a neighbouring file
   first and copy its shape.
5. Verify locally: `npm run lint && npm run build && npm test`. If you touched
   DB/auth/inspection, also run `npm run test:e2e` against a seeded database.
6. **Update `docs/IMPLEMENTATION_STATUS_AI.md`**: change the relevant row's
   status and add one line under the change log noting what you did and the date.
7. Keep the diff small and reviewable. Do not reformat unrelated files.

## Golden rules (never violate — from guide §0)

1. **All external data is MOCK.** Keep every integration behind a provider in
   `src/modules/external/`. Mark mocks `// MOCK: replace in UAT`.
2. **Never add or rename Prisma schema fields.** If you think you need one, stop
   and leave a `// TODO(schema):` comment instead.
3. **Enum values are exact.** Import from `@prisma/client`; never use raw status
   strings or change casing.
4. **RNG4 licenses never expire by date.** Non-payment → `SUSPENDED`, never
   `EXPIRED`. `expireDate` stays `null`.
5. **Scope filtering is server-side only.** Never trust client-supplied zone or
   agency. Scope comes from JWT claims via `ScopeGuard`.
6. **Every mutating endpoint is audited** by the global interceptor. Only tag
   `@SkipAudit()` where the guide allows (e.g. `/auth/refresh`).
7. **No secrets in git.** `.env.example` only.
8. **Thai text in user-facing strings; English in all code, comments, commits.**

## Role model (owner-defined 2026-06-15 — supersedes guide D1)

Five **hierarchical** roles, defined in `src/common/auth.roles.ts`:

```
public(0) < inspector(1) < supervisor(2) < admin(3) < super_admin(4)
```

- A higher rank inherits every lower rank's route access (`RolesGuard` uses
  `satisfiesRole`). Admin/super_admin get a null scope (no zone/agency filter).
- **super_admin**: manages all users; the *only* role that can grant `admin` or
  `super_admin`. (Conceptually the UI for super_admin is user-management only.)
- **admin**: full operational access (tasks, approvals, all dashboards, audit);
  may grant roles *below* admin (public/inspector/supervisor) but **not** admin.
- **supervisor**: assigns tasks, reviews/approves reports, manages own-agency users.
- **inspector**: performs field inspections.
- **public**: read-only.
- Authorization helpers (`isAdminTier`, `canGrantRole`, `canManageUser`) live in
  `auth.roles.ts` — use them; never hand-roll `roles.includes('admin')`.

## Locked decisions (do not re-debate)

- **D1 (revised)**: Role assignment is restricted by rank — super_admin grants
  admin/super_admin; admin grants below admin; supervisors cannot change roles.
- **D3 (extended 2026-06-15)**: The ADMIN TIER (admin + super_admin) may only
  authenticate via the web portal (`clientType='web_admin'`,
  `authProvider='self'`, password + TOTP); blocked on the mToken path and on
  `/auth/login`, and rejected by `ClientTypeGuard`. The `public` role may now
  self-register (`POST /auth/register`) and use password login (`POST
  /auth/login`) **in addition to** Tang Rat. See `docs/AUTHENTICATION.md` for the
  full auth model.

## Commands

```bash
./dev.sh              # one-shot local dev: infra + migrate + seed + start:dev
npm run start:dev     # watch mode (infra must already be up)
npm run lint          # eslint --fix
npm run build         # nest build
npm test              # unit tests
npm run test:e2e      # DB-backed integration tests (needs Postgres + seed)
npx prisma migrate deploy
npx prisma generate
```

Local infra only (Postgres + MinIO), API runs on host:
`docker compose -f docker-compose.infra.yml up -d`

Interactive API docs (Swagger UI): **http://localhost:3001/docs** (OpenAPI JSON
at `/docs-json`). See `docs/CODING_STANDARDS.md` §10b for how endpoints are
documented — keep new endpoints annotated the same way.

## Prisma 7 notes (this project is on Prisma 7, not 6)

- The datasource URL lives in `prisma.config.ts`, **not** in `schema.prisma`.
- `PrismaClient` uses the `@prisma/adapter-pg` driver adapter with a `pg.Pool`.
  There is no `$connect`/`$disconnect`; close the pool in `onModuleDestroy`.
- `prisma.config.ts` is excluded from the Nest TS build via `tsconfig.json`.

## When you finish

State plainly what you changed, what you verified (with command output), and
what is still unverified. Never mark a phase "done" without DB-backed proof.
Update `docs/IMPLEMENTATION_STATUS_AI.md` in the same change set.
