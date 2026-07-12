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

- **2026-07-12 (mobile viewport and identity normalization)** — AppShell page
  minimum heights now account for the mobile navbar using `100dvh`, preventing
  an extra blank viewport on short pages. Mobile inputs/selects/textareas use
  a minimum 16px font size to prevent iOS focus zoom without disabling browser
  zoom. Username/email values are trimmed and lowercased in auth and user
  management UI plus backend request/service boundaries; free-text search,
  passwords, OTPs, and display names retain their original casing semantics.

- **2026-07-12 (external license QR navigation)** — License QR scan entry
  points now validate and open the encoded HTTP(S) URL in a new browser tab,
  without resolving it through the platform's license lookup. Officer identity
  QR verification remains on its separate internal flow.

- **2026-07-12 (establishment export page UI)** — The officer establishment
  export banner now opens a dedicated `businesses/:businessId/exports` page.
  It provides an establishment summary, an all-license PDF export action, and
  a collapsible list with an outlined green export action for each license,
  while reusing the logged export endpoint.

- **2026-07-12 (license card PDF previews)** — License list, grouped search,
  and business-detail responses now include a 10-minute presigned URL for each
  license's first `LICENSE_CERTIFICATE` document. The shared Next.js license
  card renders page 1 of that PDF with PDF.js and retains the mock image only
  when no certificate document exists or rendering fails.

- **2026-07-12 (direct corporate licenses)** — Owner-approved migration
  `20260712010000_corporate_license_scope` lets `License` belong directly to a
  `JuristicPerson` or to a `Business`, with a database check constraint that
  requires exactly one subject. Juristic license groups now return real
  `corporateLicenses`. The user mock generator creates two document-linked
  corporate licenses for its demo company; expiry notifications include active
  corporate members.

- **2026-07-12 (user-owned mock license generator)** — Reworked the My Licenses
  demo-data generator to use the curated seeded certificate catalog as immutable
  templates. It creates user-owned personal and juristic businesses, copies
  license metadata and private MinIO document references, and offsets source
  coordinates slightly to avoid stacked e-Map pins. Selection is deterministic
  per user and reruns are idempotent. Prototype production can explicitly allow
  it with `DEMO_DATA_ENABLED=true`.

- **2026-07-12 (source-linked license export PDF)** — Reworked PDF export into
  a Thai government-style report: a business/owner/contact cover headed
  `รายงานผลการตรวจสอบใบอนุญาต`, then a formal summary page before each
  selected license's source document. Metadata includes Bangkok issue date/time,
  reference, and `e-license` source. Actual MinIO source PDFs are appended
  page-for-page after their corresponding summary; PNG/JPEG source documents
  are embedded as pages. Removed the bundled mock certificate from this flow.

- **2026-07-12 (unrestricted officer document exports)** — Removed the
  inspection/approval conflict-of-interest rule from license-document export.
  Export is a logged document-distribution action, not a review decision; any
  officer may export any establishment's license document. Verification and
  approval conflict guards remain in place.

- **2026-07-12 (Tang Rat staff promotion and portal-only admin sign-in)** —
  Added `PATCH /api/users/:id/access` for super_admin to assign role and
  agency atomically. Officer assignment requires an active agency and revokes
  all existing sessions, so the next Tang Rat sign-in receives the new scoped
  JWT. Added user-list identity provenance for the back-office UI and an e2e
  flow covering public Tang Rat user → officer promotion → re-authentication.

- **2026-07-12 (certificate asset inspection pipeline)** — Added
  `npm run certificates:inspect` to scan every PDF under `src/assets/pdf/`,
  validate canonical certificate profiles, and emit a compact page/hash/field
  report. `--write-stubs` creates profile stubs for newly added files; `--strict`
  fails CI when a PDF is unconfigured.

- **2026-07-11 (business detail license status parity)** — `GET /api/businesses/:id`
  now returns every non-deleted license, including expired, suspended, revoked,
  and pending entries, matching grouped license search behavior.

