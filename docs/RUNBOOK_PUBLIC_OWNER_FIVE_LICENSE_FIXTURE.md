# Public Owner Five-License Fixture Runbook

This one-off fixture creates or updates a dedicated juristic person, one
business, and five document-linked mock licenses for the existing
`public-owner` account. It never calls the destructive Prisma seed command.

## Included license types

- `RNG4`
- `HAZMAT`
- `ACFS_PRODUCER`
- `ACFS_EXPORTER`
- `ACFS_IMPORTER`

The fixture copies the metadata and `LICENSE_CERTIFICATE` document references
from the curated existing mock licenses. The HAZMAT source template is expired,
so its copied status and dates remain expired to match its certificate.

## Ubuntu production procedure

1. Take a database backup through the approved operations procedure.
2. Deploy the API release that contains this script.
3. Rebuild the stack so the `backend` image contains the script. Use the same
   port variables as the normal stack startup; they do not need to be repeated
   for the fixture command.

   ```bash
   PRODUCTION_FRONTEND_PORT=3016 \
     PRODUCTION_BACKEND_PORT=3017 \
     PRODUCTION_DB_PORT=15434 \
     PRODUCTION_MINIO_PORT=19110 \
     PRODUCTION_MINIO_CONSOLE_PORT=19111 \
     sh scripts/production-stack.sh up
   ```

4. Preview the exact target without writing data. The command runs inside the
   `backend` service, which already uses the Docker-internal `DATABASE_URL`
   (`db:5432`), not the host database port.

   ```bash
   docker compose --env-file .env --env-file ../certificate-tracking/.env \
     -f docker-compose.production.yml exec -T backend \
     npm run fixture:public-owner-five-licenses
   ```

5. Apply only after reviewing the preview:

   ```bash
   docker compose --env-file .env --env-file ../certificate-tracking/.env \
     -f docker-compose.production.yml exec -T \
     -e NODE_ENV=production \
     -e CONFIRM_PUBLIC_OWNER_FIXTURE=true \
     backend npm run fixture:public-owner-five-licenses -- --apply
   ```

   Or use the one-command production-stack shortcut. It rebuilds only the
   backend image, then applies the fixture; the frontend and persistent data
   are not reset:

   ```bash
   PRODUCTION_FRONTEND_PORT=3016 \
     PRODUCTION_BACKEND_PORT=3017 \
     PRODUCTION_DB_PORT=15434 \
     PRODUCTION_MINIO_PORT=19110 \
     PRODUCTION_MINIO_CONSOLE_PORT=19111 \
     sh scripts/production-stack.sh fixture-public-owner-five-licenses
   ```

   This is the one-command apply path. It still executes inside the backend
   container and supplies the production confirmation variables itself.

6. Sign in as `public-owner`, select the new juristic context, and confirm the
   five licenses and their PDF previews are visible.

## Idempotency and safety

- The juristic registration ID, business name, and target license numbers are
  fixed fixture identifiers.
- Re-running the apply command updates the membership/business owner and adds
  only missing license documents; it does not reset or delete database rows.
- In production the confirmation environment variable is mandatory.
- Do not run `npm run prisma:seed` on an existing server database.

## Visibility checks

- Public license search matches the fixture business name, juristic company
  name, and each fixture license number.
- The e-Map includes the fixture because its business has latitude/longitude
  and at least one active license.
