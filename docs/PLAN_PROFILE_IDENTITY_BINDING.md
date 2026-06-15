# Plan — User Profile & Two-Way Identity Binding (Citizen ID)

> **Status:** PLAN ONLY. Do not implement from this file without the owner's go.
> **Audience:** any AI agent (Sonnet, Gemini, Grok, Codex) implementing this.
> **Read first:** `AGENTS.md`, `docs/CODING_STANDARDS.md`, `docs/AUTHENTICATION.md`.
> **Author:** planning pass, 2026-06-15.

---

## 0. The problem in one paragraph

The app is reachable **two ways**: (1) inside a **WebView in the ทางรัฐ (Tang
Rat) super app**, where the user logs in with an **mToken** and Tang Rat returns
verified PII (name, email, phone, **national/citizen ID**); and (2) on a
**public domain** in a normal browser, where the user **self-registers** with
email + password (the flow in `docs/AUTHENTICATION.md`). The same real person
can end up with **two separate accounts** — e.g. they register on the domain
with `email=A`, then later open the WebView and Tang Rat reports `email=B` but
the **same citizen ID**. We need one coherent profile per person, bound safely
across both entry points, in both directions.

---

## 1. THE DECISION (best practice) — read this before anything else

> ### D5 — Citizen-ID-as-canonical-identity with proof-based linking
>
> 1. **The Tang-Rat-verified citizen ID is the single source of truth for "who
>    this person is."** One verified citizen ID maps to exactly one account.
> 2. **Citizen ID enters the system only through Tang Rat (verified).** Local
>    domain registration collects **email + password only** — it never
>    establishes a trusted citizen ID. (Optional hint in §9, still untrusted.)
> 3. **Linking two existing accounts ALWAYS requires proof of the other side**
>    — the local **password**, or a **fresh mToken**. The system **never**
>    auto-merges accounts on a matching citizen ID claim or matching email
>    alone.
> 4. **Binding is two-way:** a Tang-Rat-first user can add a password; a
>    domain-first user can add (link) their Tang Rat identity. Either way the
>    result is one `SystemUser` with multiple attached identities.

**Why this, and not auto-merge?** Thai national IDs are **low-secret** — they
appear on most forms, so "knows the citizen ID" must never be treated as proof
of ownership. If we auto-merged a verified Tang Rat login into any local account
that *claimed* that citizen ID, an attacker could pre-register locally with a
victim's national ID and silently capture the victim's verified profile on their
next WebView login (**account takeover**). Requiring a secret (password / live
mToken) from the *other* identity at link time closes this hole while still
giving a clean two-way binding UX. This mirrors how GitHub/Google handle
"link account" and is the defensible choice for government data.

---

## 2. Why the existing model already fits (minimal change)

The schema already separates **account** from **identity**:

```
SystemUser (the account; holds passwordHash, roles, agency, profile fields)
   1 ──── N
AuthProviderLink (one row per external identity)
   provider ∈ {self, tang_rat}, providerSub, providerEmail, providerName
   @@unique([provider, providerSub])
```

So an account can already carry several identities. Local credentials currently
live directly on `SystemUser.passwordHash`. **We do not need a new identity
table.** We need: (a) somewhere to store the *verified citizen ID*, (b) the
linking/merge logic, and (c) profile read/manage endpoints.

---

## 3. Schema changes (REQUIRED — this overrides Golden Rule #2 for this feature)

> Golden Rule #2 says "never add Prisma fields; leave `// TODO(schema)`." This
> feature is impossible without persistent citizen identity, so the **owner
> approves these specific additions via this plan.** Make exactly these changes
> in one migration (`npx prisma migrate dev --name identity_binding`) — no
> others. Keep `@map`/snake_case and `@db` types consistent with neighbours.

### 3.1 `SystemUser` — add citizen identity + profile provenance

```prisma
model SystemUser {
  // … existing fields …

  // Verified national/citizen identity. Present ONLY after Tang Rat verifies it.
  // Stored as an HMAC (see §5) — never the raw 13-digit ID. Unique so one
  // verified citizen ↔ one account.
  citizenIdHash       String?   @unique @map("citizen_id_hash") @db.VarChar(64)
  citizenIdVerifiedAt DateTime? @map("citizen_id_verified_at") @db.Timestamptz()
  // Last 4 digits, for display only ("เลขบัตร …1234"). Not sensitive on its own.
  citizenIdLast4      String?   @map("citizen_id_last4") @db.VarChar(4)

  // Which channel the profile was born from (analytics + UX defaults).
  primaryChannel      ProfileChannel @default(domain) @map("primary_channel")

  // … existing relations …
}
```

