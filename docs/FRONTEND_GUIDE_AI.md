# Frontend Implementation Guide (AI) — Next.js User App

> **Audience:** the AI agent (Gemini) integrating the existing Next.js wireframe
> with this backend. **Authoritative as of 2026-06-16.**
>
> **Reading order:** `docs/IMPLEMENTATION_GUIDE_1.md` (master contract — schema §3,
> API §5, auth §4) → **this file** → `openapi.json` (the live contract). This file
> supersedes `docs/FRONTEND_INTEGRATION_GUIDE.md`, which predates D3-extended, D5,
> D6, and D7 and is kept only for history.
>
> **PRIME DIRECTIVE: you are integrating, not rebuilding.** The wireframe pages,
> layout, navigation, and component structure already exist and are approved. Your
> job is to wire them to the real API, add auth + multi-tenant context, and fill
> functional gaps — preserving the existing structure.

---

## 0. What changed since the old guide (read this first)

The backend gained four capabilities the old guide knows nothing about. They are
**not optional add-ons** — two of them (the auth paths and juristic context) are
*foundation-level* and must be designed in from the start:

| Feature | Backend | Frontend impact |
|---|---|---|
| **D3-extended** — public self-signup + password login | `POST /auth/register`, `POST /auth/login` | New auth pages; dev-login covers 4 paths |
| **D5** — profile + Tang Rat identity binding | `GET/PATCH /my/profile`, `POST/DELETE /my/identities/tang-rat`, `POST /my/credentials` | New `/profile` surface; **hydrate session via `GET /my/profile`** |
| **D6** — juristic multi-tenant portal | `GET /juristic*`, **`POST /auth/context`** | **Context switching re-mints the access token** + re-scopes data |
| **D7** — self-service join requests | `/juristic-requests*`, `/juristic/:id/join-requests*` | New request + approval surfaces |

> The old guide said "`GET /auth/me` is NOT in contract." That is now obsolete —
> **`GET /my/profile` is the canonical hydration endpoint.**

---

## 0a. HARD RULES (unchanged — still binding)

1. **Never delete or rewrite an existing page/component wholesale.** Modify in
   place. If incompatible with the contract, create `ComponentV2.tsx` alongside,
   switch the import, leave `// REPLACED: reason`. Don't remove the old file in the
   same commit.
2. **Never redesign UI.** No new layouts, colors, navigation, or component libraries
   "for improvement." The wireframe look is intentional.
3. **Contract wins over wireframe assumptions.** Field in the wireframe but not in
   `openapi.json` → hide it with `// TODO(api-gap): field X not in contract`. Never
   invent a backend change.
4. **All data goes through the API layer (§2).** No inline `fetch()` in components.
   No hardcoded mock left after a page is wired — delete mocks in the same commit.
5. **Auth/roles/scope are server-side.** Frontend role checks are UX-only (hide
   buttons); never treat them as security.
6. **Page by page, in the §6 order. One page = one commit.** No big-bang.

---

## 1. Phase A — MANDATORY AUDIT (before any code)

Produce `frontend-audit.md` at the frontend repo root: one row per route.

| Route | File path | Status | Components | Mock data location | API endpoints (from `openapi.json`) | Juristic-context aware? | Auth tier | Gaps/notes |
|---|---|---|---|---|---|---|---|---|

- `Status`: `wireframe-only` / `partial` / `done`.
- `Juristic-context aware?` (Y/N): does the page's data change depending on the
  active company context? (e.g. "My licenses" = Y.)
- `Auth tier`: `public` / `inspector` / `supervisor` / `admin` / `none`.

Also record, and **follow over** master-guide §2 if they differ:
- Existing folder conventions (components / hooks / utils / stores locations).
- Existing state management (extend it; do **not** introduce a second solution).
- Existing styling approach (Tailwind config, CSS modules, etc.).

Classify every D5/D6/D7 surface (§4) as either an existing wireframe page (wire it)
or a **"missing page"** — missing pages are the *only* pages you may create from
scratch, and you create them following the existing conventions you recorded above.

**STOP and present the audit** before integrating if a human is in the loop.

---

## 2. Phase B — FOUNDATION LAYER (build once, before any page)

Add these without touching existing pages. This is the core engineering work.

