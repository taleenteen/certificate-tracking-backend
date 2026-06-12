# E-License Verification API

NestJS API prototype for Thailand's e-license verification platform. All
external integrations and seeded records are mock data.

## Prerequisites

- Node.js 20+
- Docker with Compose
- OpenSSL for local RS256 key generation

## Setup

```bash
cp .env.example .env

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out /tmp/elicense-private.pem
openssl rsa -pubout -in /tmp/elicense-private.pem -out /tmp/elicense-public.pem

# Put base64-encoded PEM values into JWT_PRIVATE_KEY_BASE64 and
# JWT_PUBLIC_KEY_BASE64 in .env. Do not commit .env or PEM files.

npm ci
docker compose up -d db minio
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev
```

The API listens on `http://localhost:3001/api`. Nginx exposes it under
`http://localhost/api` when the full Compose stack is running.

## Mock credentials

- ADMIN: `superadmin` / `ChangeMe-2026!`
- Development TOTP: `000000`
- Tang Rat mTokens include `mock-inspector-1`, `mock-inspector-3`,
  `mock-supervisor-diw`, `mock-supervisor-acfs`, and `mock-public-owner`

The seed refuses to run when `NODE_ENV=production`.

## Verification

```bash
npx prisma validate
npm run build
npm run lint
npm test -- --runInBand --watchman=false
```

## Security behavior

- RS256 access tokens expire after 15 minutes.
- Refresh tokens are opaque, SHA-256 hashed, rotated on use, and replay
  revokes all active sessions for the user.
- ADMIN sessions require self authentication and `web_admin` client type.
- Inspector and supervisor zone/agency scope comes only from JWT claims.
- Mutating endpoints are captured by the global audit interceptor with
  password, token, TOTP, and secret fields redacted.
- RNG4 licenses always have `expireDate = null`; non-payment suspends them.