### 3.2 New enum `ProfileChannel`

```prisma
enum ProfileChannel {
  domain     // self-registered on the public website
  tang_rat   // first seen via the Tang Rat WebView
}
```

### 3.3 `AuthProviderLink` — record verification + raw phone/name provenance

```prisma
model AuthProviderLink {
  // … existing fields …
  providerPhone String?   @map("provider_phone") @db.VarChar(20)
  verifiedAt    DateTime? @map("verified_at") @db.Timestamptz() // set for tang_rat
}
```

### 3.4 New model `AccountLinkChallenge` (proof-based link/merge handshake)

```prisma
model AccountLinkChallenge {
  id            String   @id @default(uuid()) @db.Uuid
  // The account that initiated linking (the authenticated session's user).
  initiatorId   String   @map("initiator_id") @db.Uuid
  // The candidate account to absorb/merge (matched by citizenId or email).
  targetId      String?  @map("target_id") @db.Uuid
  method        String   @db.VarChar(20)   // 'password' | 'mtoken'
  status        String   @default("pending") @db.VarChar(20) // pending|confirmed|expired|failed
  attempts      Int      @default(0)
  expiresAt     DateTime @map("expires_at") @db.Timestamptz()
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz()
  confirmedAt   DateTime? @map("confirmed_at") @db.Timestamptz()

  initiator SystemUser @relation("LinkInitiator", fields: [initiatorId], references: [id], onDelete: Cascade)

  @@index([initiatorId])
  @@map("account_link_challenges")
}
```
Add the back-relation `linkChallenges AccountLinkChallenge[] @relation("LinkInitiator")` on `SystemUser`.

> If the implementer prefers to keep the merge synchronous (password supplied in
> the same request), `AccountLinkChallenge` can be **deferred** — see §7.4 for
> the simpler synchronous variant. Decide once; document which was built.

---

## 4. Extend the Tang Rat provider to return citizen ID

`src/modules/external/tangrat.provider.ts`:

```ts
export interface TangRatIdentity {
  sub: string;          // stable opaque per-citizen, per-app id (already used)
  fullName: string;
  email?: string;
  phone?: string;
  citizenId?: string;   // NEW: 13-digit Thai national ID (verified by Tang Rat)
}
```
- Add `citizenId` to each mock entry (use valid 13-digit test numbers that pass
  the Thai national-ID checksum — see §11.3). Keep `// MOCK: replace in UAT`.
- Treat `citizenId` as **optional** on the interface (real responses may omit
  it depending on consent scope); handle the null path everywhere.

---

## 5. Storing the citizen ID safely (best practice)

- **Never store the raw 13-digit ID** in a queryable column. Store:
  - `citizenIdHash` = `HMAC_SHA256(pepper, normalizedCitizenId)` (hex, 64 chars),
    unique, used for matching/lookup.
  - `citizenIdLast4` = last 4 digits, display only.
- The **pepper** is a server secret from env (`CITIZEN_ID_PEPPER`), never in git
  (add to `.env.example` with a placeholder). Rotating it invalidates matching,
  so document it as long-lived.
- Put the helper in `src/common/crypto/citizen-id.ts`:
  `hashCitizenId(raw: string): string`, `last4(raw: string): string`,
  `isValidThaiCitizenId(raw: string): boolean` (§11.3).
- **Audit-log redaction:** extend the interceptor's `sensitive` regex
  (`audit.interceptor.ts`) to also redact `citizenid`/`citizen_id`. Never log the
  raw ID anywhere (same rule as passwords/tokens).

---

## 6. JWT claims & channel awareness

`src/common/auth.types.ts` `JwtClaims` — add:
```ts
hasCitizenId?: boolean;   // convenience for the client UI (do NOT put the ID/hash in the JWT)
channel?: 'domain' | 'tang_rat'; // which entry point minted this session
```
- `channel` is derived at login: `tang-rat` route → `tang_rat`; `register`/`login`
  routes → `domain`. Persist it on `UserSession` only if useful (optional column;
  prefer NOT to add one unless needed — keep it in the JWT).
- **Do not** put the citizen ID or its hash in the JWT (PII minimisation).

---

## 7. The binding algorithms (precise — implement exactly)

Let `H(x)` = `hashCitizenId(x)`. "Account" = `SystemUser`.

### 7.1 Tang Rat login (`authService.tangRatLogin`) — extended

