CREATE TYPE "LicenseDocumentExportFormat" AS ENUM ('PDF', 'XLSX', 'CSV');
CREATE TYPE "LicenseDocumentExportStatus" AS ENUM ('GENERATING', 'COMPLETED', 'FAILED');

CREATE TABLE "license_document_exports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reference_no" VARCHAR(40) NOT NULL,
  "verification_code" VARCHAR(64) NOT NULL,
  "business_id" UUID NOT NULL,
  "exported_by_user_id" UUID NOT NULL,
  "agency_id" UUID NOT NULL,
  "format" "LicenseDocumentExportFormat" NOT NULL,
  "status" "LicenseDocumentExportStatus" NOT NULL DEFAULT 'GENERATING',
  "source_platform" VARCHAR(40) NOT NULL DEFAULT 'E_LICENSE',
  "file_name" VARCHAR(255),
  "object_key" VARCHAR(500),
  "file_size_bytes" INTEGER,
  "sha256" VARCHAR(64),
  "content_snapshot" JSONB NOT NULL,
  "error_message" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ,

  CONSTRAINT "license_document_exports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "license_document_export_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "export_id" UUID NOT NULL,
  "license_id" UUID NOT NULL,
  "license_document_id" UUID,
  "sequence" INTEGER NOT NULL,
  "license_no_snapshot" VARCHAR(50) NOT NULL,
  "license_type_snapshot" JSONB NOT NULL,
  "document_snapshot" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "license_document_export_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "license_document_exports_reference_no_key" ON "license_document_exports"("reference_no");
CREATE UNIQUE INDEX "license_document_exports_verification_code_key" ON "license_document_exports"("verification_code");
CREATE INDEX "license_document_exports_business_id_created_at_idx" ON "license_document_exports"("business_id", "created_at");
CREATE INDEX "license_document_exports_exported_by_user_id_created_at_idx" ON "license_document_exports"("exported_by_user_id", "created_at");
CREATE INDEX "license_document_exports_agency_id_created_at_idx" ON "license_document_exports"("agency_id", "created_at");
CREATE INDEX "license_document_export_items_export_id_sequence_idx" ON "license_document_export_items"("export_id", "sequence");
CREATE INDEX "license_document_export_items_license_id_idx" ON "license_document_export_items"("license_id");

ALTER TABLE "license_document_exports" ADD CONSTRAINT "license_document_exports_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_document_exports" ADD CONSTRAINT "license_document_exports_exported_by_user_id_fkey" FOREIGN KEY ("exported_by_user_id") REFERENCES "system_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_document_exports" ADD CONSTRAINT "license_document_exports_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_document_export_items" ADD CONSTRAINT "license_document_export_items_export_id_fkey" FOREIGN KEY ("export_id") REFERENCES "license_document_exports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "license_document_export_items" ADD CONSTRAINT "license_document_export_items_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_document_export_items" ADD CONSTRAINT "license_document_export_items_license_document_id_fkey" FOREIGN KEY ("license_document_id") REFERENCES "license_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