- **2026-07-11 (curated certificate seed data)** — Replaced generic document
  examples with twelve real-form mock licenses across DIW RNG4, DIW HAZMAT,
  and ACFS producer/exporter/importer certificates. Seed now uploads every
  source PDF under `src/assets/pdf/` into private MinIO and creates one
  `LICENSE_CERTIFICATE` document per curated license.

- **2026-07-11 (single-license officer export PDF)** — License detail now uses
  the same verifiable export workflow for one license. The PDF title is
  `รายงานข้อมูลใบอนุญาต`; its header carries the export reference and
  `E-LICENSE` source platform, and it includes the bundled mock certificate as
  a full-page image until issued certificate media is available.

- **2026-07-11 (verifiable establishment license-document exports)** — Added
  officer-only export of selected establishment licenses to PDF, XLSX, or CSV.
  PDF embeds supported image documents, appends supported source PDFs, and
  carries a QR verification URL; XLSX/CSV provide structured license/document
  data. Added immutable `LicenseDocumentExport` and item records with a content
  snapshot, SHA-256 checksum, private MinIO object key, opaque verification
  code, completion/failure state, and explicit `EXPORT` / `EXPORT_FAILED`
  audit rows. `GET /api/public/license-document-exports/:verificationCode`
  verifies origin without exposing the private file. The schema policy now
  requires owner approval plus a migration rather than forbidding all changes.

- **2026-07-10 (PDF fonts: Sarabun Thai+Latin)** — First font fix still left data
  fields unreadable: `NotoSansThai-*.ttf` is Thai-script-only, so PDFKit drew
  □ / missing glyphs for Latin and digits (`DIW`, `RNG4-00001`, license nos).
  Replaced bundled fonts with **Sarabun Regular/Bold** (Thai + Latin), updated
  `pdfFontPaths` / Dockerfile checks, and verified PDF text extraction contains
  full Thai strings and ASCII license numbers with no null glyphs.
- **2026-07-10 (PDF Thai fonts bundled for Ubuntu)** — Officer inspection PDF
  export showed □ boxes on Ubuntu/Docker because Helvetica has no Thai glyphs
  and `src/assets/fonts/` was empty. (Superseded by Sarabun fix above for
  mixed Thai+Latin fields.)
- **2026-07-09 (juristic license tab and officer conflict guardrails)** —
  Refactored the juristic license response contract to expose
  `corporateLicenses` separately from premise/business licenses while leaving a
  `TODO(schema)` because the locked schema still requires `License.businessId`.
  Updated officer-facing license/status and inspection review paths to reject
  conflicts of interest for individually owned businesses and juristic
  OWNER/ADMIN memberships.
- **2026-07-09 (officer inspection detail editing)** — Added
  `PATCH /api/officer/inspections/:inspectionId/items/:itemId` for the creating
  officer/admin tier to update an inspection item note/findings, and wired the
  frontend officer inspection detail page to show per-item edit controls plus
  camera-only evidence capture.
- **2026-07-09 (business contact detail)** — Added prototype business contact
  email values to public and juristic business detail responses without a
  schema change, and wired the frontend business detail page to display backend
  phone/email values instead of placeholders.
- **2026-07-09 (mock seed coordinate pool)** — Added a deterministic
  Thailand-only coordinate pool for prototype mock data, weighted toward
  Greater Bangkok and nearby industrial provinces. Personal and juristic dev
  seed helpers now reuse stable per-user mock entities with coordinate metadata
  rendered into Thai addresses, and `POST /api/my/dev/seed-demo-data` creates
  the complete personal + juristic demo flow for frontend QA.
- **2026-07-09 (e-map demo data alignment)** — Linked the personal dev license
  seed to one stable user-owned demo business with Bangkok coordinates, so the
  created mock license appears in both the license page and e-map. Expanded
  `GET /api/businesses/map` GeoJSON properties with license count, primary
  license, status counts, address, province, and ownership summary for frontend
  pin popups without exposing raw personal owner IDs.
