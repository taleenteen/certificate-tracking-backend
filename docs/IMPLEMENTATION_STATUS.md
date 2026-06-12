# Implementation Status

Last reviewed: June 12, 2026

This document summarizes what has been implemented compared with
`IMPLEMENTATION_GUIDE_1.md`.

## Overall Status

The backend prototype is substantially implemented, but the full platform is
not complete.

The repository currently contains:

- A NestJS backend API
- PostgreSQL Prisma schema and migration
- Mock seed data
- Docker configuration for the API, PostgreSQL, MinIO, and nginx
- Authentication, licensing, inspection, user management, sync, dashboard,
  notification, audit, export, and cron modules

The repository does not contain:

- The Next.js mobile/user application
- The Nuxt administrator portal
- Full database-backed integration tests
- A verified clean-clone Docker startup

## What Is Implemented

### Database

- All 17 required tables and enums are represented in Prisma.
- An initial PostgreSQL migration exists.
- Mock seed data covers users, zones, businesses, license types, licenses,
  inspection tasks, reports, notifications, and sync history.
- RNG4 licenses are designed with no expiry date.

The migration and seed compile, but they have not yet been run against a real
PostgreSQL container.

### Authentication and Security

- Tang Rat mock login for public users, inspectors, and supervisors
- Username, password, and TOTP login for administrators
- RS256 access tokens
- Hashed and rotating refresh tokens
- Account lockout after repeated failed login attempts
- Role, client type, JWT, and scope guards
- Helmet, CORS allowlist, validation, nginx rate limiting, and API throttling
- Audit response redaction for passwords, tokens, TOTP values, and secrets

Security work still required:

- Database-backed refresh-token replay tests
- Cross-zone and cross-agency authorization tests
- Reliable audit writes for every mutation
- Global soft-delete filtering
- Verified private MinIO bucket configuration

### Public License Functions

- License type listing
- Business search and details
- Map data in GeoJSON format
- License detail and QR verification
- Personal and juristic-person license lookup
- Notification list and read actions

### Inspection Workflow

The main task state flow is implemented:

```text
ASSIGNED -> IN_PROGRESS -> PENDING_REVIEW -> APPROVED
                                 |
                                 -> RETURNED -> PENDING_REVIEW

ASSIGNED or IN_PROGRESS -> CANCELLED
```

The backend also includes:

- Inspector eligibility checks
- Zone and agency checks
- Conflict-of-interest rejection
- Draft inspection reports
- Evidence upload and deletion
- Supervisor approval and return
- License suspension after a failed inspection
- License reactivation after a passed inspection
- Inspector and supervisor notifications

### Administration and Operations

- User creation, role changes, agency changes, and zone assignment
- User suspension and soft deletion
- Zone listing, creation, and updates
- ACFS mock synchronization
- DIW CSV import
- Sync status
- Audit log listing
- PDF and Excel exports
- License expiration cron job
- RNG4 annual-fee mock cron job
- Expired-session cleanup

## Known Differences From the Guide

1. The planned monorepo structure is not present. The backend is at the
   repository root.
2. The Next.js and Nuxt applications have not been created.
3. PDF export currently uses PDFKit and direct streaming. The guide requires
   Puppeteer rendering, MinIO storage, and a presigned URL.
4. The global Prisma soft-delete behavior required by the guide is missing.
5. Audit writes are currently asynchronous and are not guaranteed to finish
   before the API response.
6. Some required security tests exist only as unit tests or are missing.
7. PostgreSQL, MinIO, migrations, seed data, and full workflows have not been
   exercised together.

## Verification Completed

The following checks passed in a clean temporary dependency environment:

- Prisma schema validation
- TypeScript build
- ESLint
- 3 test suites
- 6 tests

The local repository's existing `node_modules` directory is root-owned, so
dependencies could not be refreshed in place. This must be corrected before
normal local development.

## Recommended Next Milestone

The next milestone is to make the backend demonstrably runnable:

1. Install dependencies cleanly.
2. Start PostgreSQL and MinIO.
3. Apply the migration and run the seed.
4. Verify all required seed counts.
5. Add database-backed security and inspection tests.
6. Fix audit reliability and soft-delete filtering.
7. Build the Next.js user application.
8. Build the Nuxt administrator portal.

For detailed continuation instructions, see
`docs/IMPLEMENTATION_STATUS_AI.md`.
