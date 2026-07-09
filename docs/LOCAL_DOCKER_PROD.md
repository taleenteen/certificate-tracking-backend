# Local Production-Like Docker Stack

This stack proves that the backend and frontend can build as Docker images,
start together, run migrations, seed mock data, create the MinIO bucket, and
serve the Next.js app through its BFF.

It does **not** require `.env.local`. It reads:

- backend: `.env`
- frontend: `../../Frontend/certificate-tracking/.env`

## Start

From `/Users/mac/Backend/certificate-tracking-backend`:

```bash
sh scripts/local-prod-stack.sh up
```

For the prototype/demo production-named stack, use:

```bash
sh scripts/production-stack.sh up
```

That stack uses `docker-compose.production.yml`, the same `.env` files, and the
same HTTP-friendly prototype behavior, but Docker resources are named
`certificate-tracking-production`.

Verified on 2026-07-08 with alternate ports:

```bash
PRODUCTION_FRONTEND_PORT=3403 PRODUCTION_BACKEND_PORT=3401 PRODUCTION_DB_PORT=15433 PRODUCTION_MINIO_PORT=19100 PRODUCTION_MINIO_CONSOLE_PORT=19101 sh scripts/production-stack.sh up
PRODUCTION_FRONTEND_PORT=3403 PRODUCTION_BACKEND_PORT=3401 PRODUCTION_DB_PORT=15433 PRODUCTION_MINIO_PORT=19100 PRODUCTION_MINIO_CONSOLE_PORT=19101 sh scripts/production-stack.sh verify
```

Results: backend/frontend images built, all four containers became healthy,
seed counts were present, and the RNG4 invariant returned zero violations.

Open:

- Frontend: http://localhost:3003
- Backend Swagger JSON: http://localhost:3001/docs-json
- MinIO console: http://localhost:9001

## Verify Seed And Health

```bash
sh scripts/local-prod-stack.sh verify
```

For the production-named stack:

```bash
sh scripts/production-stack.sh verify
```

The verify command checks:

- frontend HTTP response
- backend `/docs-json` response
- seed row counts for core tables
- RNG4 invariant: `expire_date` must stay null

## Verified Locally

Last verified: 2026-07-08 with alternate ports to avoid the normal dev stack:

```bash
LOCAL_FRONTEND_PORT=3303 LOCAL_BACKEND_PORT=3301 LOCAL_DB_PORT=15432 LOCAL_MINIO_PORT=19000 LOCAL_MINIO_CONSOLE_PORT=19001 sh scripts/local-prod-stack.sh up
LOCAL_FRONTEND_PORT=3303 LOCAL_BACKEND_PORT=3301 LOCAL_DB_PORT=15432 LOCAL_MINIO_PORT=19000 LOCAL_MINIO_CONSOLE_PORT=19001 sh scripts/local-prod-stack.sh verify
```

Results:

- backend Docker image built successfully
- frontend Docker image built successfully
- PostgreSQL, MinIO, backend, and frontend containers became healthy
- `businesses=21`, `license_types=9`, `licenses=45`, `system_users=11`
- RNG4 invariant returned `0` rows with `expire_date`
- `POST http://localhost:3303/api/auth/register` through the frontend BFF
  returned `201` and created a new `public` user in Docker Postgres

## Logs

```bash
sh scripts/local-prod-stack.sh logs backend
sh scripts/local-prod-stack.sh logs frontend
```

## Stop Or Reset

Stop without deleting data:

```bash
sh scripts/local-prod-stack.sh down
```

Delete local Docker seed data and MinIO files:

```bash
sh scripts/local-prod-stack.sh reset
```

On the next `up`, the backend runs `prisma migrate deploy` and seeds again
because the Postgres volume is empty.

## Port Overrides

If your normal dev stack is already using ports, override them for one command:

```bash
LOCAL_FRONTEND_PORT=3303 LOCAL_BACKEND_PORT=3301 LOCAL_DB_PORT=15432 LOCAL_MINIO_PORT=19000 LOCAL_MINIO_CONSOLE_PORT=19001 sh scripts/local-prod-stack.sh up
```

When changing `LOCAL_MINIO_PORT`, browser-visible presigned evidence URLs use
that same port through `MINIO_PUBLIC_ENDPOINT`.

### Ubuntu / remote server: images show as broken (localhost URLs)

Presigned evidence URLs are signed for **`MINIO_PUBLIC_ENDPOINT`**, which the
browser must reach. On a remote host, `http://localhost:…` only works on that
machine — phones/other PCs cannot load the image.

In backend `.env` set the public host **and the published MinIO port** (same as
`PRODUCTION_MINIO_PORT` if you remapped it):

```bash
# Example server 188.166.225.79, MinIO published on 19110
MINIO_PUBLIC_ENDPOINT=http://188.166.225.79:19110
PRODUCTION_MINIO_PORT=19110
```

Then recreate **backend only** (no DB reset, no re-upload of files):

```bash
sh scripts/production-stack.sh up
# or: docker compose -f docker-compose.production.yml up -d --force-recreate backend
```

Also open the MinIO API port on the firewall (`ufw allow 19110/tcp` or your
security group). New API responses will use the public host; existing object
keys in MinIO stay unchanged.