- **2026-07-08 (production Mapbox build env)** — Updated production compose to
  pass frontend public env values into the Next.js Docker build. The e-map reads
  `NEXT_PUBLIC_MAPBOX_TOKEN` in client code, so the token must be available
  during `bun run build`, not only as a runtime container env. Production
  frontend build now requires `NEXT_PUBLIC_MAPBOX_TOKEN` and also forwards
  `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_DGA_REDIRECT_URI` as build args.
- **2026-07-08 (production DGA OIDC env passthrough)** — Fixed production
  compose overriding real Tang Rat/DGA login settings. Removed
  `DGA_OIDC_MODE: mock` from the backend service so backend `.env` controls
  real vs mock mode, and removed the frontend localhost
  `NEXT_PUBLIC_DGA_REDIRECT_URI` override so the frontend `.env` callback URL is
  used. Root cause: deployed users received a real DGA authorization code, but
  the backend container was forced into mock mode and rejected it as
  `Invalid authorization code`.
- **2026-07-08 (pg client query deprecation fix)** — Removed all Prisma array
  transaction calls (`$transaction([ ... ])`) from backend services and the
  Prisma seed reset, replacing them with interactive transactions that await
  each query sequentially. Updated the Docker production entrypoint seed check
  to use explicit async/await for direct `pg` access. Verified build, lint,
  unit tests, e2e tests, and a rebuilt local-prod backend container restart;
  the previous `Calling client.query() when the client is already executing a
query` warning no longer appears in fresh Docker logs.
- **2026-07-08 (prototype production compose alignment)** — Replaced
  `docker-compose.production.yml` with a production-named version of the
  verified local prototype stack. It now uses backend `.env` plus frontend
  `../../Frontend/certificate-tracking/.env`, builds production Docker images,
  runs with HTTP-friendly demo settings, migrates and seeds on empty DB, and
  stores data in `certificate-tracking-production` Docker resources. Added
  `scripts/production-stack.sh` for `up`, `verify`, `logs`, `down`, and `reset`.
  Verified on alternate ports: backend/frontend images built, all services were
  healthy, seed counts were present, and RNG4 invariant returned zero violations.
- **2026-07-08 (Docker Thai PDF font fix)** — Fixed unreadable Thai text in
  Docker-generated officer inspection PDFs. Root cause: bundled
  `src/assets/fonts/NotoSansThai-*.ttf` files were actually GitHub HTML pages,
  and Docker/Linux had no macOS Thai font fallback, so PDFKit fell back to
  Helvetica. Backend production image now installs Alpine `font-noto-thai`, and
  the PDF exporter checks `/usr/share/fonts/noto/NotoSansThai-*.ttf`. Removed
  the invalid `.ttf` HTML files. Verified in the local Docker stack by exporting
  a real officer inspection PDF; response was `application/pdf`, 687044 bytes,
  with embedded `NotoSansThai` subset.
- **2026-07-08 (local production-like Docker stack)** — Added
  `docker-compose.local-prod.yml` plus `scripts/local-prod-stack.sh` and
  `docs/LOCAL_DOCKER_PROD.md` for a localhost proof stack that builds backend
  and frontend Docker images, starts PostgreSQL 16 and MinIO, runs Prisma
  migrations, seeds only when the database is empty, exposes the Next.js app on
  localhost, and verifies core seed counts plus the RNG4 no-expire-date
  invariant. Verified on alternate local ports: both Docker images built,
  all four services became healthy, seed counts were present, RNG4 invariant
  returned zero violations, and a frontend-BFF `POST /api/auth/register`
  created a new public user in Docker Postgres.
- **2026-07-08 (officer inspection PDF export styling)** — Updated PDF export layout at `GET /api/officer/inspections/:id/export?format=pdf` using registered Noto Sans Thai fonts for readable Thai text, matching the requested report format, and placing all evidence pictures on page 2 in a grid.
- **2026-07-08 (officer inspection PDF report export)** — Improved
  `GET /api/officer/inspections/:id/export?format=pdf` so the exported file is
  a structured inspection report PDF for that inspection, including report
  summary, officer, business, item/license details, notes, and evidence counts.
  Fixed invalid bundled `.ttf` files being registered as PDFKit fonts by
  validating font headers and falling back to system Thai-capable fonts; changed
  export audit persistence to a sequential transaction to avoid pg query overlap
  warnings on export.
