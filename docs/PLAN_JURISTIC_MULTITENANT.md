# Plan — Juristic Persons as a Multi-Tenant Corporate Portal (D6)

> **Status:** PLAN ONLY. No code changes until the owner approves.
> **Audience:** any AI agent (Sonnet, Gemini, Grok, Codex) implementing this.
> **Read first:** `AGENTS.md`, `docs/CODING_STANDARDS.md`, `docs/AUTHENTICATION.md`,
> `docs/PLAN_PROFILE_IDENTITY_BINDING.md` (D5).
> **On approval:** copy this file into the repo as `docs/PLAN_JURISTIC_MULTITENANT.md`
> as the first implementation step, then proceed phase by phase.

---

## Context — why this change

Today a `SystemUser` links to at most one `JuristicPerson` via a single,
**currently-unused** FK `SystemUser.juristicPersonId`. Corporate license lookup
(`GET /api/my/licenses?mode=juristic`, `my.service.getLicensesJuristic`) goes
through a DBD mock by Tang Rat `citizenSub`, not through any persisted
membership. There is no concept of a person belonging to several companies, no
per-company roles, no way for a company admin to add staff, and audit logs
capture only `userId` — not the organization an action was taken on behalf of.

The owner wants Juristic Persons to behave like a **multi-tenant corporate
portal**: one human can belong to many companies (e.g. an accountant), switch
their session into a specific company context, see strictly that company's data,
manage that company's members, and have every corporate action audited with both
the **organization** and the **human actor**. This plan delivers that and
integrates with the prior D5 decisions (plaintext citizen ID / tax ID, Tang Rat
primary).

---

## THE DECISION — D6 (best practice, settled)

> 1. **Membership is many-to-many** via a junction model `JuristicMember`
>    (replaces the single `SystemUser.juristicPersonId` FK).
> 2. **Two orthogonal role dimensions.** Platform roles
>    (`public<inspector<supervisor<admin<super_admin`, D1/D5) govern the
>    platform. **Juristic roles** (`OWNER/ADMIN/MEMBER` + free-text `position`)
>    govern *only* resources inside one company. They never grant platform
>    privileges and vice-versa. Juristic mode is a feature of **public-tier**
>    users (business owners/representatives); staff (inspector+) do not use it.
> 3. **Active context is hybrid-stored:** the source of truth is
>    `UserSession.activeJuristicId`; it is **mirrored into the access-token
>    claims** for stateless per-request reads. A guard does a **live membership
>    check** every request, so revoking a member takes effect immediately even
>    with an unexpired token.
> 4. **Default context is user mode** (`activeJuristicId = null`). Switching is
>    explicit via `POST /api/auth/context`.
> 5. **Strict data isolation:** in user mode, endpoints return personal data; in
>    juristic mode, they return *that* company's data only.
> 6. **Every mutation in juristic mode is audited with BOTH `juristicId` and
>    `userId`** (the human who acted).
> 7. **Members are added two ways:** email invite (single-use token) and
>    direct-add by verified citizen ID. A citizen who is a **registered
>    director** (verified via DBD/Tang Rat) can **claim** a company → becomes
>    `OWNER`.
> 8. **Plaintext IDs (D5 continued):** `citizenId` and `JuristicPerson.registrationId`
>    (tax ID) stay indexable plaintext, protected by DB TDE + service-layer RBAC
>    + audit. No hashing.

This overrides Golden Rule #2 (no schema changes) for this feature — the owner
has authorized the schema work below, consistent with the D5 precedent.

---

## 1. Schema changes (one migration: `npx prisma migrate dev --name juristic_multitenant`)

Keep `@map`/snake_case + `@db` types consistent with neighbours. Make exactly
these changes.

### 1.1 New enum
```prisma
enum JuristicRole {
  OWNER   // full control: members, corporate licenses, claim/transfer, delete
  ADMIN   // manage members + corporate data; cannot delete org or remove owners
  MEMBER  // view + act within granted scope
}
```

