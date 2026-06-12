# Next Steps — Execution Plan

> Audience: the coding agent (Sonnet) continuing this repo.
> Authored after comparing `IMPLEMENTATION_STATUS_AI.md` against the master
> contract `IMPLEMENTATION_GUIDE_1.md` on 2026-06-12.
>
> Master contract still wins on every conflict. Hard rules from guide §0 stay in
> force: do NOT add Prisma fields, preserve exact enum strings, RNG4 never gets
> an expiry date and never transitions to EXPIRED, scope filtering stays
> server-side.

This pass has two parts, in order:

- **Part A** — restructure `src/` into a `src/modules/` grouping (mechanical, do first while the tree is small).
- **Part B** — finish and verify P0, then close the P1 red security gaps so the backend is demonstrably real.

Frontends (`app/`, `admin/`), export→Puppeteer reconciliation, and other contract
deviations are explicitly OUT OF SCOPE for this pass. They come after the backend
is verified.

---

## Part A — Restructure into `src/modules/`

Goal: move every feature/provider module under `src/modules/`. Leave
cross-cutting infra (`common/`, `prisma/`, `types/`) and the app root files at
`src/` root. This is the only structural change requested — do not collapse or
merge any modules; the domain-per-module split is correct and stays.

### A.1 Target layout

```
src/
├── main.ts
├── app.module.ts
├── app.controller.ts
├── app.controller.spec.ts
├── app.service.ts
├── common/            # stays at root (guards, interceptors, decorators, dto, auth.types.ts)
├── prisma/            # stays at root
├── types/             # stays at root
└── modules/
    ├── auth/
    ├── license/
    ├── business/
    ├── inspection/
    ├── user/
    ├── zone/
    ├── notification/
    ├── sync/
    ├── export/
    ├── audit/
    ├── dashboard/
    ├── my/
    ├── storage/
    └── external/
```

### A.2 Steps

1. `mkdir -p src/modules`.
2. `git mv` each of the 14 folders above into `src/modules/` (use `git mv` so
   history is preserved):
   `auth license business inspection user zone notification sync export audit dashboard my storage external`.
3. Fix imports. Two classes of import to update:
   - In `src/app.module.ts`: every `./<module>/<module>.module` becomes
     `./modules/<module>/<module>.module`.
   - Cross-module imports that reach into `../common`, `../prisma`, `../types`
     from inside a moved module now need one more `../` (they sit one level
     deeper). Cross-module references like `../external/...` become
     `../external/...` still (siblings inside `modules/`) — verify each.
   - `src/main.ts` import of `app.module` is unchanged.
4. Update any path in `nest-cli.json`, `tsconfig.json`, or Jest config that
   hard-codes module paths (likely none, but check `roots`/`moduleNameMapper`).
5. Update spec file imports (`security.guards.spec.ts`, `mock-providers.spec.ts`,
   `app.controller.spec.ts`).

### A.3 Gate (must pass before Part B)

```
npm run lint
npm run build
npm test -- --runInBand --watchman=false
npx prisma validate
```

All must be green with the same 3 suites / 6 tests as before. The restructure
must be behavior-neutral. Commit this as its own commit
(`refactor: group feature modules under src/modules/`).

### A.4 Two small nits to fix while here (optional, low-risk)

- Add `src/common/filters/all-exceptions.filter.ts` (guide §2 lists it; it's
  currently missing) and wire it in `main.ts`.
- `src/modules/my/` has only a controller. Give it a `my.service.ts` and move
  the data logic out of the controller, matching every other module.

---

## Part B — Finish & verify backend (P0 close-out + P1 red gaps)

Order matters: get it running and seeded first, then make the security
guarantees real, then prove them with DB-backed tests.

### B.0 Prerequisite (human, outside the sandbox)

The repo's existing `node_modules` is root-owned and cannot be refreshed in
place. Before B.1: fix/remove it, then `npm ci`, then
`cp .env.example .env` and generate RS256 keys per `README.md`. Never commit
`.env` or PEM files.

### B.1 Make it run (P0)