- **2026-07-08 (officer inspection report list)** — Added `GET
/api/officer/inspections` for the logged-in officer's own submitted field
  reports, shared the list response shape with admin officer logs, and normalized
  plain date filters so `dateTo=YYYY-MM-DD` includes the full day. Updated the
  officer reporting frontend handoff contract.
- **2026-07-08 (officer inspection upload & item validation)** — Refactored officer field inspection reporting to support a 3-field structure per item: licenseId, detailNote, and optional pictures. Implemented temporary upload capability under POST /api/officer/inspections/upload to stage files in MinIO before a single batch transaction. Fixed E2E test suite mock tokens and scoping filter queries to enable successful runs.
- **2026-07-02 (production compose deploy)** — Added
  `docker-compose.production.yml`, an all-in-one Ubuntu production stack using
  inline Dockerfiles for frontend/backend plus Postgres, MinIO, and Caddy HTTPS
  reverse proxy. Backend runs `prisma migrate deploy` before API start and seeds
  only when `system_users` is empty; frontend talks to backend via the internal
  Docker network.
- **2026-07-02 (DGA OIDC logout)** — Added encrypted server-side storage for
  DGA provider `id_token` on `UserSession` (`provider_id_token`) and return an
  optional `endSessionUrl` from `POST /api/auth/logout` for sessions created by
  DGA OIDC. Logout still revokes the local API session first; frontend redirects
  to DGA `/connect/endsession` only when `endSessionUrl` is present.
- **2026-07-02 (DB-backed DGA OIDC state)** — Added `DgaOidcState`
  (`dga_oidc_states`) plus migration `20260702000000_dga_oidc_states` so DGA
  OIDC state nonces are stored in PostgreSQL and consumed atomically on callback.
  This replaces the process-local nonce store and supports multi-instance API
  deployments without sticky routing.
- **2026-07-02 (DGA production hardening)** — Hardened the DGA OIDC login flow
  for production use: backend now allowlists callback redirect URIs, validates
  requested scopes, records generated state nonces, and consumes each state once
  on callback to block replay. Frontend callback now requires the tab's stored
  DGA state and redirect URI before sending `code` to the backend. DGA provider
  failures now log sanitized status/error metadata only. Added unit coverage
  for redirect allowlist, scope validation, and one-time state consume.
- **2026-07-02 (DGA UserInfo mapping tolerance)** — Updated real DGA UserInfo
  mapping to accept `czp_user`, standard OIDC `sub`, or `citizen_id` as the
  provider subject. This matches the requested scopes more closely after a live
  callback confirmed token exchange can succeed but the previous mapper rejected
  the UserInfo payload shape. A subsequent live callback completed end-to-end
  and issued a local `public` session for the DGA user.
- **2026-07-02 (DGA token hash correction)** — Aligned the real DGA OIDC
  `/connect/token` client authentication hash with the provided DGA sample:
  `md5(secret + "EGA")`, then six more rounds of `md5(previous + "EGA")`, and
  sends the resulting credential using the sample's `basic` authorization
  scheme. Manual token debug changed from `invalid_client` to `invalid_grant`,
  confirming client authentication now passes for an already-expired/used code.
- **2026-07-02 (DGA OIDC scope update)** — Updated DGA/Tang Rat authorize
  scope examples and local configuration to request
  `openid citizen_id given_name family_name`, with `openid` first as required
  by OpenID Connect.