### 1.2 New model `JuristicMember` (the junction)
```prisma
model JuristicMember {
  id               String       @id @default(uuid()) @db.Uuid
  juristicPersonId String       @map("juristic_person_id") @db.Uuid
  userId           String       @map("user_id") @db.Uuid
  role             JuristicRole @default(MEMBER)
  position         String?      @db.VarChar(100)  // free-text HR title, e.g. "Compliance Officer"
  isActive         Boolean      @default(true) @map("is_active")
  invitedById      String?      @map("invited_by_id") @db.Uuid
  joinedAt         DateTime     @default(now()) @map("joined_at") @db.Timestamptz()
  createdAt        DateTime     @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt        DateTime     @updatedAt @map("updated_at") @db.Timestamptz()

  juristicPerson JuristicPerson @relation(fields: [juristicPersonId], references: [id], onDelete: Cascade)
  user           SystemUser     @relation("JuristicMembership", fields: [userId], references: [id], onDelete: Cascade)
  invitedBy      SystemUser?    @relation("JuristicInviter", fields: [invitedById], references: [id])

  @@unique([juristicPersonId, userId])
  @@index([userId])
  @@index([juristicPersonId])
  @@map("juristic_members")
}
```

### 1.3 New model `JuristicInvite`
```prisma
model JuristicInvite {
  id               String       @id @default(uuid()) @db.Uuid
  juristicPersonId String       @map("juristic_person_id") @db.Uuid
  email            String       @db.VarChar(150)
  role             JuristicRole @default(MEMBER)
  position         String?      @db.VarChar(100)
  tokenHash        String       @unique @map("token_hash") @db.VarChar(255)  // sha256, like PasswordResetToken
  invitedById      String       @map("invited_by_id") @db.Uuid
  status           String       @default("pending") @db.VarChar(20)  // pending|accepted|revoked|expired
  expiresAt        DateTime     @map("expires_at") @db.Timestamptz()
  acceptedAt       DateTime?    @map("accepted_at") @db.Timestamptz()
  acceptedByUserId String?      @map("accepted_by_user_id") @db.Uuid
  createdAt        DateTime     @default(now()) @map("created_at") @db.Timestamptz()

  juristicPerson JuristicPerson @relation(fields: [juristicPersonId], references: [id], onDelete: Cascade)
  invitedBy      SystemUser     @relation("JuristicInviteCreator", fields: [invitedById], references: [id])

  @@index([juristicPersonId])
  @@index([email])
  @@map("juristic_invites")
}
```

### 1.4 `JuristicPerson` — add relations
```prisma
  members JuristicMember[]
  invites JuristicInvite[]
```

### 1.5 `SystemUser` — add relations, deprecate the single FK
- Add: `juristicMemberships JuristicMember[] @relation("JuristicMembership")`,
  `juristicInvitesSent JuristicMember[] @relation("JuristicInviter")`,
  `juristicInvitesCreated JuristicInvite[] @relation("JuristicInviteCreator")`.
- **Remove** `juristicPersonId` + the `juristicPerson` relation. It is unused in
  code (verified: `getLicensesJuristic` uses DBD lookup, not this FK). Migrate
  any seeded values into `JuristicMember` rows in the same migration.

### 1.6 `UserSession` — persist active context
```prisma
  activeJuristicId String? @map("active_juristic_id") @db.Uuid
```

### 1.7 `AuditLog` — capture organization context
```prisma
  juristicId String? @map("juristic_id") @db.Uuid
  @@index([juristicId, createdAt])
```

### 1.8 Seed (`prisma/seed.ts`)
- Give `mock-public-owner` an `OWNER` `JuristicMember` on an existing juristic
  person; add a second person + a second membership so context-switching is
  demonstrable with one user in two companies.

---

## 2. Context switching — auth + guards

### 2.1 JWT claims (`src/common/auth.types.ts`)
Add (only populated in juristic mode):
```ts
activeJuristicId?: string;
juristicRole?: 'OWNER' | 'ADMIN' | 'MEMBER';
```
Do **not** put tax IDs or member lists in the JWT.

