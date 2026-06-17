-- CreateEnum
CREATE TYPE "AgencyDataSource" AS ENUM ('API', 'MANUAL_IMPORT');
CREATE TYPE "AgencyApiStatus" AS ENUM ('CONNECTED', 'MANUAL', 'DISCONNECTED');

-- CreateTable agencies
CREATE TABLE "agencies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(20) NOT NULL,
    "name_th" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(200),
    "data_source" "AgencyDataSource" NOT NULL DEFAULT 'MANUAL_IMPORT',
    "api_status" "AgencyApiStatus" NOT NULL DEFAULT 'MANUAL',
    "last_synced_at" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agencies_code_key" ON "agencies"("code");

-- Seed the two existing agencies
INSERT INTO "agencies" ("code", "name_th", "name_en", "data_source", "api_status")
VALUES
    ('DIW',  'กรมโรงงานอุตสาหกรรม', 'Department of Industrial Works', 'MANUAL_IMPORT', 'MANUAL'),
    ('ACFS', 'สำนักงานมาตรฐานสินค้าเกษตรและอาหารแห่งชาติ', 'National Bureau of Agricultural Commodity and Food Standards', 'API', 'CONNECTED');

-- Add nullable agencyId FK columns
ALTER TABLE "system_users" ADD COLUMN "agency_id" UUID;
ALTER TABLE "license_types" ADD COLUMN "agency_id" UUID;
ALTER TABLE "sync_logs"     ADD COLUMN "agency_id" UUID;

-- Backfill from the old enum values
UPDATE "system_users" su
SET "agency_id" = a."id"
FROM "agencies" a
WHERE su."agency"::text = a."code"
  AND su."agency" IS NOT NULL;

UPDATE "license_types" lt
SET "agency_id" = a."id"
FROM "agencies" a
WHERE lt."agency"::text = a."code";

UPDATE "sync_logs" sl
SET "agency_id" = a."id"
FROM "agencies" a
WHERE sl."agency"::text = a."code";

-- Set NOT NULL where required (license_types and sync_logs had non-nullable agency)
ALTER TABLE "license_types" ALTER COLUMN "agency_id" SET NOT NULL;
ALTER TABLE "sync_logs"     ALTER COLUMN "agency_id" SET NOT NULL;

-- Drop old enum columns
ALTER TABLE "system_users" DROP COLUMN "agency";
ALTER TABLE "license_types" DROP COLUMN "agency";
ALTER TABLE "sync_logs"     DROP COLUMN "agency";

-- Drop old enum type
DROP TYPE "Agency";

-- Add FK constraints
ALTER TABLE "system_users"  ADD CONSTRAINT "system_users_agency_id_fkey"   FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE SET NULL  ON UPDATE CASCADE;
ALTER TABLE "license_types" ADD CONSTRAINT "license_types_agency_id_fkey"  FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sync_logs"     ADD CONSTRAINT "sync_logs_agency_id_fkey"      FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add indexes
CREATE INDEX "system_users_agency_id_idx"           ON "system_users"("agency_id");
CREATE INDEX "license_types_agency_id_idx"          ON "license_types"("agency_id");
CREATE INDEX "sync_logs_agency_id_started_at_idx"   ON "sync_logs"("agency_id", "started_at");
