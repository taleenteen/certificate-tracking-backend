# GEMINI.md — Operating Rules for the Frontend Agent

> **Copy this file to the Next.js frontend repo root as `GEMINI.md`.** It is the
> one-page operating manual. The detailed plan lives in the backend repo at
> `docs/FRONTEND_GUIDE_AI.md` — read it before writing code.

## What you are doing
Integrating the **existing Next.js wireframe** with the e-licensing backend (Thai
gov platform on the ทางรัฐ / Tang Rat super app). You are **wiring + adding auth and
multi-tenant context — not redesigning**. The wireframe is approved.

## Authority order (when things conflict, higher wins)
1. `docs/IMPLEMENTATION_GUIDE_1.md` — master contract (schema §3, API §5, auth §4).
2. `openapi.json` — the live API contract. Treat it as truth; regenerate on the
   backend with `npm run swagger:export` if it looks stale.
3. `docs/FRONTEND_GUIDE_AI.md` — the detailed frontend plan.
4. This file — quick rules.

## Hard rules
1. **Never** delete/rewrite an existing page wholesale — modify in place; if
   incompatible, add `ComponentV2.tsx` + `// REPLACED: reason`, don't delete the old.
2. **Never** redesign UI (layout, colors, nav, component lib). Wireframe look is intentional.
3. **Contract wins.** Wireframe field not in `openapi.json` → hide it +
   `// TODO(api-gap): …`. Never invent a backend change.
4. **All backend calls go through the BFF (server-side), never browser → backend
   directly.** Every endpoint is reached at same-origin `/api/<path>`. The catch-all
   proxy `app/api/[...path]/route.ts` forwards to the backend server-side, injecting
   auth from httpOnly cookies. The browser holds **no token**. See "BFF rule" below.
5. **All data through the client layer** (`@/lib/http` + `hooks/*`). No inline
   `fetch()` to the backend. Delete every mock in the same commit that wires its page.
6. **Auth/roles/scope are server-side.** Frontend gates are UX-only (hide buttons).
7. **One page = one commit.** No big-bang. Follow the §7 integration order.
8. **Single root tree — never create a `src/` directory.** All code lives directly
   under the frontend repo root. Path alias is `@/* → ./*`. See frontend repo
   `docs/FRONTEND_STRUCTURE.md` for the canonical directory map.

## BFF rule — every endpoint runs server-side under `/api/*` (NON-NEGOTIABLE)

Browser → same-origin `/api/<path>` → BFF proxy → backend. Browser never holds a token.
The solid function is already built in the frontend repo — use it, don't reinvent:
- **`app/api/[...path]/route.ts`** — catch-all proxy. Forwards *every* endpoint,
  injects `Bearer` from the httpOnly `access_token` cookie, refreshes once on 401,
  harvests tokens out of auth bodies into cookies. **No route handler per endpoint.**
- **`server/backend.ts`** — server-only core (cookies, refresh, URL builder).
- **`@/lib/http`** — browser client; call with a path relative to `/api`:
  `http.get("my/profile")` → `GET /api/my/profile`. Wrap in React Query hooks.
- **Add an endpoint** = just call `http.<verb>("<path>")`; nothing to add to the proxy.
- **Config:** `BACKEND_INTERNAL_URL` (server-only env). The old `NEXT_PUBLIC_API_URL` +
  `lib/api.ts` (direct axios) are **deleted** — use `@/lib/http` only.

## Workflow (do not skip)
1. **Phase A audit** → `frontend-audit.md` (every route; mark juristic-context + auth
   tier). Present it before integrating. Record + follow existing folder/state/styling
   conventions.
2. **Phase B foundation** (build once): env (`BACKEND_INTERNAL_URL`) · **BFF proxy**
   `app/api/[...path]/route.ts` + `server/backend.ts` + `@/lib/http` (DONE —
   see "BFF rule") · auth+juristic store for **display state only** (no token;
   hydrate via `http.get("my/profile")`) · **context switching** (`POST /api/auth/context`
   re-mints the cookie token server-side → `queryClient.clear()` after) · React
   Query (tenant-scoped keys include `activeJuristicId`) · typed contract
   (`openapi-typescript` → `npm run gen:api`) · `RoleGate` + `JuristicGate` ·
   `/dev-login` (4 auth paths).
3. **Phase C** wire original wireframe (public → inspector → supervisor).
4. **Phase D** build the new D5/D6/D7 pages (profile/identity, juristic portal, join
   requests) as "missing pages", following existing conventions.

## Non-negotiables
- **All backend access is server-side via the `/api/*` BFF proxy** — see "BFF rule".
  Browser never calls the backend directly; browser never holds a token.
- **`GET /my/profile`** is the session-hydration endpoint (there is no `/auth/me`).
- A **context switch re-mints the access token** (server-side, into the cookie) and
  re-scopes data — `queryClient.clear()` after, or you leak one tenant's data into another.
- **Never render a full citizen ID** — only `citizenIdVerified` + `citizenIdLast4`.
- Match backend code discipline (`docs/CODING_STANDARDS.md` → FRONTEND_GUIDE_AI §5):
  thin components, hooks own logic, enums from generated types, English-only comments
  with the three tags (`// TODO(api-gap):`, `// MOCK:`, `// DECISION:`).

## Known gotchas (hydration / SSR)
- **`ChartContainer` must always receive an explicit `id` prop.** The `BackOfficeNavbar`
  uses `useSearchParams()` which forces Next.js to SSR the Suspense fallback instead of
  the real navbar. Radix UI `Dialog` (inside `QrScannerDialog`) calls `useId()` 3 times
  unconditionally, shifting the `useId` counter. Any `ChartContainer` that omits `id`
  will get a different `data-chart` value on server vs client → React hydration error.
  Always write: `<ChartContainer id="some-stable-slug" …>`.
  See frontend repo `docs/FRONTEND_IMPLEMENTATION_STATUS.md` for the full incident record.

## Dev credentials (seed)
- Tang Rat mTokens: `mock-public-owner`, `mock-inspector-1`/`-3`, `mock-supervisor-diw`/`-acfs`.
- Password (public): `public-owner`, `join-requester` (pw via seed; verified citizenId).
- Admin self: `admin` / `superadmin`, pw `ChangeMe-2026!`, **TOTP `000000`** (dev only).

## Done = `docs/FRONTEND_GUIDE_AI.md` §6 checklist green + `npm run gen:api && npm run build` clean.