### 2.2 Switch endpoint — `POST /api/auth/context`
Body `{ juristicId: string | null }`. In `AuthService`:
- `null` → clear context: set `session.activeJuristicId = null`, re-mint access
  token without juristic claims.
- non-null → verify an **active** `JuristicMember(userId, juristicId)`; on
  success set `session.activeJuristicId`, load `juristicRole`, **re-mint the
  access token** with the new claims, and **update the session's
  `accessTokenJti`** to the new jti (so the old access token stops validating).
  Reuse the existing session + refresh token (no full re-login).
- Audit `CONTEXT_SWITCH` with `juristicId`.
- Reuse `claimsFor`/signing logic from `auth.service.ts` (`createSession`); add a
  smaller `reissueAccessToken(session, claims)` helper rather than duplicating.

### 2.3 Refresh preserves context (`AuthService.refresh`)
When rotating, read `session.activeJuristicId`; if set and still a valid active
membership, carry the juristic claims into the new access token; if membership
was revoked, silently drop to user mode.

### 2.4 `JuristicContextGuard` (new, global) + `@JuristicContext()` decorator
- Pattern after `src/common/guards/scope.guard.ts` (which sets `request.scope`).
- Reads `activeJuristicId` from claims. If present, **live-checks** an active
  `JuristicMember`; on miss → `ForbiddenException` (revoked/stale token). On hit,
  set `request.juristicContext = { juristicId, role, userId }`. If absent, set
  `request.juristicContext = null` (user mode).
- Register globally alongside the existing guards (see `app.module.ts` /
  wherever `ScopeGuard` is wired).
- Add `@JuristicContext()` param decorator (mirror `current-user.decorator.ts`)
  exposing `request.juristicContext`.
- Add `@RequireJuristicRole('ADMIN')` + a small guard for member-management
  routes (OWNER ≥ ADMIN ≥ MEMBER rank check, like `satisfiesRole`).
- Extend the Express type augmentation (`src/types/express.d.ts`) with
  `juristicContext?: JuristicContext | null`.

---

## 3. Data isolation

Refactor `src/modules/my/my.service.ts` (and any future corporate reads) to
branch on `request.juristicContext`:

| Endpoint | User mode | Juristic mode |
|---|---|---|
| `GET /api/my/profile` | personal profile (D5) | company profile (name, tax ID **masked/last-segment only**, my role, member count) |
| `GET /api/my/licenses` | `business.ownerUserId = user.sub` | `business.juristicPersonId = activeJuristicId` |

- Controllers pass `@JuristicContext()` into the service; service picks the
  `where` filter. Keep `satisfies Prisma.<Model>WhereInput` per CODING_STANDARDS §4.
- Add `GET /api/juristic` → list the caller's active memberships
  `{ juristicId, nameTh, role, position }` to power the context-switcher UI.

---

## 4. Membership & invite APIs — new module `src/modules/juristic/`

