ALTER TABLE "inspection_tasks" DROP CONSTRAINT IF EXISTS "inspection_tasks_zone_id_fkey";
ALTER TABLE "businesses" DROP CONSTRAINT IF EXISTS "businesses_zone_id_fkey";
ALTER TABLE "user_zones" DROP CONSTRAINT IF EXISTS "user_zones_user_id_fkey";
ALTER TABLE "user_zones" DROP CONSTRAINT IF EXISTS "user_zones_zone_id_fkey";

DROP INDEX IF EXISTS "inspection_tasks_zone_id_status_idx";
DROP INDEX IF EXISTS "businesses_zone_id_idx";

ALTER TABLE "inspection_tasks" DROP COLUMN IF EXISTS "zone_id";
ALTER TABLE "businesses" DROP COLUMN IF EXISTS "zone_id";

DROP TABLE IF EXISTS "user_zones";
DROP TABLE IF EXISTS "zones";
