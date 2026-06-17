#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
until npx prisma migrate deploy; do
  echo "[entrypoint] Migration failed — DB not ready? Retrying in 3s..."
  sleep 3
done
echo "[entrypoint] Migrations applied."

# Seed only if the table is empty (idempotent — safe to restart)
SEED_NEEDED=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.systemUser.count()
  .then(n => { console.log(n === 0 ? 'yes' : 'no'); return p.\$disconnect(); })
  .catch(() => { console.log('yes'); process.exit(0); });
")

if [ "$SEED_NEEDED" = "yes" ]; then
  echo "[entrypoint] Empty database detected — running seed..."
  npx ts-node prisma/seed.ts
  echo "[entrypoint] Seed complete. Default admin password: ChangeMe-2026!"
else
  echo "[entrypoint] Database already seeded — skipping."
fi

exec "$@"