Files: `juristic.module.ts`, `juristic.controller.ts`, `juristic.service.ts`,
`juristic.dto.ts` (follow the existing module shape, e.g. `user`/`zone`).
All routes `@ApiTags('Juristic')` + `@ApiBearerAuth('access-token')`, annotated
per CODING_STANDARDS §10b. Thin controllers; logic + Prisma in the service.

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/juristic` | any member | My memberships (switcher) |
| GET | `/api/juristic/:id` | member | Company detail |
| POST | `/api/juristic/claim` | public | Claim by `registrationId` via DBD director check → OWNER |
| GET | `/api/juristic/:id/members` | ADMIN+ | List members |
| POST | `/api/juristic/:id/members` | ADMIN+ | Direct-add by `citizenId` (target must be a verified existing user) |
| PATCH | `/api/juristic/:id/members/:userId` | ADMIN+ | Change `role`/`position` |
| DELETE | `/api/juristic/:id/members/:userId` | ADMIN+ | Remove member |
| POST | `/api/juristic/:id/invites` | ADMIN+ | Email invite `{ email, role, position }` (single-use token; MOCK: console, like forgot-password) |
| GET | `/api/juristic/:id/invites` | ADMIN+ | List pending invites |
| DELETE | `/api/juristic/:id/invites/:inviteId` | ADMIN+ | Revoke invite |
| POST | `/api/juristic/invites/:token/accept` | authed user | Accept → creates `JuristicMember` |

Service rules:
- Direct-add: look up target by **plaintext `citizenId`** (D5); require existing,
  active, verified, non-deleted user; `@@unique` prevents dupes (catch `P2002` →
  409). Reuse the citizen-ID validation helper from D5.
- Invites: hash the token like `PasswordResetToken` (sha256 via the existing
  `hash()` pattern in `auth.service.ts`); 7-day expiry; single-use
  (pending→accepted). Acceptance binds membership to the **authenticated
  accepter** (token is the secret; email is informational).
- **Last-owner protection:** cannot remove or demote the only `OWNER` → `422`.
- All mutations audited with `juristicId` + actor `userId`.

---

## 5. Corporate audit logging

`src/common/interceptors/audit.interceptor.ts`: read
`request.juristicContext?.juristicId` and write it to `auditLog.juristicId`
alongside the existing `userId`. The interceptor already runs on every
mutating request — this is a one-field addition. Verify both fields populate for
a mutation performed in juristic mode. (D5 redaction of `citizenId` stays.)

---

## 6. DBD director verification (claim / auto-access)

Extend `src/modules/external/dbd.provider.ts`:
```ts
isDirector(citizenId: string, registrationId: string): Promise<boolean>;
// or getDirectors(registrationId): Promise<string[]>  // citizen IDs
```
- Mock: return true for the seeded owner/company pair; `// MOCK: replace in UAT`.
- `POST /api/juristic/claim`: take `registrationId`, look up the
  `JuristicPerson`, verify the caller's plaintext `citizenId` is a director via
  DBD; on success create an `OWNER` `JuristicMember` (idempotent — 409 if already
  a member). Keep the existing `lookup(citizenSub)` path working for
  `getLicensesJuristic` or refactor it to share the new method.

---

## 7. Phased implementation (one concern per commit; verify each)

1. **Schema + migration + seed** (§1) + `prisma generate`. Migrate seed users
   into `JuristicMember`; drop `SystemUser.juristicPersonId`.
2. **Context switching** (§2): claims, `POST /auth/context`, refresh carry-over,
   `JuristicContextGuard` + decorators + Express type. Unit-test: switch sets
   claims; switching to a non-member org → 403; revoked membership → guard 403.
3. **Data isolation** (§3): refactor `my.service` reads; add `GET /api/juristic`.
   Unit + live: same user, two companies, licenses differ per context.
4. **Membership & invites** (§4): juristic module + `@RequireJuristicRole`.
   Tests: direct-add, invite→accept, last-owner protection, dup→409.
5. **Corporate audit** (§5): interceptor stamps `juristicId`; assert both
   `juristicId` + `userId` recorded.
6. **DBD director claim** (§6): provider + claim endpoint + seed directors.
7. **Swagger + docs + memory**: annotate new endpoints, `npm run swagger:export`;
   update `AGENTS.md` (add **D6**, deprecate the single-FK note),
   `docs/AUTHENTICATION.md` (context-switch section),
   `docs/IMPLEMENTATION_STATUS_AI.md` change log, and memory
   (`role-model`/new `juristic-model` note).

---

## 8. Verification (definition of done)

- `npm run lint && npm run build && npx jest` green; `npm run test:e2e` green on a
  freshly seeded DB.
- **Live walkthrough** (API up via `./dev.sh`, token from Tang Rat mock owner):
  1. `GET /api/juristic` lists two memberships.
  2. `POST /api/auth/context {juristicId:A}` → new token; `GET /api/my/licenses`
     returns A's licenses only. Switch to B → returns B's only. Switch to `null`
     → personal only.
  3. Switch to a company you don't belong to → `403`.
  4. Invite by email (token printed to console) → accept as another user →
     appears in `GET /:id/members`. Direct-add by citizen ID → appears.
  5. Try to remove the last `OWNER` → `422`.
  6. Perform a mutation in juristic mode → audit row has **both** `juristic_id`
     and `user_id` (verify via psql).
  7. Revoke a member, reuse their still-valid token with that `activeJuristicId`
     → `403` (live membership check).