### 2.1 Environment
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_ENV=development
NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxx
```

### 2.2 API client — `lib/http.ts` (BFF-based — **already built**)
> **Do not recreate.** The BFF proxy + browser client are built and verified. Use
> `@/lib/http` for all calls; the catch-all proxy at `app/api/[...path]/route.ts`
> forwards to the backend and manages tokens server-side via httpOnly cookies.

```ts
import { http } from "@/lib/http";
const data = await http.get<T>("my/profile");      // → GET /api/my/profile
await http.post("auth/context", { juristicId });   // → POST /api/auth/context
```

Tokens live in httpOnly cookies (XSS-safe). The browser holds **no token**.
`BACKEND_INTERNAL_URL` (no `NEXT_PUBLIC_`) is the server-only backend origin.
The old `NEXT_PUBLIC_API_URL` + `lib/api.ts` (direct axios) are **deleted**.

### 2.3 Auth + juristic store — `stores/auth.ts` (zustand; already built)
State: `{ user: { id, fullName, roles, agency } | null, activeJuristicId, juristicRole }`.
- **No access token in store.** Token is an httpOnly cookie managed by the BFF proxy.
  Persist only non-sensitive `user` display fields to `sessionStorage`.
- **Hydrate via `GET /my/profile`** on app boot when a session may exist.
- Actions: `setAuth(payload)`, `setContext({ activeJuristicId, juristicRole })`, `clear()`.

### 2.4 Juristic context switching (D6) — foundational, not a page concern
`POST /auth/context { juristicId: string | null }` returns a **new `accessToken`**,
the `user`, and `activeJuristicId`. Switching context (including back to personal
mode with `null`) therefore means:
1. Swap the new `accessToken` into the store.
2. **`queryClient.clear()`** (or invalidate everything) — cached data is
   tenant-scoped; `GET /my/licenses` *means a different thing* under a company.
3. Update `activeJuristicId` + `juristicRole` in the store; reflect in the shell UI.

Expose exactly one entry point so this can never be done partially:
```ts
// hooks/useAuth.ts — useSwitchContext (already in useAuth.ts)
export function useSwitchContext() {
  const qc = useQueryClient();
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: (juristicId: string | null) =>
      http.post<{ activeJuristicId: string | null; juristicRole: string | null }>(
        'auth/context', { juristicId }),
    onSuccess: (data) => {
      setAuth({ activeJuristicId: data.activeJuristicId, juristicRole: data.juristicRole });
      qc.clear();         // tenant-scoped cache must not leak across contexts
    },
  });
}
```

### 2.5 React Query
Wrap the app in `QueryClientProvider` (`staleTime: 30_000, retry: 1`). One hook file
per API module in `hooks/` (`useMyLicenses.ts`, `useTasks.ts`, `useJuristic.ts`,
`useJoinRequests.ts`, `useProfile.ts`, …). **Tenant-scoped query keys must include
`activeJuristicId`** so a context switch can't serve stale cross-tenant data:
```ts
useQuery({ queryKey: ['my-licenses', activeJuristicId], queryFn: ... });
```

### 2.6 Typed contract (best-practice add)
Generate types from `openapi.json` so contract drift is a **compile error**:
```jsonc
// package.json
"scripts": { "gen:api": "openapi-typescript ../path/to/openapi.json -o types/api.d.ts" }
```
Hooks consume the generated request/response types. Re-run `gen:api` whenever the
backend contract changes.

### 2.7 Guards — `components/auth/RoleGate.tsx` + `JuristicGate.tsx`
- `RoleGate roles={['inspector']}` — platform roles (UX-only; hide buttons).
- `JuristicGate minRole="ADMIN"` — requires an active company context and a
  sufficient `juristicRole` (rank `OWNER(2) ≥ ADMIN(1) ≥ MEMBER(0)`, mirroring the
  backend `RequireJuristicRoleGuard`). Use for `/juristic/[id]/members`, invites, and
  the peer approval queue.
- Route-level guard in layout for `/dashboard`, `/supervisor/*`, `/tasks/*`,
  `/juristic/*`: no token → login; wrong tier → `/`.

### 2.8 Dev login — `/dev-login` (renders only when `NEXT_PUBLIC_ENV=development`)
Buttons for **all four** auth paths against the seed (`docs/IMPLEMENTATION_GUIDE_1.md`
§9 + `prisma/seed.ts`):
- **Tang Rat mTokens:** `mock-public-owner`, `mock-inspector-1`/`-3`,
  `mock-supervisor-diw`/`-acfs` → `POST /auth/tang-rat`.
- **Password login:** `public-owner`, `join-requester` (both `public`) → `POST /auth/login`.
- **Admin self:** `admin` / `superadmin`, password `ChangeMe-2026!`, **TOTP `000000`**
  → `POST /auth/self`.

---

## 3. Phase C — page-by-page integration (ORIGINAL wireframe)

For each page apply this loop (unchanged):
```
1. Read the page + child components; list every displayed datum.
2. Map each to a response field in openapi.json. exists→wire · missing→hide + // TODO(api-gap) · extra→ignore.
3. Create/extend the React Query hook(s).
4. Replace mock constants with hook data; DELETE the mocks.
5. Add the 4 states (loading / error+retry / empty Thai message / success) using existing wireframe patterns.
6. Wire mutations; invalidate affected queries on success.
7. Verify against seed data incl. edge rows (RNG4 null expireDate, SUSPENDED license, RETURNED task w/ reviewComment).
8. Commit: feat(page): wire <route> to API.
```

Page-specific notes (deltas only) — carried over from the old guide, still valid:

| Route | Notes |
|---|---|
| `/` (3 tabs) | "ใบอนุญาตของฉัน" tab requires auth → no token shows a login prompt. |
| `/search` | Debounce text 400 ms. QR scan: dynamic import `ssr:false`; scanned text = license UUID → `/licenses/[id]`; invalid → Thai toast "QR ไม่ถูกต้อง". |
| `/map` | Mapbox client-only (`dynamic(..., { ssr:false })`). Data = `GET /businesses/map`. Pin color by status: ACTIVE green / SUSPENDED amber / EXPIRED red / else grey. "นำทาง" → Google Maps dir URL. Cache per filter via query key. |
| `/licenses/[id]` | **RNG4 rule:** `expireDate === null` → "ไม่มีวันหมดอายุ (ชำระค่าธรรมเนียมรายปี)", never "Invalid Date". SUSPENDED → show `suspensionReason`. Docs via presigned URL; 403 from MinIO → refetch detail. |
| `/my` | personal⇄juristic toggle now driven by **active context** (§4 D6), not a local query param. |
| `/tasks/[id]/report` | Checklist from `checklistTemplate.items` of the task's license type — render dynamically, never hardcode. Photo upload: client-validate ≤10 MB + jpeg/png/pdf. Submit disabled until `result` chosen. RETURNED task → show `reviewComment` banner. |
| `/supervisor/tasks/create` | Assignee dropdown = `GET /users?role=inspector` (scoped server-side). POST 409 → Thai message "ผู้ตรวจมีส่วนได้ส่วนเสียกับกิจการนี้". |
| `/supervisor/reports/[id]/review` | Return requires non-empty comment. After approve/return → invalidate task + report + dashboard queries. |
| `/notifications` | Unread badge = client-derived from list query; mark-read updates cache. D6/D7 add notification types `JURISTIC_JOIN_REQUEST/APPROVED/REJECTED` — render with existing list styling. |

Order: public → inspector → supervisor.

---

## 4. Phase D — NEW D5/D6/D7 surfaces (create as "missing pages")

Follow the conventions recorded in your audit. These are the only pages you build
from scratch.

### D5 — Identity & profile
- `/profile` ← `GET /my/profile` (unified profile + linked identities) and
  `PATCH /my/profile` (display name / primary email / phone — self only).
- Link / unlink Tang Rat: `POST /my/identities/tang-rat` (mToken proof),
  `DELETE /my/identities/tang-rat` (must retain ≥1 sign-in method — handle the 422).
- Add username+password to a Tang-Rat-primary account: `POST /my/credentials`.
- **Security mirror (non-negotiable):** never render a full citizen ID. Show only
  `citizenIdVerified` (badge) + `citizenIdLast4` ("เลขบัตร …5752"). The full value is
  never returned by the API and must never be requested or displayed.

### D6 — Juristic portal
- **Company switcher in the app shell**: `GET /juristic` lists memberships →
  `useSwitchContext()` (§2.4). Show the active company + role; offer "ออกจากโหมดนิติบุคคล"
  (switch to `null`).
- `/juristic/[id]` — company detail (`GET /juristic/[id]`; membership-verified, no
  context required).
- Member management (behind `JuristicGate minRole="ADMIN"`, active context must match
  `[id]`): `GET/POST /juristic/[id]/members`, `PATCH/DELETE /juristic/[id]/members/[userId]`.
  Respect last-owner protection (422 on removing/demoting the only OWNER).
- Invites: `GET/POST /juristic/[id]/invites`, `DELETE /juristic/[id]/invites/[inviteId]`,
  and accept via `POST /juristic/invites/[token]/accept`.
- The `claim` (DBD) path exists (`POST /juristic/claim`) but is optional/future —
  surface it only if a wireframe calls for it.

### D7 — Join requests
- `/juristic-requests` — search (`GET /juristic-requests/companies?q=`) + submit
  (`POST /juristic-requests`). Submit requires a verified citizenId (422 otherwise);
  routing (peer vs first-owner) is automatic server-side — reflect
  `isFirstOwnerClaim` in the confirmation. Respect rate limits (3/hr, 5 pending → 409).
- `/juristic-requests/mine` — `GET /juristic-requests/mine`; cancel a PENDING request
  via `DELETE /juristic-requests/[id]`.
- **Peer approval queue** (under company management, `JuristicGate minRole="ADMIN"`):
  `GET /juristic/[id]/join-requests`, approve/reject via
  `POST /juristic/[id]/join-requests/[reqId]/{approve,reject}`. Approver may grant
  MEMBER/ADMIN only (not OWNER).
- **Staff first-owner queue** (admin tier, no juristic context):
  `GET /juristic-requests/admin/first-owner-claims`,
  `POST /juristic-requests/admin/[reqId]/{approve,reject}`.

---

## 5. "Claude style" for the Next.js frontend

Translated from `docs/CODING_STANDARDS.md` so new files match the backend's discipline.

- **Thin components = thin controllers.** Components render and dispatch; **hooks own
  data and logic** (the service analogue). No fetching or business rules inline in a
  component — extract to a `hooks/use*.ts`.
- **One folder per feature.** Cross-cutting code only in `lib/` / `components/shared/`.
  Never put feature logic in shared utils.
- **Explicit over magic.** Query keys list their tenant/scope dependencies
  (`activeJuristicId`); no hidden globals; no implicit refetch surprises.
- **Enums/status from the generated contract types** — never string literals (mirrors
  CODING_STANDARDS §7). Status→color/label maps live in one place per feature.
- **Errors are typed and non-revealing.** Map 401/403/404/409/422 to the existing
  wireframe alert/toast patterns. Every query renders the 4 states (loading/error/empty/success).
- **Comments: English only**, three sanctioned tags — `// TODO(api-gap):`, `// MOCK:`,
  `// DECISION:`. No narration.
- **Security invariants mirrored:** access token in httpOnly cookie (BFF-managed);
  never log tokens; never render full `citizenId`.

---

## 6. Definition of Done

- [ ] `frontend-audit.md` exists; every row reached `done`.
- [ ] Zero hardcoded mock data remains in the app (grep the audit's mock locations).
- [ ] `/dev-login` works for all four auth paths; role-based redirect correct.
- [ ] 401 refresh-retry works (delete the in-memory token → next request still succeeds).
- [ ] **Context switch** clears/invalidates the query cache and re-scopes data; the
      shell reflects the active company + role; switching to `null` returns to personal.
- [ ] Role + JuristicGate guards: a PUBLIC user visiting `/supervisor/dashboard` is
      redirected; a MEMBER cannot see member-management actions.
- [ ] RNG4 license page shows no-expiry text; SUSPENDED shows reason.
- [ ] Inspection happy path: supervisor creates task → inspector starts → fills report
      + uploads photo → submits → supervisor approves → license reflects result.
- [ ] Return path: supervisor returns with comment → inspector sees banner → resubmit → approve.
- [ ] **D5:** profile loads via `GET /my/profile`; link/unlink Tang Rat round-trips;
      full citizenId is never shown.
- [ ] **D7:** join-request happy path — search → submit → (owner) approve → the new
      membership appears in the requester's company switcher.
- [ ] `npm run gen:api` + `npm run build` pass with zero TypeScript errors.

---

## 7. Integration order

```
A  audit (§1)
B  foundation (§2)  — incl. auth paths, context switching, guards, typed contract
C1 public:      / → /search → /licenses/[id] → /businesses/[id] → /map → /my → /notifications
C2 inspector:   /dashboard → /tasks/[id] → /tasks/[id]/report
C3 supervisor:  /supervisor/dashboard → /tasks → /tasks/create → /reports → /reports/[id]/review → /manage
D5 profile:     /profile (+ identity link/unlink, add-credentials)
D6 juristic:    company switcher → /juristic/[id] → members → invites
D7 requests:    /juristic-requests → /mine → peer approval queue → staff first-owner queue
E  definition-of-done checklist (§6)
```

The Nuxt admin portal is **out of scope** here (built fresh later per master-guide §7.2).

---

## 8. Appendix — page → endpoint map

> Generated against `openapi.json` (regenerated 2026-06-16, includes D5/D6/D7). Every
> page below resolves to a real operation.

| Page / surface | Endpoint(s) |
|---|---|
| `/auth/register`, `/auth/login` | `POST /auth/register`, `POST /auth/login` |
| `/dev-login` | `POST /auth/tang-rat`, `POST /auth/login`, `POST /auth/self` |
| (foundation) refresh / logout / context | `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/context` |
| `/` home, `/search` | `GET /license-types`, `GET /businesses`, `GET /licenses/{id}` |
| `/licenses/[id]` (+ QR) | `GET /licenses/{id}`, `GET /licenses/{id}/qr-verify` |
| `/businesses/[id]`, `/map` | `GET /businesses/{id}`, `GET /businesses/map` |
| `/my` (licenses) | `GET /my/licenses` (re-scoped by active context) |
| `/notifications` | `GET /my/notifications`, `PATCH /notifications/{id}/read`, `PATCH /notifications/read-all` |
| `/dashboard` (inspector) | `GET /dashboard/inspector` |
| `/tasks`, `/tasks/[id]` | `GET /inspection-tasks`, `GET /inspection-tasks/{id}`, `PATCH .../start` |
| `/tasks/[id]/report` | `PUT /inspection-reports/{id}`, `POST .../evidence`, `DELETE .../evidence/{docId}`, `PATCH .../submit` |
| `/supervisor/dashboard` | `GET /dashboard/supervisor` |
| `/supervisor/tasks/create` | `POST /inspection-tasks`, `GET /users?role=inspector` |
| `/supervisor/.../cancel` | `PATCH /inspection-tasks/{id}/cancel` |
| `/supervisor/reports/[id]/review` | `PATCH /inspection-reports/{id}/approve`, `PATCH .../return`, `GET .../export` |
| **`/profile` (D5)** | `GET/PATCH /my/profile`, `POST/DELETE /my/identities/tang-rat`, `POST /my/credentials` |
| **company switcher (D6)** | `GET /juristic`, `POST /auth/context` |
| **`/juristic/[id]` (D6)** | `GET /juristic/{id}` |
| **members (D6)** | `GET/POST /juristic/{id}/members`, `PATCH/DELETE /juristic/{id}/members/{userId}` |
| **invites (D6)** | `GET/POST /juristic/{id}/invites`, `DELETE /juristic/{id}/invites/{inviteId}`, `POST /juristic/invites/{token}/accept` |
| **claim (D6, optional)** | `POST /juristic/claim` |
| **`/juristic-requests` (D7)** | `GET /juristic-requests/companies`, `POST /juristic-requests` |
| **`/juristic-requests/mine` (D7)** | `GET /juristic-requests/mine`, `DELETE /juristic-requests/{id}` |
| **peer approval queue (D7)** | `GET /juristic/{id}/join-requests`, `POST /juristic/{id}/join-requests/{reqId}/{approve,reject}` |
| **staff first-owner queue (D7)** | `GET /juristic-requests/admin/first-owner-claims`, `POST /juristic-requests/admin/{reqId}/{approve,reject}` |
