# Frontend Integration Guide — Existing Next.js Wireframe

> **READ `IMPLEMENTATION_GUIDE.md` FIRST.** That file is the master contract (schema §3, API §5, auth §4). This file ONLY governs how to work inside the **existing Next.js codebase**, which already contains wireframe UI for all user-facing features.
>
> **PRIME DIRECTIVE: You are integrating, not rebuilding.** The wireframe pages, layout, navigation, and component structure already exist and are approved. Your job is to wire them to the real API, add auth, and fill functional gaps — while preserving the existing structure.

---

## 0. HARD RULES

1. **NEVER delete or rewrite an existing page/component wholesale.** Modify in place. If a component is fundamentally incompatible with the API contract, create the new version alongside it (`ComponentV2.tsx`), switch the import, and leave a `// REPLACED: reason` comment. Do not remove the old file in the same commit.
2. **NEVER redesign UI.** No changing layouts, color schemes, navigation patterns, or component libraries "for improvement." Wireframe look is intentional at this stage.
3. **API contract wins over frontend assumptions.** If the wireframe has a field the API doesn't return (per `IMPLEMENTATION_GUIDE.md` §5), hide that field with `// TODO(api-gap): field X not in contract` — do NOT invent a backend change.
4. **All data fetching goes through the API layer described in §3 below.** No inline `fetch()` scattered in components. No hardcoded data left behind after a page is integrated — mock constants must be deleted in the same PR that wires the page.
5. **Auth/roles/scope are enforced server-side.** Frontend role checks are UX-only (hide buttons); never treat them as security.
6. Work **page by page** in the order of §6. One page = one commit. Never "big bang" integrate.

---

## 1. PHASE A — MANDATORY AUDIT (do this before writing any code)

Produce a file `frontend-audit.md` at repo root with this exact table, one row per route found in the codebase:

| Route | File path | Status | Components used | Mock data location | API endpoints needed (from §5 of master guide) | Gaps/notes |
|---|---|---|---|---|---|---|

Status values: `wireframe-only` (static, no logic) / `partial` (some state/logic) / `done` (already wired — unlikely).

Also list in the audit:
- Existing folder conventions (where components, hooks, utils live) — **you must follow these conventions**, not the layout in the master guide §2 if they differ.
- Existing state management (if any zustand/context/Redux exists, extend it; do not introduce a second solution).
- Existing styling approach (Tailwind config, CSS modules, etc.).
- Any component that visually represents a feature NOT in the API contract → flag as `TODO(api-gap)`.
- Any API-contract feature with NO wireframe page → list under "Missing pages" (these are the only pages you may create from scratch, following existing conventions).

**STOP after the audit and present it before integrating** if a human is in the loop; otherwise proceed but keep the audit updated as you go.

---

## 2. PHASE B — FOUNDATION LAYER (build once, before any page)

Add these WITHOUT touching existing pages:

### 2.1 Environment
```
NEXT_PUBLIC_API_URL=http://localhost/api
NEXT_PUBLIC_ENV=development
NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxx
```

### 2.2 API client — `src/lib/api.ts`
- Axios instance, `baseURL = NEXT_PUBLIC_API_URL`.
- Request interceptor: attach `Authorization: Bearer {accessToken}` from auth store.
- Response interceptor: on 401 → call `POST /auth/refresh` (cookie-based) **once** → retry original request → on second failure clear auth store + redirect `/auth/login`. Use a single in-flight refresh promise so concurrent 401s don't fire parallel refreshes.

### 2.3 Auth store — `src/stores/auth.ts` (zustand, or extend whatever exists)
State: `{ accessToken, user: { id, fullName, roles, agency } | null }`. Access token in memory only. Actions: `setAuth`, `clear`. Hydrate user via `GET /my/notifications`-free route? No — add `GET /auth/me` is NOT in contract; instead persist `user` to `sessionStorage` (non-sensitive display fields only) and re-validate on first 401.

### 2.4 React Query
Wrap app in `QueryClientProvider` (defaults: `staleTime: 30_000, retry: 1`). Every page integration = replace mock data with `useQuery`/`useMutation` hooks placed in `src/hooks/` (e.g. `useBusinesses.ts`, `useTasks.ts`). One hook file per API module.

### 2.5 Role guard helper — `src/components/RoleGate.tsx`
```tsx
<RoleGate roles={['inspector']} fallback={null}>{children}</RoleGate>
```
Plus a route-level guard in layout for `/dashboard`, `/supervisor/*`, `/tasks/*`: no token → redirect to login; wrong role → redirect to `/`.

### 2.6 Dev login page — `/dev-login` (create if missing)
Only renders when `NEXT_PUBLIC_ENV=development`. Buttons posting mock mTokens per master guide §9 (`mock-sub-*` users): Public / Inspector DIW / Inspector ACFS / Supervisor DIW / Supervisor ACFS.

---

## 3. PHASE C — PAGE-BY-PAGE INTEGRATION

For **each** page, apply this exact loop:

```
1. Read the existing page + child components. Identify every piece of displayed data.
2. Map each piece to a response field from the API contract (master guide §5).
   - Field exists       → wire it.
   - Field missing      → hide element + // TODO(api-gap)
   - Extra API fields   → ignore (do not force into UI)
3. Create/extend the React Query hook for the endpoint(s).
4. Replace mock constants with hook data. DELETE the mock constants.
5. Add the 4 UI states using existing wireframe patterns if present, else minimal:
   loading (skeleton/spinner) | error (retry button) | empty (Thai message) | success
6. Wire mutations (forms/buttons) with optimistic UI only where trivial; otherwise
   invalidate queries on success.
7. Verify against seed data (master guide §9) — the page must render correctly with
   the seeded records, including edge rows (RNG4 null expireDate, SUSPENDED license,
   RETURNED task with reviewComment).
8. Commit: `feat(page): wire <route> to API`.
```

### Page-specific wiring notes (only deltas from the contract)

| Route | Notes |
|---|---|
| `/` (3 tabs) | Tabs are client state. "ใบอนุญาตของฉัน" tab requires auth → if no token, show login prompt instead of tab content. |
| `/search` | Debounce text input 400 ms. QR scan: dynamic import scanner lib `ssr:false`; scanned text = license UUID → navigate `/licenses/[id]`. Invalid UUID → Thai toast "QR ไม่ถูกต้อง". |
| `/map` | Mapbox init client-only (`dynamic(() => …, { ssr:false })`). Data = `GET /businesses/map` GeoJSON. Pin color by `licenseStatus`: ACTIVE green / SUSPENDED amber / EXPIRED red / others grey. "นำทาง" → `window.open('https://www.google.com/maps/dir/?api=1&destination='+lat+','+lng)`. Re-fetch on filter change; cache per filter combo via query key. |
| `/licenses/[id]` | **RNG4 rendering rule:** `expireDate === null` → show "ไม่มีวันหมดอายุ (ชำระค่าธรรมเนียมรายปี)" — never "Invalid Date". If `status=SUSPENDED` show `suspensionReason`. Documents render from presigned URLs; refetch on click if expired (403 from MinIO → refetch detail). |
| `/my` | personal/juristic toggle = two query modes. Juristic `{ found:false }` → render the wireframe's "ไม่พบนิติบุคคล" state. |
| `/tasks/[id]/report` | Checklist questions come from `checklistTemplate.items` of the task's license type — render dynamically; do NOT hardcode questions even if the wireframe did. Photo upload: client-side validate ≤10 MB + jpeg/png/pdf before POST. Submit disabled until `result` chosen. If task status RETURNED → show `reviewComment` banner at top (use existing alert style). |
| `/supervisor/tasks/create` | Assignee dropdown = `GET /users?role=inspector` (scoped server-side). On 409 from POST → show Thai message "ผู้ตรวจมีส่วนได้ส่วนเสียกับกิจการนี้" near the assignee field. |
| `/supervisor/reports/[id]/review` | Return action requires non-empty comment (client-validate; server enforces too). After approve/return → invalidate task + report + dashboard queries. |
| `/notifications` | Unread badge count in header (if wireframe has one) = client-derived from list query; mark-read mutations update cache. |

---

## 4. WHAT YOU MAY CREATE FROM SCRATCH

Only: (a) pages listed as "Missing pages" in your audit, (b) the foundation layer §2, (c) small leaf components required for the 4 UI states. Everything else exists — extend it.

The Nuxt 4 admin portal does NOT exist yet and is **out of scope for this file** — it is built fresh per master guide §7.2 after the user-facing app integration is complete.

---

## 5. DEFINITION OF DONE (frontend integration)

- [ ] `frontend-audit.md` exists and every row reached status `done`
- [ ] Zero hardcoded mock data remains in `app/` (grep for the audit's mock locations)
- [ ] `/dev-login` works for all 5 mock users; role-based redirect correct
- [ ] 401 refresh-retry flow works (test: delete access token in devtools → next request still succeeds)
- [ ] Role guards: PUBLIC user manually visiting `/supervisor/dashboard` is redirected
- [ ] RNG4 license page shows no-expiry text; SUSPENDED shows reason
- [ ] Full happy path clickable against seed data: login as supervisor → create task → login as inspector → start → fill report + upload photo → submit → supervisor approve → license status reflects result
- [ ] Return path: supervisor returns with comment → inspector sees banner → resubmit → approve
- [ ] `npm run build` passes with zero TypeScript errors

## 6. INTEGRATION ORDER

```
A  audit (§1)
B  foundation (§2)
C1 public pages:   / → /search → /licenses/[id] → /businesses/[id] → /map → /my → /notifications
C2 inspector:      /dashboard → /tasks/[id] → /tasks/[id]/report
C3 supervisor:     /supervisor/dashboard → /tasks → /tasks/create → /reports → /reports/[id]/review → /manage
D  definition-of-done checklist (§5)
```

Backend P1 endpoints must exist before C1; P2 before C2/C3 (see master guide §12). If backend and frontend are developed in parallel by separate agents, frontend may stub against the seed-data shapes from master guide §9 but must mark every stub `// STUB: awaiting api`.
