# Fix Plan — Backlog & Status

> One item per change set. After finishing an item, tick it here and update the
> matching row in `IMPLEMENTATION_STATUS_AI.md`. Follow `CODING_STANDARDS.md`.
> Verify with `npm run lint && npm run build && npm test` (+ `test:e2e` for
> anything touching DB/auth/inspection).
>
> Priority: **P-A** blocks the build/run, **P-B** is a correctness/security gap,
> **P-C** is a contract deviation or polish.

## ✅ Completed & verified — 2026-06-15

Verified against live Postgres + MinIO (infra via `docker-compose.infra.yml`,
API via `node dist/main.js`). Full stack confirmed working: migrate, seed (exact
counts + RNG4 invariant), both auth paths, scoped + public endpoints, dashboards,
GeoJSON map. `lint` clean, `build` clean, **unit 6/6**, **e2e 8/8**.

- **A1 — e2e tests now compile & pass.** `import * as request` → `import request`
  in `test/security.e2e-spec.ts` and `test/app.e2e-spec.ts` (esModuleInterop).
  Also fixed a real test bug: the zone-scope test compared against a literal
  `'inspector-1-id'`; rewritten to use an ACFS task as the out-of-scope target
  plus a positive control. Added `"forceExit": true` to `test/jest-e2e.json`
  (background schedulers/sockets kept the worker alive).
- **A2 — Prisma 7 migration verified end-to-end.** `prisma generate`,
  `migrate deploy`, and the seed all run; counts match the guide
  (8 users / 6 zones / 20 businesses / 30 licenses [22 ACTIVE, 4 SUSPENDED,
  4 EXPIRED] / 5 types / 10 tasks / 7 reports) and zero RNG4 rows have an
  `expire_date`.
- **A3 — Build output path fixed (was broken for prod).** `nest build` emitted
  `dist/src/main.js` because `prisma/seed.ts` + `prisma.config.ts` were compiled,
  pulling the root up. `start:prod` and the Docker prod `CMD ["node","dist/main.js"]`
  would have failed. Fix: `tsconfig.build.json` now sets `"include": ["src/**/*"]`;
  build emits `dist/main.js`.
- **B1 — Audit `entityType` fixed.** Was always `'api'` (global prefix not
  stripped). Now records the resource segment, verified live
  (`UPDATE | notifications`).
- **B2 — Forgot-password per-user 3/hour.** Enforced in the service by counting
  `PasswordResetToken` rows in the last hour; returns the same generic response
  when exceeded (no user enumeration). Verified: 5 requests → 3 tokens.
- **B3 — Supervisor audit-log zone scope.** `audit.service.ts` now constrains
  non-admins to their agency **and** zones (`userZones.some.zoneId in zoneIds`).
- **B4 — Security e2e suite green** (replay, zone, agency, conflict-of-interest,
  Tang Rat ADMIN rejection, upload restrictions) against the seeded DB.
- **B5 — MinIO private bucket verified.** Removed the malformed deny policy
  (invalid `aws:signedHeaders` condition key was silently failing). MinIO buckets
  are private by default; anonymous GET and bucket-list both return **403**,
  presigned reads still work. No more startup warning.

---

## Open items

### P-C1. Export uses PDFKit instead of Puppeteer — ✅ ACCEPTED DEVIATION (2026-06-15)
- **Where**: `src/modules/export/export.service.ts`.
- **Decision (owner)**: keep PDFKit. Rationale: it is lighter, has no
  headless-Chrome dependency, and is sufficient for the prototype. Do **not**
  add Puppeteer. If a pixel-perfect HTML-rendered PDF is needed later, revisit.
- **Status**: closed; no code change. Recorded as accepted deviation in the
  status doc.

### P-C2. Evidence file extension derived from filename, not MIME
- **Where**: `src/modules/inspection/inspection.service.ts` `uploadEvidence`.
- **Fix**: map validated MIME → fixed extension; reject a missing multipart file
  before reading `file.mimetype` (`BadRequestException`).
- **Accept**: spoofed extension stored as MIME-correct; no-file request → 400.

### P-C3. DIW CSV import transactionality + malformed dates
- **Where**: `src/modules/sync/sync.service.ts`.
- **Fix**: wrap the upsert batch in a transaction; skip/report malformed
  `issue_date` rows; record via `CSV_IMPORT`.
- **Accept**: malformed CSV does not partially import; bad rows reported.

### P-C4. Two env example files are a footgun (DX)
- **Where**: `.env.example` (Docker hostnames `db`/`minio`) vs
  `.env.local.example` (`localhost`). Copying the wrong one breaks host runs —
  it happened this session. `dev.sh` only copies the right one when `.env` is
  absent.
- **Fix (optional)**: have `dev.sh` warn if `.env` contains `@db:` / `minio:9000`
  while running on the host, or document the distinction prominently.

---

## Out of scope for the backend budget (note only)
- `app/` (Next.js) and `admin/` (Nuxt) frontends — not started. If/when built,
  follow `docs/FRONTEND_INTEGRATION_GUIDE.md` and create `frontend-audit.md` first.
