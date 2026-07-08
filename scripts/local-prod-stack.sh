#!/bin/sh
set -eu

COMPOSE_FILE="docker-compose.local-prod.yml"
FRONTEND_ENV="../../Frontend/certificate-tracking/.env"

if [ ! -f ".env" ]; then
  echo "Missing backend .env in $(pwd)" >&2
  exit 1
fi

if [ ! -f "$FRONTEND_ENV" ]; then
  echo "Missing frontend .env at $FRONTEND_ENV" >&2
  exit 1
fi

compose() {
  docker compose --env-file .env --env-file "$FRONTEND_ENV" -f "$COMPOSE_FILE" "$@"
}

case "${1:-up}" in
  up)
    compose up -d --build
    ;;
  verify)
    compose ps
    echo
    echo "Backend health:"
    curl -fsS "http://localhost:${LOCAL_BACKEND_PORT:-3001}/docs-json" >/dev/null
    echo "  OK http://localhost:${LOCAL_BACKEND_PORT:-3001}/docs-json"
    echo
    echo "Frontend health:"
    curl -fsS "http://localhost:${LOCAL_FRONTEND_PORT:-3003}" >/dev/null
    echo "  OK http://localhost:${LOCAL_FRONTEND_PORT:-3003}"
    echo
    echo "Seed counts:"
    compose exec -T db psql -U elicense -d elicense -c "
      SELECT 'system_users' AS table_name, COUNT(*)::int AS count FROM system_users
      UNION ALL SELECT 'businesses', COUNT(*)::int FROM businesses
      UNION ALL SELECT 'licenses', COUNT(*)::int FROM licenses
      UNION ALL SELECT 'license_types', COUNT(*)::int FROM license_types
      UNION ALL SELECT 'officer_inspections', COUNT(*)::int FROM officer_inspections
      ORDER BY table_name;
    "
    echo
    echo "RNG4 invariant:"
    compose exec -T db psql -U elicense -d elicense -c "
      SELECT COUNT(*)::int AS rng4_rows_with_expire_date
      FROM licenses l
      JOIN license_types lt ON lt.id = l.license_type_id
      WHERE lt.code = 'RNG4' AND l.expire_date IS NOT NULL;
    "
    ;;
  logs)
    compose logs -f "${2:-}"
    ;;
  down)
    compose down
    ;;
  reset)
    compose down -v
    ;;
  *)
    echo "Usage: sh scripts/local-prod-stack.sh [up|verify|logs|down|reset]" >&2
    exit 1
    ;;
esac
