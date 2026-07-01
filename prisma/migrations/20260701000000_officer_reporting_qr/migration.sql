CREATE TYPE "OfficerInspectionStatus" AS ENUM ('SUBMITTED', 'EXPORTED', 'VOIDED');
CREATE TYPE "OfficerInspectionItemResult" AS ENUM ('PASSED', 'FAILED', 'NEEDS_FOLLOW_UP', 'NOTE_ONLY');
CREATE TYPE "OfficerProfileScanResult" AS ENUM ('VALID', 'INACTIVE', 'NOT_OFFICER', 'EXPIRED_TOKEN', 'INVALID_TOKEN');

CREATE TABLE "officer_inspections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "inspection_no" VARCHAR(30) NOT NULL,
  "officer_id" UUID NOT NULL,
  "business_id" UUID NOT NULL,
  "juristic_person_id" UUID,
  "agency_id" UUID NOT NULL,
  "officer_snapshot" JSONB NOT NULL,
  "business_snapshot" JSONB NOT NULL,
  "status" "OfficerInspectionStatus" NOT NULL DEFAULT 'SUBMITTED',
  "summary_note" TEXT,
  "inspected_at" TIMESTAMPTZ NOT NULL,
  "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "exported_at" TIMESTAMPTZ,
  "pdf_object_key" VARCHAR(500),
  "xlsx_object_key" VARCHAR(500),
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "officer_inspections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "officer_inspection_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "inspection_id" UUID NOT NULL,
  "license_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "result" "OfficerInspectionItemResult" NOT NULL,
  "detail_note" TEXT,
  "findings" JSONB,
  "license_snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "officer_inspection_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "officer_inspection_evidence" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "inspection_item_id" UUID NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "object_key" VARCHAR(500) NOT NULL,
  "mime_type" VARCHAR(100) NOT NULL,
  "file_size_bytes" INTEGER NOT NULL,
  "uploaded_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "officer_inspection_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "officer_public_profile_scan_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "officer_id" UUID,
  "scanned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip_address" VARCHAR(45),
  "user_agent" TEXT,
  "qr_token_id" VARCHAR(64),
  "result" "OfficerProfileScanResult" NOT NULL,

  CONSTRAINT "officer_public_profile_scan_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "officer_inspections_inspection_no_key" ON "officer_inspections"("inspection_no");
CREATE INDEX "officer_inspections_officer_id_submitted_at_idx" ON "officer_inspections"("officer_id", "submitted_at");
CREATE INDEX "officer_inspections_business_id_submitted_at_idx" ON "officer_inspections"("business_id", "submitted_at");
CREATE INDEX "officer_inspections_juristic_person_id_submitted_at_idx" ON "officer_inspections"("juristic_person_id", "submitted_at");
CREATE INDEX "officer_inspections_agency_id_submitted_at_idx" ON "officer_inspections"("agency_id", "submitted_at");

CREATE UNIQUE INDEX "officer_inspection_items_inspection_id_license_id_key" ON "officer_inspection_items"("inspection_id", "license_id");
CREATE INDEX "officer_inspection_items_license_id_idx" ON "officer_inspection_items"("license_id");

CREATE INDEX "officer_inspection_evidence_inspection_item_id_idx" ON "officer_inspection_evidence"("inspection_item_id");
CREATE INDEX "officer_inspection_evidence_uploaded_by_created_at_idx" ON "officer_inspection_evidence"("uploaded_by", "created_at");

CREATE INDEX "officer_public_profile_scan_logs_officer_id_scanned_at_idx" ON "officer_public_profile_scan_logs"("officer_id", "scanned_at");
CREATE INDEX "officer_public_profile_scan_logs_qr_token_id_scanned_at_idx" ON "officer_public_profile_scan_logs"("qr_token_id", "scanned_at");

ALTER TABLE "officer_inspections" ADD CONSTRAINT "officer_inspections_officer_id_fkey" FOREIGN KEY ("officer_id") REFERENCES "system_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "officer_inspections" ADD CONSTRAINT "officer_inspections_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "officer_inspections" ADD CONSTRAINT "officer_inspections_juristic_person_id_fkey" FOREIGN KEY ("juristic_person_id") REFERENCES "juristic_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "officer_inspections" ADD CONSTRAINT "officer_inspections_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "officer_inspection_items" ADD CONSTRAINT "officer_inspection_items_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "officer_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "officer_inspection_items" ADD CONSTRAINT "officer_inspection_items_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "officer_inspection_evidence" ADD CONSTRAINT "officer_inspection_evidence_inspection_item_id_fkey" FOREIGN KEY ("inspection_item_id") REFERENCES "officer_inspection_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "officer_inspection_evidence" ADD CONSTRAINT "officer_inspection_evidence_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "system_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "officer_public_profile_scan_logs" ADD CONSTRAINT "officer_public_profile_scan_logs_officer_id_fkey" FOREIGN KEY ("officer_id") REFERENCES "system_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