```
identity = tangRat.verify(mToken)        // {sub, fullName, email?, phone?, citizenId?}

link = find AuthProviderLink(provider=tang_rat, providerSub=identity.sub)

IF link exists:
    user = link.user
    IF identity.citizenId AND user.citizenIdHash IS NULL:
        # back-fill verification on a previously partial account
        set user.citizenIdHash=H(citizenId), citizenIdVerifiedAt=now, last4
    refresh link.verifiedAt/lastLoginAt, proceed to issue session (as today)
    RETURN session

# No tang_rat link yet for this sub.
IF identity.citizenId:
    owner = find SystemUser where citizenIdHash = H(identity.citizenId)
    IF owner exists:
        # Same verified citizen already has an account (e.g. linked earlier,
        # or a second WebView sub). Attach this sub to the canonical owner.
        create AuthProviderLink(tang_rat, sub) -> owner, verifiedAt=now
        log AUDIT 'IDENTITY_LINK_AUTO' (safe: citizen ID is verified by Tang Rat)
        RETURN session for owner

# No verified owner. Create a NEW canonical account from the verified identity.
user = create SystemUser {
    fullName: identity.fullName,
    email: identity.email, phone: identity.phone,
    roles: ['public'],
    primaryChannel: tang_rat,
    citizenIdHash: identity.citizenId ? H(...) : null,
    citizenIdVerifiedAt: identity.citizenId ? now : null,
    citizenIdLast4: identity.citizenId ? last4 : null,
}
create AuthProviderLink(tang_rat, sub) -> user, verifiedAt=now

# OPTIONAL convenience (does NOT merge): if a domain account exists with the
# same email, surface a non-blocking hint so the user can link it later.
candidate = find SystemUser(email=identity.email, passwordHash != null, id != user.id)
IF candidate: attach `linkSuggestion = { candidateMasked }` to the response
RETURN session (+ optional linkSuggestion)
```

**Key safety point:** when an **owner with the same verified citizen ID already
exists**, attaching the new Tang Rat sub is safe *because Tang Rat verified the
ID*. We never attach to an account whose citizen ID is merely *claimed/unverified*
— such a value never exists in `citizenIdHash` (only verified IDs go there).

### 7.2 Domain registration (`authService.register`) — extended

```
# unchanged: create public account with email+password, no citizen ID
# AFTER creation, OPTIONAL hint: if a verified account already has this email
# on its tang_rat link, return linkSuggestion so the user can link in-app.
```
Do **not** block registration on email collision with a Tang Rat account; the
two can be different people. Surface a hint only.

### 7.3 Link Tang Rat → current (domain-first user adds their gov identity)

Endpoint: `POST /api/my/identities/tang-rat` (auth required, the domain session).
```
input: { mToken }
identity = tangRat.verify(mToken)           # proves citizen ID (live, secret-ish)
IF a tang_rat link with identity.sub exists on ANOTHER user:
    -> this is a MERGE (see §7.5), gated by that proof; or 409 if policy = no-merge
ELSE IF identity.citizenId already verified on ANOTHER user:
    -> MERGE current into that owner OR reject (policy, §7.5)
ELSE:
    attach AuthProviderLink(tang_rat, sub) to current user
    set current.citizenIdHash=H(citizenId), verifiedAt=now, last4   # current becomes verified
    log AUDIT 'IDENTITY_LINK'
RETURN updated profile
```
This is **safe two-way binding**: the user proved the domain account (they are
logged in) and proved the citizen identity (live mToken). Works even when the
emails differ — exactly the scenario in §0.

### 7.4 Link password → current (Tang-Rat-first user adds local login)

Endpoint: `POST /api/my/credentials` (auth required, the Tang Rat session).
```
input: { username, password }
require current.passwordHash IS NULL (else use change-password)
require username unique
set current.username, current.passwordHash=bcrypt(password,12)
log AUDIT 'CREDENTIALS_ADDED'
```
Now the same account logs in either way. (Admin tier still excluded from
`/auth/login` per D3.)

### 7.5 Merge two existing accounts (collision resolution)

Triggered when linking discovers the other identity already lives on a
**different** account. Require proof of the other side (password or mToken),
then merge **non-canonical → canonical**:

- **Canonical pick:** the account holding the **verified citizen ID** wins. If
  neither/both, prefer the higher role rank, then the older account.
