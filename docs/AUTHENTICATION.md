# Authentication — How It Works (Plain-English Guide)

> Audience: anyone (developers, reviewers, frontend devs) who needs to
> understand how login works in this API. No prior context required.
> For coding conventions see `docs/CODING_STANDARDS.md` §4b/§12; for the role
> rules see `AGENTS.md` "Role model".

---

## 1. The big picture in 30 seconds

A user proves who they are, the server gives them **two tokens**, and the
client uses one of them on every request:

```
                 ┌─────────────────────────────────────────────┐
   LOGIN  ─────► │  server checks credentials                  │
                 │  → returns  accessToken  (short-lived JWT)   │
                 │  → returns  refreshToken (long-lived, cookie)│
                 └─────────────────────────────────────────────┘
                                   │
   EVERY REQUEST ──────────────────┘
   Authorization: Bearer <accessToken>
```

- **accessToken** — a signed JWT, valid **15 minutes**. Sent in the
  `Authorization: Bearer …` header on every protected request.
- **refreshToken** — a long random string, valid **7 days**, stored as an
  `httpOnly` cookie (JavaScript cannot read it). Used only to get a fresh
  accessToken when the old one expires.

When the accessToken expires, the client calls `POST /api/auth/refresh` and
gets a new pair — the user never has to log in again until the refresh token
itself expires.

---

## 2. Four ways to log in (and who uses each)

This platform serves two very different audiences, so there are four entry
points. **You only ever use one**, depending on who you are.

| Endpoint | Who | What you send | Notes |
|---|---|---|---|
| `POST /api/auth/register` | **Public citizens** | username, email, password | Self-signup. Creates a read-only account and logs you in immediately. |
| `POST /api/auth/login` | **Public citizens** | username, password | For returning citizens who registered above. |
| `POST /api/auth/tang-rat` | **Field staff** (`officer`) and citizens coming from the gov app | an `mToken` from the ทางรัฐ (Tang Rat) super app | No password — identity comes from the government app. Account is auto-created on first use. |
| `POST /api/auth/dga/authorize` → `POST /api/auth/dga/callback` | **Citizens / officers via DGA Digital ID OIDC** | `code` + signed `state` | OpenID Connect 1.0 flow for ทางรัฐ/DGA. Token and UserInfo exchange are backend-only. |
| `POST /api/auth/self` | **Admins** (admin/super_admin) | username, password, **TOTP code** | Web portal only. Requires a 6-digit authenticator code (2-factor). |

**The simple rule:**
- Citizen with a password → **register / login**.
- Field staff via the gov app → **dga/authorize + dga/callback** for OIDC, or
  **tang-rat** for the older mock mToken shortcut.
- Admin in the back office → **self** (with 2FA).

> **Why three?** Citizens want a normal "sign up" experience. Field staff are
> already identified by the government super app, so re-entering a password
> would be redundant. Admins touch sensitive data, so they get the strongest
> path (password **and** a TOTP second factor) and are *blocked* from the other
> two paths on purpose.

---

## 3. Registration — the new public sign-up flow

