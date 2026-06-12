#!/bin/bash
# One-shot local dev startup. Run once; subsequent runs are instant.
# Usage: ./dev.sh
set -e

echo ""
echo "╔══════════════════════════════════╗"
echo "║   E-License Local Dev Setup      ║"
echo "╚══════════════════════════════════╝"
echo ""

# ── 1. node_modules ──────────────────────────────────────────────────────────
if [ ! -d "node_modules/@nestjs" ]; then
  echo "▶ [1/5] Installing npm packages (runs once)..."

  # Remove root-owned node_modules if that's what's blocking
  if [ -d "node_modules" ]; then
    OWNER=$(stat -f '%Su' node_modules 2>/dev/null || stat -c '%U' node_modules 2>/dev/null || echo "unknown")
    if [ "$OWNER" = "root" ]; then
      echo "  Removing root-owned node_modules (needs sudo)..."
      sudo rm -rf node_modules
    fi
  fi

  npm install
  npx prisma generate
  echo "  ✓ Dependencies installed."
else
  echo "✓ [1/5] Dependencies already installed."
fi

# ── 2. .env ──────────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  echo "▶ [2/5] Creating .env from .env.local.example..."
  cp .env.local.example .env
  echo "  ✓ .env created."
else
  echo "✓ [2/5] .env already exists."
fi

# ── 3. Infra (PostgreSQL + MinIO) ─────────────────────────────────────────────
echo "▶ [3/5] Starting PostgreSQL and MinIO..."
docker compose -f docker-compose.infra.yml up -d
echo "  Waiting for PostgreSQL..."
until docker compose -f docker-compose.infra.yml exec -T db pg_isready -U elicense > /dev/null 2>&1; do
  sleep 1
done
echo "  ✓ PostgreSQL ready."

# ── 4. Migrations ─────────────────────────────────────────────────────────────
echo "▶ [4/5] Applying database migrations..."
npx prisma migrate deploy
echo "  ✓ Migrations applied."

# ── 5. Seed (only if empty) ───────────────────────────────────────────────────
SEED_COUNT=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.systemUser.count()
  .then(n => { console.log(n); return p.\$disconnect(); })
  .catch(() => { console.log('0'); process.exit(0); });
" 2>/dev/null || echo "0")

if [ "$SEED_COUNT" = "0" ]; then
  echo "▶ [5/5] Seeding database..."
  npx ts-node prisma/seed.ts
  echo "  ✓ Seed done."
else
  echo "✓ [5/5] Database already seeded ($SEED_COUNT users found)."
fi

# ── Ready ──────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  API        →  http://localhost:3001/api             ║"
echo "║  Via nginx  →  http://localhost/api  (if nginx up)   ║"
echo "║  MinIO UI   →  http://localhost:9001                 ║"
echo "║                (user: elicense / devpassword)        ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Admin login:  superadmin / ChangeMe-2026!           ║"
echo "║  Inspector:    POST /api/auth/tang-rat               ║"
echo "║                { \"mToken\": \"mock-inspector-1\" }      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

npm run start:dev
