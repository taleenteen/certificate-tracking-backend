#!/bin/sh
set -e

echo "[entrypoint] Waiting for database to be ready..."
# Prisma migrate deploy will wait and retry if DB isn't up yet
until npx prisma migrate deploy; do
  echo "[entrypoint] Migration failed, retrying in 3s..."
  sleep 3
done
echo "[entrypoint] Migrations applied."

# Seed only if the database is empty (check system_users row count).
SEED_NEEDED=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.systemUser.count()
  .then(n => { console.log(n === 0 ? 'yes' : 'no'); return p.\$disconnect(); })
  .catch(() => { console.log('yes'); process.exit(0); });
")

if [ "\$SEED_NEEDED" = "yes" ]; then
  echo "[entrypoint] Empty database detected — running seed..."
  npx ts-node prisma/seed.ts
  echo "[entrypoint] Seed complete. Admin password: ChangeMe-2026!"
else
  echo "[entrypoint] Database already seeded — skipping."
fi

exec "\$@"