- **Field precedence (§8).** Move/repoint in ONE `$transaction`:
  `AuthProviderLink`, `Business(ownerId)`, `InspectionTask(assignedTo/createdBy)`,
  `InspectionReport(inspectorId/reviewerId)`, `AuditLog(userId)`,
  `Notification(userId)`, `PasswordResetToken`, `SyncLog`, `UserZone`
  (dedupe), `UserSession` (revoke all on the absorbed account).
- Soft-delete the absorbed account (`deletedAt=now`, `isActive=false`); never
  hard-delete (audit trail). Log `AUDIT 'ACCOUNT_MERGE'` with both ids.
- **Guards:** refuse merge if either account is suspended/deleted; refuse
  **cross-tier** merges (one is staff `inspector+`, the other `public`) — route
  those to an admin (`409` + clear message). Staff accounts are admin-provisioned
  and must not be silently absorbed by a public self-signup.

---

## 8. Profile model & field precedence

Add `ProfileService` + endpoints on the existing `My` controller
(`src/modules/my/`):

- `GET /api/my/profile` → unified profile:
  ```jsonc
  {
    "id": "uuid",
    "displayName": "สมชาย ใจดี",
    "email": "A@example.com",         // primary (see precedence)
    "phone": "0812345678",
    "roles": ["public"],
    "agency": null,
    "citizenIdVerified": true,
    "citizenIdLast4": "1234",         // never the full ID
    "primaryChannel": "domain",
    "identities": [
      { "provider": "self",     "username": "somchai.dev", "linkedAt": "…" },
      { "provider": "tang_rat", "verified": true, "email": "B@example.com", "linkedAt": "…", "lastLoginAt": "…" }
    ],
    "canAddPassword": false,
    "canLinkTangRat": false
  }
  ```
- `PATCH /api/my/profile` → user-editable fields only: `displayName`,
  `primaryEmail` (choose among known emails or set new), `phone`. Validate with
  a DTO; never let the client write `roles`, `agency`, `citizenId*`.

**Precedence rules (document in code comments):**
| Field | Source of truth | User-editable? |
|---|---|---|
| `citizenId*` | Tang Rat (verified) only | No |
| `displayName` | user override → else Tang Rat name → else local fullName | Yes |
| `email` (primary) | user's chosen primary; default = registration email | Yes |
| `phone` | user override → else Tang Rat phone | Yes |
| `roles`, `agency` | server/admin only | No |

---

## 9. Optional enhancement — unverified citizen-ID hint at registration

If the owner later wants smoother detection for the "different email" case:
collect an **optional** citizen ID at domain registration, store it as a
**non-unique** `claimedCitizenIdHash` (separate column, **no authority**). At
Tang Rat login, if the verified ID matches a `claimedCitizenIdHash` on another
account, raise a `linkSuggestion`. **Still never auto-merges** — the user must
complete the proof-based link (§7.3/§7.5). Mark this clearly optional; the core
plan works without it.

---

## 10. API surface (summary for the implementer)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/my/profile` | any | Unified profile + linked identities |
| PATCH | `/api/my/profile` | any | Edit display name / primary email / phone |
| POST | `/api/my/identities/tang-rat` | domain session | Link Tang Rat (mToken proof) |
| DELETE | `/api/my/identities/tang-rat` | any | Unlink Tang Rat (must keep ≥1 login) |
| POST | `/api/my/credentials` | tang_rat session | Add username/password to account |
| POST | `/api/my/account/merge` | any | Confirm a merge with the other side's proof |

All annotated per `CODING_STANDARDS.md` §10b; regenerate `openapi.json`
(`npm run swagger:export`).

---

## 11. Edge cases (handle every one)

1. **Domain-first, same email, then Tang Rat** → `linkSuggestion` on Tang Rat
   login; user confirms via §7.3 (mToken already proven) — link, don't duplicate.
2. **Domain-first, different email, same citizen ID** (the §0 case) → no auto
   signal; user links via §7.3 from profile settings. Works because mToken proves
   the citizen ID and the session proves the domain account.
3. **Tang-Rat-first, then domain registration with the Tang Rat email** → allow
   registration (could be a different person) but return `linkSuggestion`.
4. **Attacker knows victim's national ID** → cannot merge: unverified claims have
   no authority; merge needs a secret (password/mToken). ✔
5. **Unlink the only login method** → `422` "must keep at least one way to sign
   in." Adding a password before unlinking Tang Rat is allowed.
6. **Citizen ID already verified on account A; new sub arrives for same ID** →
   attach sub to A (§7.1), log `IDENTITY_LINK_AUTO`. Do not create a duplicate.
7. **mToken without citizenId/email** (partial consent) → create/login normally;
   account stays `citizenIdVerified=false` until a future mToken supplies it.
