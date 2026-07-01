# Frontend Handoff — DGA Digital ID / Tang Rat OIDC

Base path assumes global API prefix `/api`.

## Purpose

Use this flow when the frontend wants to authenticate a user through DGA Digital
ID / ทางรัฐ using OpenID Connect 1.0 instead of the older mock `mToken` shortcut.

The frontend never calls DGA `/connect/token` or `/connect/userinfo` directly.
Those steps are backend-only so `client_secret` and provider tokens never reach
the browser.

## 1. Create Authorize URL

```http
POST /api/auth/dga/authorize
Content-Type: application/json
```

Request:

```json
{
  "redirectUri": "http://localhost:3000/auth/dga/callback",
  "scope": "openid citizen_id given_name family_name"
}
```

Response:

```json
{
  "authorizeUrl": "https://connect.dga.or.th/connect/authorize?response_type=code&client_id=...&redirect_uri=...&scope=openid+citizen_id+given_name+family_name&state=...",
  "state": "signed-state",
  "expiresAt": "2026-07-02T10:10:00.000Z"
}
```

Frontend behavior:

- Store `state` and the exact `redirectUri` client-side until callback returns
  (session-scoped storage is preferred).
- Redirect the browser to `authorizeUrl`.
- The state expires after 10 minutes.
- Backend only accepts redirect URIs configured in
  `DGA_OIDC_ALLOWED_REDIRECT_URIS`.

## 2. Callback Login

DGA redirects the browser back to the registered frontend callback URL with:

```text
?code=<authorization-code>&state=<signed-state>
```

The frontend sends those values to backend:

```http
POST /api/auth/dga/callback
Content-Type: application/json
```

Request:

```json
{
  "code": "mock-dga-public-owner",
  "state": "signed-state",
  "redirectUri": "http://localhost:3000/auth/dga/callback"
}
```

Response is the normal auth response:

```json
{
  "accessToken": "jwt",
  "refreshToken": "opaque-refresh-token",
  "user": {
    "id": "user-id",
    "fullName": "เจ้าของกิจการจากทางรัฐ",
    "roles": ["public"],
    "agencyId": null
  }
}
```

Backend also sets `refreshToken` as an httpOnly cookie.

Frontend callback requirements:

- Reject the callback locally if there is no stored DGA state for the current
  browser session.
- Reject the callback locally if the returned `state` differs from the stored
  state.
- Send the same `redirectUri` value used during authorize. Do not derive a new
  callback URL during callback.
- A backend state can only be consumed once.

## 3. Logout

Use the normal app logout endpoint. The frontend does not need to know in
advance whether the current session came from DGA.

```http
POST /api/auth/logout
Authorization: Bearer <app-access-token>
```

Local/self-login response:

```json
{
  "success": true
}
```

DGA OIDC response:

```json
{
  "success": true,
  "endSessionUrl": "https://connect.dga.or.th/connect/endsession?id_token_hint=...&post_logout_redirect_url=https%3A%2F%2Fe-license.govcenter.co%2Fauth%2Flogout-callback"
}
```

Frontend behavior:

- Always clear local auth state and cached user data after `POST /api/auth/logout`.
- The BFF should clear httpOnly auth cookies for this endpoint.
- If `endSessionUrl` is present, redirect the browser to that URL with
  `window.location.href`.
- If `endSessionUrl` is absent, route to `/auth/login`.
- Create a frontend page at `/auth/logout-callback`; DGA redirects the browser
  there after Digital ID logout. The page should show a logged-out state and ask
  the user to login again.

Backend behavior:

- App session revocation always happens first.
- `endSessionUrl` is returned only when the current server-side session has a
  DGA OIDC `id_token` stored from the Token API response. The value is encrypted
  at rest and never returned to the frontend directly.
- Older Tang Rat `mToken`/mock sessions and self-login sessions do not receive
  `endSessionUrl`.

## Development Mock Codes

Use these values as `code` in `/api/auth/dga/callback` after creating a real
state from `/api/auth/dga/authorize`:

- `mock-dga-public-owner`
- `mock-dga-officer-diw`
- `mock-dga-officer-acfs`

## Error Handling

- `400 Invalid state`: state is malformed or does not match backend signature.
- `400 Expired state`: user took longer than 10 minutes.
- `401 Invalid authorization code`: mock/real DGA code exchange failed.
- `401 Invalid access token`: mock/real UserInfo call failed.

## Production Notes

Production DGA settings come from backend environment variables:

- `DGA_OIDC_MODE=real`
- `DGA_OIDC_BASE_URL=https://connect.egov.go.th`
- `DGA_OIDC_CLIENT_ID`
- `DGA_OIDC_CLIENT_SECRET`
- `DGA_OIDC_REDIRECT_URI`
- `DGA_OIDC_ALLOWED_REDIRECT_URIS`
- `DGA_OIDC_LOGOUT_REDIRECT_URI`
- `DGA_OIDC_SCOPE=openid citizen_id given_name family_name`
- `DGA_OIDC_STATE_SECRET`
- `DGA_OIDC_ID_TOKEN_ENCRYPTION_KEY`

Do not put `DGA_OIDC_CLIENT_SECRET` in frontend code.