- Regenerate `openapi.json`; confirm new paths present.

---

## 9. Edge cases (handle each)

1. Switch to non-member / inactive-member org → `403`.
2. Token carries `activeJuristicId` but membership later revoked → guard live
   check → `403`.
3. Last `OWNER` removal/demotion → `422`.
4. Direct-add citizen ID with no verified user → `404`/`422` (never auto-create).
5. Duplicate membership / duplicate accept → `@@unique` + `P2002` → `409`/idempotent.
6. Invite expired / already used / revoked → `404`/`410`.
7. Accept while unauthenticated → `401`; accepter ≠ invited email → allowed
   (token is the secret); record `acceptedByUserId`.
8. Suspended/soft-deleted user or company → block link/switch.
9. Platform admin/super_admin: orthogonal — they do not auto-gain juristic roles;
   cross-org admin oversight is out of scope (future).
10. Refresh after switch → context preserved from session row; if revoked,
    silently drop to user mode.
11. Concurrent switches on the same session → last write wins; jti rotation makes
    the prior access token invalid.
12. Juristic mode must never widen platform scope (no zone/agency change); staff
    never enter juristic mode.

---

## 10. Assumptions
- DBD provider can verify directorship (mock now; real DGA/DBD in UAT).
- `registrationId` (tax ID) + `citizenId` stay plaintext per D5 (TDE + RBAC).
- Juristic mode users are public-tier (owners/representatives), not staff.
- Email invites use the existing mock notification pattern (console), like
  `forgot-password`.
- Pre-production: dropping the unused `SystemUser.juristicPersonId` FK is safe;
  seed data is migrated in the same migration.

## 11. Trade-offs
| Choice | Alternative | Why chosen |
|---|---|---|
| Junction `JuristicMember` | Keep single FK | Many-to-many is the core requirement (accountant → many companies). |
| Hybrid context (session col + JWT mirror + live check) | Pure JWT / pure header | Survives refresh, stateless reads, instant revocation. Matches "token/session reflects context." |
| `OWNER/ADMIN/MEMBER` + free-text `position` | Full enumerated roles | Separates permission level from HR title; no migration to add titles. |
| Invite (token) + direct-add (citizen ID) | One only | Covers external newcomers and existing verified users ("add, invite, assign"). |
| Re-mint access token + rotate jti on switch | New full session | One session per device; clean audit; old access token dies immediately. |
| Audit `juristicId` + `userId` | `juristicId` only | Government compliance: trace the human actor behind a corporate action. |

## 12. Non-goals
- No platform-role changes (D1/D3/D5 intact); admin auth unchanged.
- No real DBD/Tang Rat integration (mocks stay; `// MOCK: replace in UAT`).
- No hashing of IDs (D5 plaintext stands).
- No cross-org admin console (future).
- No frontend work (`app/`, `admin/`).

---

## Critical files to touch
- `prisma/schema.prisma`, `prisma/seed.ts`, new migration
- `src/common/auth.types.ts`, `src/types/express.d.ts`
- `src/modules/auth/auth.service.ts`, `auth.controller.ts`, `auth.dto.ts`
- `src/common/guards/` (new `juristic-context.guard.ts`, `require-juristic-role.guard.ts`), `src/common/decorators/` (new `juristic-context.decorator.ts`, `require-juristic-role.decorator.ts`)
- `src/modules/my/my.service.ts`, `my.controller.ts`
- `src/modules/juristic/*` (new module)
- `src/modules/external/dbd.provider.ts`
- `src/common/interceptors/audit.interceptor.ts`
- `app.module.ts` (wire new global guard + module)
- Docs: `AGENTS.md`, `docs/AUTHENTICATION.md`, `docs/IMPLEMENTATION_STATUS_AI.md`, memory