- **2026-07-02 (DGA Digital ID OIDC flow)** — Added a backend OIDC-compatible
  Tang Rat/DGA Digital ID flow: `POST /api/auth/dga/authorize` returns a signed
  10-minute state plus DGA authorize URL, and `POST /api/auth/dga/callback`
  validates state, exchanges a mock authorization code, calls mock UserInfo, and
  reuses the existing Tang Rat identity-binding/session issuance logic. Added
  `MockDgaOidcProvider`, DGA OIDC env placeholders, frontend handoff docs, and
  provider unit coverage. Added `RealDgaOidcProvider` behind `DGA_OIDC_MODE=real`
  for UAT/Production token and UserInfo calls.
- **2026-07-02 (legacy officer result payload tolerance)** — `POST
/api/officer/inspections` now accepts a legacy `items[].result` field without
  enum validation and ignores it, so old frontend forms that still include
  pass/fail state do not block submission. Added DTO validation coverage for
  this compatibility path.
- **2026-07-02 (cross-agency officer reporting bypass)** — Updated the officer
  reporting workflow so `GET /api/officer/licenses` can show licenses across
  agencies by default and `POST /api/officer/inspections` can submit report
  items for licenses from any agency under the selected business. `agencyId` is
  now an optional license-agency filter for the search endpoint only; submitted
  reports still store the officer's own agency for audit.
- **2026-07-01 (officer inspection result contract)** — Updated
  `POST /api/officer/inspections` so frontend no longer sends item-level
  pass/fail status. `OfficerInspectionItem.result` is now nullable for backward
  compatibility, create/detail/export/admin log responses no longer expose the
  item result, and frontend handoff docs remove `result` from request/response
  examples and admin log filters.
- **2026-07-01 (zone removal / agency-only officer scope)** — Removed the zone
  feature from the active backend contract. Prisma schema drops `Zone`,
  `UserZone`, `Business.zoneId`, and `InspectionTask.zoneId`; officer scope is
  now agency-only (`RequestScope = { agencyId }`). Removed the `ZoneModule` and
  user zone assignment endpoint, updated inspection/audit/dashboard/export/cron
  logic to use agency scope, and rebuilt seed data without zones. Business
  location now uses `address`, `province`, `latitude`, and `longitude`; e-map
  implementation remains deferred.
- **2026-07-01 (officer reporting + QR implementation)** — Implemented the
  approved officer field-report workflow as a separate module from legacy
  task-based inspections. Added Prisma models/migration for
  `OfficerInspection`, `OfficerInspectionItem`, `OfficerInspectionEvidence`,
  and `OfficerPublicProfileScanLog`; added `/api/officer/licenses`,
  `/api/officer/inspections`, item evidence upload, detail/export,
  `/api/admin/officer-inspection-logs`, `/api/officers/:id/qr-profile`, and
  `/api/public/officers/verify/:token`. Added frontend handoff doc
  `docs/FRONTEND_OFFICER_REPORTING_API.md`.
- **2026-07-01 (officer role hygiene + reporting plan)** — Fixed
  `ScopeGuard` so public+officer multi-role users receive officer scope instead
  of being treated as public-only. User-management create/agency mutations
  now enforce role grant/manage caps through the shared role helpers. Updated
  officer role wording in Swagger/auth/user docs. Added
  `docs/PLAN_OFFICER_REPORTING_AND_QR_PROFILE.md` for the proposed field report,
  export, admin log, and public officer QR verification feature.
- **2026-07-01 (juristic business detail API)** — Added
  `GET /api/my/juristic-businesses/:id` for full business/branch/factory detail
  under a juristic person. The endpoint derives juristic ownership from the
  business, verifies active membership, and returns address, juristic owner, license
  summary, and all licenses for that business. Updated frontend handoff docs.
- **2026-07-01 (juristic hierarchy response)** — Changed
  `GET /api/my/juristic-license-groups` from a flattened company-level license
  list to the Thai business hierarchy: juristic person → businesses/branches →
  licenses. Updated frontend handoff examples accordingly.
- **2026-07-01 (prototype juristic demo seed)** — Added
  `POST /api/my/dev/seed-juristic-license-demo`, an idempotent dev-only helper
  that creates a demo juristic person, makes the current user OWNER, creates
  demo businesses, and attaches RNG4/HAZMAT/ACFS mock licenses for frontend
  juristic accordion testing. Updated frontend handoff instructions.