1. `docker compose up -d db minio` (or full stack).
2. `npx prisma migrate deploy`.
3. `npx prisma db seed`.
4. Verify seed counts against guide §9 — do not accept "it ran":
   - 5 LicenseType, 6 Zone, 8 SystemUser, 20 Business, 30 License, 2
     ChecklistTemplate, 10 InspectionTask, 2 SyncLog.
   - License mix: 20 ACTIVE / 4 SUSPENDED (1 RNG4 `MOCK_OVERDUE`) / 4 EXPIRED /
     2 expiring ≤30d. **Resolve the status-doc ambiguity**: confirm whether the
     2 expiring rows are ACTIVE (current seed) and that totals reconcile to 30.
   - **Invariant**: every `RNG4` license has `expireDate = null`. Assert it.
   - Task states: 3 ASSIGNED, 2 IN_PROGRESS, 2 PENDING_REVIEW, 2 APPROVED, 1
     RETURNED.
5. Open Prisma Studio and eyeball the relationships.
6. Provision the MinIO bucket(s) on boot with a **private** policy
   (`storage.service.ts`): create bucket if absent, deny anonymous read. Objects
   must only be reachable via presigned URL.

### B.2 Close the 5 red security gaps (guide §10)

In priority order from `IMPLEMENTATION_STATUS_AI.md` §5:

1. **Reliable audit writes.** The interceptor currently calls Prisma with
   `void` (fire-and-forget). Make the `AuditLog` write `await`ed so a 2xx
   response guarantees the row exists. Remove `@SkipAudit()` from auth mutations
   that the guide requires to be audited (LOGIN/LOGOUT and password changes);
   keep it only where the guide allows (`/auth/refresh`). Keep redaction of
   password/tokens/totpSecret.
2. **Global soft-delete filter.** Add a Prisma client extension (`$extends`
   query override) or middleware in `prisma.service.ts` that injects
   `deletedAt: null` on read queries for models that have `deletedAt`
   (`SystemUser`, `Business`, `License`). Then audit every existing query that
   already hand-filters and remove now-redundant filters or confirm consistency.
3. **D3 ADMIN namespace.** `ClientTypeGuard` rejects non-`web_admin` ADMIN
   claims but does NOT enforce the guide's `/api/admin-portal` route-namespace
   condition. Reconcile: either move admin routes under that namespace or
   enforce the namespace check in the guard. Document the decision with a
   `// DECISION:` comment.
4. **Concurrency-safe task numbers** (P2 risk worth fixing now since it touches
   inspection correctness): replace the read-last-then-increment with a
   collision-safe scheme without changing the schema (e.g. retry on unique
   violation, or a counted prefix query inside a transaction).
5. **MinIO privacy** is provisioned in B.1.6 — here add the negative test (B.3).

### B.3 DB-backed integration tests (guide §10 gates, currently MISSING)

Add tests that run against the seeded Postgres/MinIO:

- Refresh replay: reuse a rotated refresh token → all that user's sessions
  revoked (`revokeReason='SUSPICIOUS'`), 401.
- Scope isolation: inspector in Zone A requests a Zone B task → 403/404; DIW
  supervisor cannot read ACFS license rows.
- Conflict-of-interest: POST task with `assignedTo == business.ownerUserId` →
  409.
- Upload: rejects non-whitelisted mime and >10MB; object is NOT fetchable
  without a presigned URL.
- Tang Rat ADMIN rejection: ADMIN cannot authenticate via `/auth/tang-rat`.

### B.4 Update the status docs

As each row moves to `DONE`, update `IMPLEMENTATION_STATUS_AI.md` (§3, §5) and
`IMPLEMENTATION_STATUS.md`. Per guide rule 9 / status-doc rule 8: do not mark a
phase done until DB-backed tests AND runtime verification pass.

---

## What this pass deliberately leaves for later

- Export deviation (PDFKit → Puppeteer + MinIO + presigned URL) — guide §5.6.
- forgot-password per-user 3/hr rate limit (currently IP-based) — guide §5.1.
- Supervisor audit filtering missing zone scope — guide §5.6.
- `app/` (Next.js) and `admin/` (Nuxt) frontends — guide §7, P1–P3.
- Full monorepo move to `api/ app/ admin/` — defer until frontends start.

## Definition of done for this pass

`docker compose up` from a clean clone (only `.env` created) boots, migrates,
seeds with verified counts, the 5 red security gaps are closed, and the B.3
integration tests pass. Then P0 is truly `DONE` and P1 security gates are green.
