#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
until npx prisma migrate deploy; do
  echo "[entrypoint] Migration failed — DB not ready? Retrying in 3s..."
  sleep 3
done
echo "[entrypoint] Migrations applied."

# Check if seed is needed using pg directly (avoids Prisma adapter setup)
SEED_NEEDED=$(node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT COUNT(*) AS n FROM system_users')
  .then(r => { console.log(r.rows[0].n === '0' ? 'yes' : 'no'); pool.end(); })
  .catch(() => { console.log('yes'); pool.end(); });
")

if [ "$SEED_NEEDED" = "yes" ]; then
  echo "[entrypoint] Empty database detected — running seed..."
  npx ts-node -r tsconfig-paths/register prisma/seed.ts
  echo "[entrypoint] Seed complete. Default admin password: ChangeMe-2026!"
else
  echo "[entrypoint] Database already seeded — skipping."
fi

exec "$@"