- **2026-07-01 (juristic grouped license API)** — Added
  `GET /api/my/juristic-license-groups`, a read-only endpoint for frontend
  collapse UI that returns every active juristic membership with nested licenses
  grouped by company. This avoids token/context switching for display-only
  juristic license browsing. Updated `docs/FRONTEND_LICENSE_OWNERSHIP_API.md`.
- **2026-07-01 (license ownership contract)** — Clarified personal vs juristic
  license ownership without schema changes. Added shared ownership metadata for
  `GET /api/my/licenses`, public license detail, and public business responses;
  personal public responses do not expose citizen identity or owner user IDs.
  Added frontend handoff doc `docs/FRONTEND_LICENSE_OWNERSHIP_API.md` covering
  context switching, endpoint request/response examples, and cache keys.
- **2026-06-29 (README updates)** — Rewrote and updated `README.md` to include comprehensive Thai-based developer instructions, detailing project folder structures, environment variables (.env, .env.local, .env.deploy), and local/docker/production commands.
- **2026-06-16 (Startup URL logging)** — Added built-in NestJS `Logger` in
  `src/main.ts` to log the application API base URL and Swagger UI URL on startup.
  Verified with `npm run lint` and `npm run build`.

- **2026-06-16 (D7 — Self-service juristic join requests)** — `JoinRequestStatus`
  enum + `JuristicJoinRequest` model. Migration: `20260616030000_juristic_join_requests`
  (includes partial unique index `uniq_pending_join`). Hybrid approval routing:
  peer queue on `GET/POST /api/juristic/:id/join-requests/{approve,reject}`;
  first-owner staff queue on `GET/POST /api/juristic-requests/admin/*`. Requester
  endpoints: `GET /api/juristic-requests/companies`, `POST /api/juristic-requests`,
  `GET /api/juristic-requests/mine`, `DELETE /api/juristic-requests/:id`. Rate limit
  (3/hr + 5 total pending), 30-day expiry with lazy sweep, inline notifications.
  Seed: `join-requester` user added. Verified: `npm run build`, `npm test` (22/22),
  lint clean. **Pending DB start**: run `prisma migrate deploy` + `prisma db seed`
  to apply migration and reset seed with new user.

- **2026-06-16 (D6 — Juristic multi-tenant corporate portal)** — Full 7-phase
  implementation. Schema: added `JuristicRole` enum, `JuristicMember` junction,
  `JuristicInvite`, `UserSession.activeJuristicId`, `AuditLog.juristicId`; removed
  `SystemUser.juristicPersonId` FK. Migration: `20260616024209_juristic_multitenant`.
  Auth: `switchContext()` in `AuthService` re-mints JWT in-place; `POST /api/auth/context`
  endpoint; refresh carries over juristic context; `claimsFor` extended with
  `activeJuristicId`/`juristicRole`. Guards: `JuristicContextGuard` (global, live
  revocation check), `RequireJuristicRoleGuard`; decorators `@JuristicCtx()`,
  `@RequireJuristicRole()`. New module `src/modules/juristic/` with 11 endpoints:
  memberships, claim, accept invite, company detail, member CRUD, invite CRUD. DBD
  provider extended with `isDirector()`. Data isolation in `my.service.ts` + controller
  branches on `juristicContext`. Audit interceptor stamps `juristicId`. Swagger tag
  added; `openapi.json` regenerated. Seed: `publicOwner` has OWNER on company[0] +
  ADMIN on company[1]. Verified: `npm run build`, `npm test` (22/22 pass),
  `npm run swagger:export` (no warnings).

- **2026-06-15 (D5 — Profile & Tang Rat-prioritized identity binding super-plan)** — Phases 1-5: ... + **owner decision: plaintext citizen ID** in citizenId column (searchability + gov integration via TDE + RBAC + audit, **not** hashing).

  **DBA confusion concern addressed + Golden Rule exception exercised**: User explicitly said "i let you break the rule for this time to make schema is better". We renamed citizenIdHash → citizenId (column to citizen_id) with proper migration. Old name was confusing for DB officers. Schema now clean. Heavy comments + plan updated. All verification (lint/build/units 22/22, e2e) green. (6 + 7 + 8 remain.)

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

