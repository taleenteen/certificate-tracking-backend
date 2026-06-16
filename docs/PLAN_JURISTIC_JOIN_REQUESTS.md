# Plan — D7: Self-Service Juristic Join Requests (Tang Rat, no DBD)

> **Status:** APPROVED — implementation in progress (2026-06-16).
> **Builds on:** D6 (`docs/PLAN_JURISTIC_MULTITENANT.md`, already implemented).
> **Read first:** `AGENTS.md`, `docs/CODING_STANDARDS.md`, `src/modules/juristic/*`.
> **On approval:** copy to repo as `docs/PLAN_JURISTIC_JOIN_REQUESTS.md` first.

---

## Context — why this change

A Tang Rat user logs in as a normal `public` user with a **verified citizen ID**,
but has no way to *self-onboard* into a company. Today D6 only adds members via
owner-initiated invite/direct-add, or a DBD `claim` endpoint. **DBD is not
available in production** — Tang Rat proves *who you are*, but nothing proves *you
belong to company X*. So the relationship needs a **human approval** step.

This adds a **join-request workflow**: a user finds a company, requests to join
(with a justification note), and a human approves. Approval routing is **hybrid**
(owner decision, confirmed):

- Company **already has an active OWNER** → request goes to that company's
  **OWNER/ADMIN** queue (peer vouching). Approver picks the granted role
  (MEMBER/ADMIN).
- Company has **no active OWNER** → it's a **first-owner claim**, routed to
  **platform staff** (`admin`/`super_admin`) who vet & approve → requester
  becomes `OWNER`.

Scope (confirmed): **join existing companies only** (no user-created companies;
`JuristicPerson` rows are seeded now / gov-synced later); **text justification
only** for v1 (no document upload yet).

---

## THE DECISION — D7 (settled)

1. New `JuristicJoinRequest` model with a `JoinRequestStatus` lifecycle.
2. **Hybrid routing** keyed on `isFirstOwnerClaim` = *(company has 0 active OWNERs
   at request time)*. Peer requests → company OWNER/ADMIN. First-owner claims →
   platform staff.
3. **Identity gate:** only users with a verified `citizenId` may request (reuse
   the gate from `JuristicService.claimCompany`).
4. **Approver sets the final role** at approval; `requestedRole` is advisory. Peer
   approvers cannot grant `OWNER` (only the staff first-owner path, or an existing
   OWNER promoting later). ADMIN approvers grant up to ADMIN.
5. **No duplicate pending** per (company, user); enforced in-service **and** via a
   partial unique index. **Rate-limited** (mirror forgot-password 3/hr + a cap on
   total pending).
6. Requests **expire** (30 days) — swept lazily on queue reads (like invite expiry).
7. Every action audited with `juristicId` + actor `userId`.
8. The DBD `claim` endpoint stays but is documented as **optional/future** (works
   only if DBD becomes available); the staff first-owner path is the primary
   bootstrap.

---

## 1. Schema (one migration: `juristic_join_requests`)

`prisma/schema.prisma` — add enum + model, plus back-relations.

```prisma
enum JoinRequestStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED   // withdrawn by requester
  EXPIRED
}

model JuristicJoinRequest {
  id                String            @id @default(uuid()) @db.Uuid
  juristicPersonId  String            @map("juristic_person_id") @db.Uuid
  userId            String            @map("user_id") @db.Uuid           // requester
  isFirstOwnerClaim Boolean           @default(false) @map("is_first_owner_claim")
  requestedRole     JuristicRole      @default(MEMBER) @map("requested_role")  // advisory
  requestedPosition String?           @map("requested_position") @db.VarChar(100)
  message           String?           @db.Text                            // justification
  status            JoinRequestStatus @default(PENDING)
  grantedRole       JuristicRole?     @map("granted_role")                // set at approval
  reviewedById      String?           @map("reviewed_by_id") @db.Uuid
  reviewedAt        DateTime?         @map("reviewed_at") @db.Timestamptz()
  reviewNote        String?           @map("review_note") @db.Text
  expiresAt         DateTime          @map("expires_at") @db.Timestamptz()
  createdAt         DateTime          @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt         DateTime          @updatedAt @map("updated_at") @db.Timestamptz()

  juristicPerson JuristicPerson @relation(fields: [juristicPersonId], references: [id], onDelete: Cascade)
  user           SystemUser     @relation("JoinRequester", fields: [userId], references: [id], onDelete: Cascade)
  reviewedBy     SystemUser?    @relation("JoinReviewer", fields: [reviewedById], references: [id])

  @@index([juristicPersonId, status])
  @@index([userId, status])
  @@index([status, isFirstOwnerClaim])   // platform-staff queue
  @@map("juristic_join_requests")
}
```