### Request
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "somchai.dev",
  "email":    "somchai@example.com",
  "password": "MyStrongPass-2026!",
  "fullName": "สมชาย ใจดี",
  "phone":    "0812345678"      // optional
}
```

### What the server does
1. **Validates the input** (username 3–50 chars, valid email, password 12–72
   chars). Invalid input → `400`.
2. **Checks the username is free.** Taken → `409 Conflict`.
3. **Hashes the password with bcrypt** (see §5). The plain password is never
   stored, logged, or returned.
4. **Creates the account** with role `["public"]` (read-only).
5. **Logs you in immediately** — returns the same token pair as login, so the
   user is signed in right after signing up.

### Response (`201 Created`)
```json
{
  "accessToken": "eyJhbGciOiJSUzI1Ni␣…",
  "refreshToken": "9f3c…(also set as an httpOnly cookie)",
  "user": { "id": "uuid", "fullName": "สมชาย ใจดี", "roles": ["public"], "agency": null }
}
```

### Returning users — `POST /api/auth/login`
```http
POST /api/auth/login
{ "username": "somchai.dev", "password": "MyStrongPass-2026!" }
```
Returns the same token shape. Admins are **rejected** here (they must use
`/auth/self`) — the server replies with a generic `401 Invalid credentials` so
nobody can tell admin usernames apart from citizen ones.

## 3b. DGA Digital ID / ทางรัฐ OIDC flow

Use this for the real OpenID Connect style integration.

1. Frontend calls:
   ```http
   POST /api/auth/dga/authorize
   { "redirectUri": "http://localhost:3000/auth/dga/callback", "scope": "openid citizen_id given_name family_name" }
   ```
2. Backend returns `authorizeUrl`, signed `state`, and `expiresAt`.
3. Frontend stores `state` plus the exact `redirectUri` in session-scoped
   storage and redirects the browser to `authorizeUrl`.
4. DGA redirects back to the frontend callback with `?code=...&state=...`.
5. Frontend sends both values to:
   ```http
   POST /api/auth/dga/callback
   { "code": "...", "state": "...", "redirectUri": "http://localhost:3000/auth/dga/callback" }
   ```
6. Backend validates the signed one-time `state`, verifies the `redirectUri`
   against `DGA_OIDC_ALLOWED_REDIRECT_URIS`, exchanges `code` for provider tokens, calls
   UserInfo, then reuses the Tang Rat identity-binding logic to create/find the
   user and issue this API's `accessToken` + `refreshToken`. The provider
   `id_token` is AES-GCM encrypted and stored only on the server-side session so
   logout can call DGA end-session later.

DGA OIDC logout uses the normal `POST /api/auth/logout` endpoint. The backend
revokes the app session first. If that session has a DGA provider `id_token`, the
response includes `endSessionUrl` for `/connect/endsession` with
`id_token_hint` and `post_logout_redirect_url`. Frontend redirects to that URL,
then DGA redirects back to `/auth/logout-callback`, where the user must login
again before returning to the app.

Production scale-out note: DGA OIDC state nonces are stored in the database and
consumed atomically, so authorize/callback pairs may be handled by different API
instances.

Development mock callback codes:

- `mock-dga-public-owner`
- `mock-dga-officer-diw`
- `mock-dga-officer-acfs`

Frontend details live in `docs/FRONTEND_DGA_OIDC_API.md`.

---

## 4. Using the token on protected routes

Put the access token in the `Authorization` header:

```http
GET /api/my/notifications
Authorization: Bearer eyJhbGciOiJSUzI1Ni␣…
```

No header (or an expired/invalid token) → `401 Unauthorized`.

When you get a `401` because the token expired, refresh:

```http
POST /api/auth/refresh        # refreshToken comes from the cookie automatically
```

---

## 5. How password hashing works (bcrypt)

We **never** store passwords. We store a one-way **bcrypt hash**.

```
"MyStrongPass-2026!"  ──bcrypt(cost 12)──►  "$2b$12$Nf8…<60 chars>"
```

A stored hash looks like this, and each part has a meaning:

```
$2b$ 12 $ Nf8kQ…22charsalt…  e1Z…31charhash…
 │    │       │                  │
 │    │       │                  └─ the actual hash
 │    │       └─ the random salt (auto-generated per password)
 │    └─ cost factor 12  → 2^12 = 4096 rounds of hashing
 └─ algorithm identifier (bcrypt)
```

Why bcrypt is the right choice:

- **Salted automatically.** bcrypt generates a unique random salt for every
  password and stores it *inside* the hash. Two users with the same password
  get completely different hashes, so attackers can't use precomputed
  ("rainbow") tables.
- **Deliberately slow.** The cost factor (12 here) makes each hash take real
  CPU time, so brute-forcing stolen hashes is expensive. Cost 12 is the project
  standard (`docs/CODING_STANDARDS.md` §12).
- **One-way.** You cannot turn a hash back into the password. To check a login
  we hash the *attempt* and compare:
  `bcrypt.compare(attempt, storedHash)`.

> **The 72-character cap.** bcrypt only reads the first **72 bytes** of input.
> We reject passwords longer than 72 chars at validation time so nothing is
> silently truncated — what the user types is exactly what's protected.

In code (simplified):
```ts
// at registration — hash and store
const passwordHash = await bcrypt.hash(dto.password, 12);