| Requirement                      | Status    | Evidence / Notes                                                                                                                                     |
| -------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo scaffold                | `PARTIAL` | Backend exists at root; `api/`, `app/`, and `admin/` monorepo layout is not present.                                                                 |
| PostgreSQL 16 Compose service    | `DONE`    | `docker-compose.yml`                                                                                                                                 |
| MinIO Compose service            | `DONE`    | `docker-compose.yml`                                                                                                                                 |
| Exact 17-table Prisma data model | `DONE`    | `prisma/schema.prisma` validates successfully.                                                                                                       |
| Initial migration                | `DONE`    | `prisma/migrations/20260612000000_init/migration.sql`                                                                                                |
| Mock seed                        | `DONE`    | Counts verified live 2026-06-15: 8 users / 6 zones / 20 businesses / 30 licenses (22/4/4) / 5 types / 10 tasks / 7 reports; 0 RNG4 with expire_date. |
| Run migration                    | `DONE`    | `prisma migrate deploy` applied `20260612000000_init` against live Postgres 16.                                                                      |
| Run seed                         | `DONE`    | `ts-node prisma/seed.ts` executed successfully against Postgres.                                                                                     |
| Verify seed data                 | `DONE`    | Verified via direct SQL counts (Prisma Studio not needed).                                                                                           |
| Clean-clone Compose startup      | `PARTIAL` | Infra (`docker-compose.infra.yml`) + host API verified; full `docker compose` (API-in-container) not re-run this session.                            |

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

| Requirement                        | Status               | Evidence / Notes                                                                                                                                                 |
| ---------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scoped task list/detail            | `DONE`               | Inspector ownership and supervisor zone/agency filters exist.                                                                                                    |
| Task creation                      | `DONE`               | Inspector role, agency, zone, and conflict-of-interest checks exist.                                                                                             |
| Sequential task number             | `PARTIAL`            | Finds the last number and increments it; concurrent requests can collide.                                                                                        |
| Start/cancel task transitions      | `DONE`               | State checks implemented.                                                                                                                                        |
| Draft report update                | `DONE`               | Owner and editable-state checks implemented.                                                                                                                     |
| Evidence upload/delete             | `PARTIAL`            | Size, MIME type, random object key, and MinIO calls exist; MinIO privacy/bucket setup is unverified.                                                             |
| Report submit                      | `DONE`               | Moves task to `PENDING_REVIEW` and notifies supervisors.                                                                                                         |
| Report approve                     | `DONE`               | Handles APPROVED state and license suspend/reactivate side effects.                                                                                              |
| Report return                      | `DONE`               | Requires comment through DTO and returns report to inspector.                                                                                                    |
| Inspector dashboard                | `DONE`               | Counts and recent task query implemented.                                                                                                                        |
| Supervisor dashboard               | `PARTIAL`            | Prototype ratio implemented; output shape should be validated against frontend needs.                                                                            |
| Admin dashboard                    | `DONE`               | User, zone, license, and sync summary implemented.                                                                                                               |
| PDF/XLSX export                    | `ACCEPTED DEVIATION` | Uses PDFKit/XLSX and streams directly instead of Puppeteer→MinIO→presigned. Owner-approved 2026-06-15 (no headless-Chrome dependency; sufficient for prototype). |
| Inspector/supervisor Next.js pages | `MISSING`            | No `app/` directory exists.                                                                                                                                      |
| Scope/conflict integration tests   | `MISSING`            | Required cross-zone and cross-agency tests are not present.                                                                                                      |

### P3: Admin, Sync, Cron