8. **Merge with data on both sides** → §8 precedence + §7.5 transaction; revoke
   absorbed sessions; audit.
9. **Suspended/deleted account on either side** → block link/merge (`403`/`409`).
10. **Cross-tier merge (public ↔ staff)** → block, route to admin (`409`).
11. **Concurrent logins / double-link race** → rely on DB unique constraints
    (`citizenIdHash`, `(provider, providerSub)`); catch `P2002` and resolve to the
    existing canonical account (same pattern as `register`).
12. **Invalid national ID** (bad checksum/length) → treat as "no citizen ID";
    never write it. Validate with the Thai ID checksum:
    ```
    13 digits; sum(digit[i] * (13 - i)) for i in 0..11; check = (11 - sum % 11) % 10;
    valid iff check == digit[12].
    ```
13. **Pepper rotation** → matching breaks for old hashes; document as long-lived,
    not rotated casually.
14. **Admin tier** → never reachable via `register`/`login`; merging an admin
    account is admin-only. Keep D3 intact.

---

## 12. Assumptions

- Tang Rat returns a **stable opaque `sub` per citizen per app**, plus
  **government-verified** PII including the 13-digit national ID (subject to
  consent scope — may be absent).
- One real person ⇔ one national ID. National IDs are **not secret**.
- Email is **not** a reliable unique identity key (reused, changed, shared).
- bcrypt cost 12 and RS256 JWT settings stay as in `docs/AUTHENTICATION.md`.
- The owner accepts the §3 schema migration as the approved exception to Golden
  Rule #2 for this feature only.

---

## 13. Trade-offs (and why each call was made)

| Choice | Alternative | Why we chose it |
|---|---|---|
| Proof-based linking | Silent auto-merge on citizen ID | National IDs are low-secret → auto-merge = takeover. Proof closes it. |
| Citizen ID hashed (HMAC) + last4 | Store raw / encrypt | Queryable match without holding raw PII; minimises breach blast radius. |
| Citizen ID on `SystemUser` | Separate `CitizenIdentity` table | One-to-one; fits existing account/identity split; fewer joins. |
| Reuse `AuthProviderLink` | New identity table | Model already supports N identities per account; less churn. |
| Don't collect citizen ID locally (core) | Always collect at registration | Avoids unique-squatting + takeover; §9 offers an opt-in hint instead. |
| Canonical = verified-citizen account | Newest/oldest wins | Verified gov identity is the strongest claim; deterministic merges. |

---

## 14. Implementation order (phased; one concern per commit)

1. **Schema + migration** (§3) + `prisma generate`. Update `prisma/seed.ts` so
   the mock Tang Rat users get verified citizen IDs.
2. **Crypto helper** (§5) + audit redaction + `CITIZEN_ID_PEPPER` in
   `.env.example`. Unit-test `hashCitizenId`/`isValidThaiCitizenId`.
3. **Provider** (§4): add `citizenId` to `TangRatIdentity` + mock data.
4. **Tang Rat login algorithm** (§7.1) + JWT `channel`/`hasCitizenId` (§6).
   Unit-test: new account, back-fill, attach-to-owner, partial mToken.
5. **Profile read/edit** (§8): `GET/PATCH /api/my/profile`.
6. **Two-way linking** (§7.3, §7.4): link Tang Rat, add credentials. Unit +
   live tests for the §0 scenario (different emails, same citizen ID).
7. **Merge** (§7.5) + collision endpoints (§10) + all §11 guards. Heavy
   transaction tests.
8. **Swagger**: annotate new endpoints; `npm run swagger:export`.
9. **Docs**: update `docs/AUTHENTICATION.md` (new profile/linking section),
   `AGENTS.md` (add **D5**), `docs/IMPLEMENTATION_STATUS_AI.md` change log, and
   memory.

**Definition of done:** `npm run lint && npm run build && npx jest` green;
`npm run test:e2e` green against a seeded DB; live proof of the §0 scenario
(domain account with email A + Tang Rat email B + same citizen ID → one profile
after a proof-based link); `openapi.json` regenerated. Report results per
`AGENTS.md` "When you finish."

---

## 15. Explicit non-goals

- No change to admin auth (D3 stays: admin tier = `/auth/self` + TOTP only).
- No real Tang Rat integration (mock stays; `// MOCK: replace in UAT`).
- No raw national ID storage, ever.
- No auto-merge without proof, ever.
- No frontend work (`app/` Next.js, `admin/` Nuxt are out of scope here).
```