// at login — compare, never decrypt
const ok = await bcrypt.compare(attempt, user.passwordHash);
```

---

## 6. The four platform roles (who can do what)

Roles are **hierarchical** — a higher role automatically has every lower
role's access:

```
public  <  officer  <  admin  <  super_admin
  0          1          2          3
```

| Role | How they log in | What they can do |
|---|---|---|
| `public` | register / login / tang-rat | Read-only: view licenses, businesses, own notifications. |
| `officer` | tang-rat / configured password account | Field staff role. Current prototype capabilities cover inspection/report workflows and agency-scoped operational reads. |
| `admin` | self (+TOTP) | Admin portal operations; grant roles *below* admin. Some operational reads remain agency-scoped until the admin model is reworked. |
| `super_admin` | self (+TOTP) | Manage all users; the only role that can grant `admin`/`super_admin`. |

Self-registration always creates a `public` user. Promoting someone to a higher
role is a separate, permission-checked admin action (`PATCH /api/users/:id/roles`).

---

## 7. Security features baked in

| Protection | What it does |
|---|---|
| **Short access tokens** | 15-min JWT lifetime limits the damage of a leaked token. |
| **Refresh rotation** | Each refresh issues a new refresh token and revokes the old one. Re-using an old refresh token is treated as theft → **all** the user's sessions are revoked. |
| **httpOnly refresh cookie** | The refresh token is not readable by JavaScript, reducing XSS risk. |
| **Account lockout** | 5 wrong passwords → the account locks for 15 minutes (`423 Locked`). Applies to login and admin self-login. |
| **Generic error messages** | Login failures say only "Invalid credentials" — never which field was wrong — so attackers can't enumerate valid usernames. |
| **Rate limiting** | `register` 5/min, `login` 10/min, `forgot-password` 3/hour — per IP/user. |
| **bcrypt cost 12** | Slow, salted password hashing (see §5). |
| **TOTP for admins** | Admin self-login requires a 6-digit authenticator code on top of the password. |
| **RS256 signed JWTs** | Tokens are signed with an RSA private key and verified with the public key — they can't be forged or tampered with. |
| **Audited** | Registration and every login/logout is written to the audit log. |

> **Dev shortcut:** in `NODE_ENV=development` the admin TOTP code `000000` is
> accepted so you don't need a real authenticator while developing. This never
> applies in production.

---

## 8. Try it yourself (copy-paste)

With the stack running (`./dev.sh`), the API is at `http://localhost:3001` and
interactive docs at `http://localhost:3001/docs`.

```bash
# 1) Register (creates a public account and logs you in)
curl -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"somchai.dev","email":"somchai@example.com","password":"MyStrongPass-2026!","fullName":"สมชาย ใจดี"}'

# 2) Log in again later
curl -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"somchai.dev","password":"MyStrongPass-2026!"}'

# 3) Call a protected route with the accessToken from step 1 or 2
curl http://localhost:3001/api/my/notifications \
  -H 'Authorization: Bearer <PASTE_accessToken_HERE>'
```

---

## 9. Where this lives in the code

| Concern | File |
|---|---|
| Login/register/refresh logic | `src/modules/auth/auth.service.ts` |
| Routes + Swagger annotations | `src/modules/auth/auth.controller.ts` |
| Request/response shapes + validation | `src/modules/auth/auth.dto.ts` |
| Token verification on each request | `src/common/guards/jwt-auth.guard.ts` |
| Role checks | `src/common/guards/roles.guard.ts` + `src/common/auth.roles.ts` |
| Token claims shape | `src/common/auth.types.ts` (`JwtClaims`) |
```