| Requirement                | Status               | Evidence / Notes                                                                                     |
| -------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| User list/create           | `DONE`               | Supervisor agency scope and ADMIN create implemented.                                                |
| ADMIN-only role assignment | `DONE`               | `PATCH /api/users/:id/roles` uses `@Roles('admin')`.                                                 |
| Agency/zone management     | `DONE`               | Supervisor restrictions and ADMIN access implemented.                                                |
| Suspend/delete user        | `DONE`               | Session revocation and soft delete implemented.                                                      |
| Zone CRUD                  | `PARTIAL`            | GET/POST/PUT exist; no delete route, matching the endpoint table but not generic CRUD wording.       |
| ACFS mock sync             | `DONE`               | Five mock records and five-minute agency rate check implemented.                                     |
| DIW CSV import             | `PARTIAL`            | Validation and upsert exist; transactionality and malformed-date handling need tests.                |
| Sync status                | `DONE`               | Latest per agency query implemented.                                                                 |
| Audit log list             | `PARTIAL`            | Admin/all and supervisor agency filtering exist; zone-level supervisor filtering is not implemented. |
| Audit export               | `ACCEPTED DEVIATION` | Streams PDFKit/XLSX; owner-approved 2026-06-15 (see PDF/XLSX export row).                            |
| License expiry cron        | `DONE`               | 90/30-day notifications, expiration, and seven-day deduplication implemented.                        |
| RNG4 fee cron              | `DONE`               | Uses the required `MOCK_OVERDUE` rule; never sets RNG4 to EXPIRED.                                   |
| Session cleanup cron       | `DONE`               | Hourly cleanup implemented.                                                                          |
| Nuxt 4 admin portal        | `MISSING`            | No `admin/` directory exists.                                                                        |
| Full checklist tests       | `MISSING`            | Runtime and integration coverage is incomplete.                                                      |

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

| Guide Item                                        | Status    | Required Follow-up                                                            |
| ------------------------------------------------- | --------- | ----------------------------------------------------------------------------- |
| bcrypt cost >= 12                                 | `DONE`    | Add an assertion against seeded/user-created hashes.                          |
| RS256, 15-minute JWT, JTI revocation              | `PARTIAL` | Implementation exists; run DB-backed e2e tests to verify.                     |
| Refresh rotation and replay detection             | `PARTIAL` | `test/security.e2e-spec.ts` written; requires DB to run fully.                |
| ADMIN blocked from Tang Rat and wrong client type | `PARTIAL` | Unit test covers client type; `test/security.e2e-spec.ts` covers Tang Rat.    |
| Cross-zone/cross-agency scope tests               | `PARTIAL` | `test/security.e2e-spec.ts` covers both; requires DB seed to run fully.       |
| Conflict-of-interest test                         | `PARTIAL` | `test/security.e2e-spec.ts` covers it; requires DB seed to run fully.         |
| Upload security and private MinIO                 | `PARTIAL` | App checks done; `StorageService.onModuleInit` now provisions private bucket. |
| Helmet and CORS allowlist                         | `DONE`    | Present in `src/main.ts`; runtime header test missing.                        |
| Strict global ValidationPipe                      | `DONE`    | Present in `src/main.ts`.                                                     |
| No unsafe raw Prisma                              | `DONE`    | No `$queryRawUnsafe` usage found.                                             |
| Nginx and Nest throttling                         | `PARTIAL` | Nginx zones and selected decorators exist; forgot-password semantics differ.  |
| Audit redaction                                   | `DONE`    | `audit.interceptor.ts` now uses `switchMap`+`await`; redaction preserved.     |
| Global soft-delete middleware                     | `DONE`    | Explicit `deletedAt: null` comprehensively applied on all soft-delete models. |
| AllExceptionsFilter                               | `DONE`    | `src/common/filters/all-exceptions.filter.ts` wired in `main.ts`.             |
| D3 ADMIN namespace                                | `DONE`    | `ClientTypeGuard` enforces `web_admin`; documented DECISION comment.          |
| Concurrency-safe task numbers                     | `DONE`    | `InspectionService.createTask` moves sequence inside tx + retries on P2002.   |

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