- `JuristicPerson` += `joinRequests JuristicJoinRequest[]`.
- `SystemUser` += `juristicJoinRequests JuristicJoinRequest[] @relation("JoinRequester")`
  and `juristicJoinReviews JuristicJoinRequest[] @relation("JoinReviewer")`.
- **Partial unique index** (Prisma can't declare it): after `prisma migrate dev`,
  append to the generated migration SQL —
  `CREATE UNIQUE INDEX "uniq_pending_join" ON "juristic_join_requests" ("juristic_person_id","user_id") WHERE status = 'PENDING';`
  Editing the generated migration file is standard Prisma workflow.

Run `npx prisma migrate dev --name juristic_join_requests` then `prisma generate`.

---

## 2. Service layer — extend `src/modules/juristic/juristic.service.ts`

Reuse: the **citizenId gate** and `assertNotLastOwner` patterns already in this
file; the `JuristicRole` rank logic from `require-juristic-role.guard.ts`
(OWNER 2 ≥ ADMIN 1 ≥ MEMBER 0); `isValidThaiCitizenId`/`normalizeCitizenId`.

**Requester side**
- `searchCompanies(q)` — find by `nameTh` contains **or** `registrationId` exact;
  return minimal `{ id, nameTh, nameEn, registrationId, hasActiveOwner }`. No
  membership required (unlike `getCompany`). Paginate; never expose member lists.
- `requestToJoin(userId, dto)` — gates in order: verified `citizenId` (else 422);
  company exists (else 404); not already an active member (else 409); no existing
  PENDING for (company,user) (else 409 — also caught via P2002 on the partial
  index); rate limit (≤3 created/hour, ≤5 total pending). Compute
  `isFirstOwnerClaim = (active OWNER count === 0)`. Coerce role: first-owner →
  OWNER intent; peer → cap requestedRole at ADMIN. Set `expiresAt = +30d`. Audit
  `JOIN_REQUEST_CREATE`. Notify approvers (peer: active OWNER/ADMIN of the company
  via inline `prisma.notification.create`; first-owner: skip mass-notify, rely on
  staff queue).
- `getMyRequests(userId)` — requester's own requests + status + company name.
- `cancelRequest(userId, id)` — own + PENDING only → CANCELLED. Audit.

**Peer approver side** (company OWNER/ADMIN, in juristic context)
- `getPendingRequests(juristicId)` — PENDING + `isFirstOwnerClaim=false` for the
  active company; lazy-sweep expired → EXPIRED. Include requester `fullName` +
  `citizenIdLast4` + message.
- `approveRequest(ctx, id, {role?, position?})` — `$transaction`: status guard
  (PENDING only, else 409/410) → set APPROVED + reviewedBy/At + grantedRole →
  create `JuristicMember` (P2002 → already member → mark APPROVED idempotently).
  Role-escalation guard: ADMIN cannot grant OWNER (403). Audit. Notify requester.
- `rejectRequest(ctx, id, {note?})` — PENDING → REJECTED + reviewNote. Audit. Notify.

**Platform-staff side** (`@Roles('admin')`, NOT juristic context)
- `getFirstOwnerClaims()` — all PENDING `isFirstOwnerClaim=true` across companies;
  lazy-sweep expired. Include requester identity + company + message for vetting.
- `approveFirstOwnerClaim(staffUserId, id, {position?})` — re-check company STILL
  has 0 active OWNERs (race → 409 "company already has an owner"); `$transaction`:
  APPROVED + create `JuristicMember(OWNER)` + reviewedBy. Audit. Notify requester.
- `rejectFirstOwnerClaim(staffUserId, id, {note?})` — PENDING → REJECTED. Audit. Notify.

State machine: every transition asserts current `status === PENDING`; terminal
states are immutable. Wrap member-creating approvals in `$transaction`.

---

## 3. API surface

Route-collision note: `JuristicController` already owns `juristic/:id` — a new
static `juristic/<word>` route would be captured by `:id`. So:

**A. New controller `JuristicJoinRequestController` @ `juristic-requests`**
(distinct top segment, no collision). Declare static routes before dynamic `:id`.

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/juristic-requests/companies?q=` | authed | Search companies to join |
| POST | `/api/juristic-requests` | authed + verified citizenId | Submit join request |
| GET | `/api/juristic-requests/mine` | requester | My requests + status |
| GET | `/api/juristic-requests/admin/first-owner-claims` | `@Roles('admin')` | Staff queue |
| POST | `/api/juristic-requests/admin/:reqId/approve` | `@Roles('admin')` | Approve first-owner → OWNER |
| POST | `/api/juristic-requests/admin/:reqId/reject` | `@Roles('admin')` | Reject first-owner |
| DELETE | `/api/juristic-requests/:id` | requester | Cancel own pending |

**B. Peer approval — add to existing `JuristicController`** (under `:id`, mirrors
`:id/members`, guarded by `JuristicContextGuard` + `@RequireJuristicRole('ADMIN')`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/juristic/:id/join-requests` | Pending peer requests for active company |
| POST | `/api/juristic/:id/join-requests/:reqId/approve` | Approve → MEMBER/ADMIN |
| POST | `/api/juristic/:id/join-requests/:reqId/reject` | Reject |

DTOs in `juristic.dto.ts`: `SearchCompaniesQuery`, `CreateJoinRequestDto`
({ juristicId, requestedRole?, position?, message? }), `ReviewJoinRequestDto`
({ role?, position?, note? }). Reuse `JuristicSuccessDto`. Annotate per
CODING_STANDARDS §10b. Rate-limit `POST /juristic-requests` with `@Throttle`.

---

## 4. Authorization matrix

| Action | Guard |
|---|---|
| search / my-requests / cancel | default `JwtAuthGuard` + ownership check |
| submit request | `JwtAuthGuard` + service citizenId gate |
| peer queue / approve / reject | `JuristicContextGuard` + `@RequireJuristicRole('ADMIN')` + `:id` match |
| first-owner queue / approve / reject | `@Roles('admin')` (platform tier) |

Platform staff act with **platform authority** (RolesGuard), juristic peers act
with **juristic context** — same separation as the rest of D6.

---

## 5. Notifications & audit

- Inline `prisma.notification.create` (NotificationService has no create helper;
  matches the seed pattern). Types: `JURISTIC_JOIN_REQUEST` (to peer approvers),
  `JURISTIC_JOIN_APPROVED` / `JURISTIC_JOIN_REJECTED` (to requester).
- Audit actions: `JOIN_REQUEST_CREATE/APPROVE/REJECT/CANCEL`, all with
  `juristicId` + `userId`. The interceptor already stamps `juristicId` from
  context for peer routes; staff approvals set it explicitly in the audit row
  (no juristic context there). D5 `citizenId` redaction stays.

---

## 6. Seed (`prisma/seed.ts`)

- Add an **ownerless** company (e.g. keep `juristicPersons[2]` with **no**
  `JuristicMember`) to demo the first-owner claim flow.
- Add a **second public user** with a verified `citizenId` and **no** membership
  to act as the requester.

---

## 7. Phased implementation (one concern per commit; verify each)

1. **Schema + partial index + seed** + `prisma generate`.
2. **Requester flow**: search, submit (all gates), my-requests, cancel +
   `JuristicJoinRequestController`. Unit: gates (no citizenId→422, dup→409,
   rate-limit, already-member→409).
3. **Peer approval**: queue + approve/reject on `JuristicController`; role
   escalation guard; transactional membership. Unit: ADMIN can't grant OWNER;
   approve→member; reject.
4. **First-owner staff flow**: staff queue + approve/reject; race re-check.
   Unit: ownerless→staff queue; approve→OWNER; race→409.
5. **Expiry sweep** (lazy on queue reads) + notifications.
6. **Swagger + docs + memory**: annotate, `npm run swagger:export`; update
   `AGENTS.md` (add D7), `docs/IMPLEMENTATION_STATUS_AI.md`, `juristic-model` memory.

---

## 8. Verification (definition of done)

- `npm run lint && npm run build && npm test` green; migration applies on a fresh
  reset+seed.
- **Live walkthrough** (`./dev.sh`):
  1. Tang Rat login as the new no-membership user (has verified citizenId).
  2. `GET /juristic-requests/companies?q=ตัวอย่าง` → find companies.
  3. **Peer:** request to join a company that has the seeded owner → owner logs
     in, `POST /auth/context` into that company, `GET /juristic/:id/join-requests`
     shows it → approve as MEMBER → requester `GET /juristic` shows new membership
     → can `POST /auth/context` into it.
  4. **First-owner:** request to join the ownerless company → `isFirstOwnerClaim`
     true → admin `GET /juristic-requests/admin/first-owner-claims` shows it →
     approve → requester becomes OWNER.
  5. Duplicate pending → 409; cancel → CANCELLED; rate-limit → blocked; approve a
     non-PENDING → 410/409; first-owner race (owner appears meanwhile) → 409.
  6. Audit rows for create/approve carry `juristic_id` + `user_id` (psql).
- Regenerate `openapi.json`; new paths present.

---

## 9. Edge cases (handle each)

1. Requester without verified citizenId → 422.
2. Already an active member → 409.
3. Duplicate pending → 409 (service + partial unique index).
4. Rate limit exceeded → blocked (Throttle/service).
5. Company not found → 404.
6. First-owner approval after an owner appeared → 409.
7. Approve/reject/cancel a non-PENDING request → 410/409.
8. ADMIN approver attempts to grant OWNER → 403.
9. Expired request surfaced → swept to EXPIRED, not actionable.
10. Suspended/soft-deleted requester or company → blocked.
11. Peer queue shows only that company's non-first-owner pending; staff queue only
    first-owner pending.
12. Concurrent approvals of one request → status guard + transaction → second 409.
13. `requestedRole=OWNER` on peer path → coerced/blocked; OWNER only via
    first-owner (staff) or later promotion by an existing OWNER.
14. Approval P2002 (already a member) → mark APPROVED idempotently.

---

## 10. Files to touch

- `prisma/schema.prisma`, `prisma/seed.ts`, new migration (+ raw partial index)
- `src/modules/juristic/juristic.service.ts` (extend), `juristic.dto.ts` (new DTOs)
- `src/modules/juristic/juristic.controller.ts` (peer approval routes)
- `src/modules/juristic/juristic-join-request.controller.ts` (**new**: requester + staff)
- `src/modules/juristic/juristic.module.ts` (register new controller)
- Docs: `AGENTS.md`, `docs/IMPLEMENTATION_STATUS_AI.md`, copy plan →
  `docs/PLAN_JURISTIC_JOIN_REQUESTS.md`, memory `juristic-model.md`

## 11. Non-goals

- No user-created companies (join existing only).
- No document upload (text justification only) — future enhancement.
- No removal of the DBD `claim` endpoint (kept as optional/future).
- No platform-role or D5/D6 changes; no frontend work.
- No cross-org admin console beyond the first-owner queue.
