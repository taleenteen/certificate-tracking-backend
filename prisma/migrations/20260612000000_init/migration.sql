-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'PENDING_REVIEW', 'APPROVED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED', 'PENDING');

-- CreateEnum
CREATE TYPE "ReportResult" AS ENUM ('PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('self', 'tang_rat');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('app', 'web_admin');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'LINE', 'SMS');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "Agency" AS ENUM ('DIW', 'ACFS');

-- CreateTable
CREATE TABLE "system_users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(50),
    "password_hash" VARCHAR(255),
    "email" VARCHAR(150),
    "full_name" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(20),
    "roles" TEXT[] DEFAULT ARRAY['public']::TEXT[],
    "agency" "Agency",
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "juristic_person_id" UUID,
    "last_login_at" TIMESTAMPTZ,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "totp_secret" VARCHAR(64),
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "system_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name_th" VARCHAR(200) NOT NULL,
    "province" VARCHAR(100) NOT NULL,
    "boundary" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_zones" (
    "user_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_zones_pkey" PRIMARY KEY ("user_id","zone_id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(255) NOT NULL,
    "access_token_jti" UUID NOT NULL,
    "auth_provider" "AuthProvider" NOT NULL,
    "client_type" "ClientType" NOT NULL DEFAULT 'app',
    "tang_rat_sub" VARCHAR(200),
    "tang_rat_token" TEXT,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "device_fingerprint" VARCHAR(255),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "last_used_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "revoked_at" TIMESTAMPTZ,
    "revoke_reason" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_provider_links" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "provider_sub" VARCHAR(200) NOT NULL,
    "provider_email" VARCHAR(150),
    "provider_name" VARCHAR(200),
    "linked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "auth_provider_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "juristic_persons" (
    "id" UUID NOT NULL,
    "registration_id" VARCHAR(20) NOT NULL,
    "name_th" VARCHAR(300) NOT NULL,
    "name_en" VARCHAR(300),
    "juristic_type" VARCHAR(50),
    "address" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "juristic_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" UUID NOT NULL,
    "name_th" VARCHAR(300) NOT NULL,
    "juristic_person_id" UUID,
    "owner_user_id" UUID,
    "zone_id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "province" VARCHAR(100) NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "geocoded_at" TIMESTAMPTZ,
    "phone" VARCHAR(20),
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name_th" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(200),
    "agency" "Agency" NOT NULL,
    "validity_years" INTEGER NOT NULL DEFAULT 1,
    "fee_thb" DECIMAL(10,2),
    "renewal_fee_thb" DECIMAL(10,2),
    "requires_inspection" BOOLEAN NOT NULL DEFAULT true,
    "suspended_on_nonpayment" BOOLEAN NOT NULL DEFAULT false,
    "required_documents" JSONB,
    "prerequisite_type_ids" UUID[],
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "license_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licenses" (
    "id" UUID NOT NULL,
    "license_no" VARCHAR(50) NOT NULL,
    "business_id" UUID NOT NULL,
    "license_type_id" UUID NOT NULL,
    "status" "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "issue_date" DATE NOT NULL,
    "expire_date" DATE,
    "suspended_at" TIMESTAMPTZ,
    "suspension_reason" TEXT,
    "renewed_from_id" UUID,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_documents" (
    "id" UUID NOT NULL,
    "license_id" UUID,
    "inspection_report_id" UUID,
    "doc_type" VARCHAR(30) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" UUID NOT NULL,
    "license_type_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name_th" VARCHAR(200) NOT NULL,
    "items" JSONB NOT NULL,
    "passing_score" INTEGER NOT NULL DEFAULT 70,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_tasks" (
    "id" UUID NOT NULL,
    "task_no" VARCHAR(30) NOT NULL,
    "business_id" UUID NOT NULL,
    "license_id" UUID,
    "zone_id" UUID NOT NULL,
    "assigned_to" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'ASSIGNED',
    "due_date" DATE,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "inspection_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_reports" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "inspector_id" UUID NOT NULL,
    "checklist_template_id" UUID,
    "result" "ReportResult",
    "score" INTEGER,
    "findings" JSONB,
    "summary_note" TEXT,
    "is_draft" BOOLEAN NOT NULL DEFAULT true,
    "submitted_at" TIMESTAMPTZ,
    "review_comment" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "pdf_object_key" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "inspection_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "type" VARCHAR(40) NOT NULL,
    "title_th" VARCHAR(200) NOT NULL,
    "body_th" TEXT NOT NULL,
    "ref_type" VARCHAR(40),
    "ref_id" UUID,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(30) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID,
    "before_value" JSONB,
    "after_value" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" UUID NOT NULL,
    "agency" "Agency" NOT NULL,
    "triggered_by" UUID,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "records_updated" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,
    "error_message" TEXT,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_users_username_key" ON "system_users"("username");

-- CreateIndex
CREATE INDEX "system_users_agency_idx" ON "system_users"("agency");

-- CreateIndex
CREATE UNIQUE INDEX "zones_code_key" ON "zones"("code");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refresh_token_hash_key" ON "user_sessions"("refresh_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_access_token_jti_key" ON "user_sessions"("access_token_jti");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_is_revoked_idx" ON "user_sessions"("user_id", "is_revoked");

-- CreateIndex
CREATE INDEX "auth_provider_links_user_id_idx" ON "auth_provider_links"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_provider_links_provider_provider_sub_key" ON "auth_provider_links"("provider", "provider_sub");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "juristic_persons_registration_id_key" ON "juristic_persons"("registration_id");

-- CreateIndex
CREATE INDEX "businesses_zone_id_idx" ON "businesses"("zone_id");

-- CreateIndex
CREATE INDEX "businesses_province_idx" ON "businesses"("province");

-- CreateIndex
CREATE UNIQUE INDEX "license_types_code_key" ON "license_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "licenses_license_no_key" ON "licenses"("license_no");

-- CreateIndex
CREATE INDEX "licenses_business_id_idx" ON "licenses"("business_id");

-- CreateIndex
CREATE INDEX "licenses_license_type_id_idx" ON "licenses"("license_type_id");

-- CreateIndex
CREATE INDEX "licenses_status_expire_date_idx" ON "licenses"("status", "expire_date");

-- CreateIndex
CREATE INDEX "license_documents_license_id_idx" ON "license_documents"("license_id");

-- CreateIndex
CREATE INDEX "license_documents_inspection_report_id_idx" ON "license_documents"("inspection_report_id");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_templates_license_type_id_version_key" ON "checklist_templates"("license_type_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_tasks_task_no_key" ON "inspection_tasks"("task_no");

-- CreateIndex
CREATE INDEX "inspection_tasks_assigned_to_status_idx" ON "inspection_tasks"("assigned_to", "status");

-- CreateIndex
CREATE INDEX "inspection_tasks_zone_id_status_idx" ON "inspection_tasks"("zone_id", "status");

-- CreateIndex
CREATE INDEX "inspection_reports_task_id_idx" ON "inspection_reports"("task_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_is_read_idx" ON "notifications"("recipient_id", "is_read");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "sync_logs_agency_started_at_idx" ON "sync_logs"("agency", "started_at");

-- AddForeignKey
ALTER TABLE "system_users" ADD CONSTRAINT "system_users_juristic_person_id_fkey" FOREIGN KEY ("juristic_person_id") REFERENCES "juristic_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_zones" ADD CONSTRAINT "user_zones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "system_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_zones" ADD CONSTRAINT "user_zones_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "system_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_provider_links" ADD CONSTRAINT "auth_provider_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "system_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "system_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_juristic_person_id_fkey" FOREIGN KEY ("juristic_person_id") REFERENCES "juristic_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "system_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_license_type_id_fkey" FOREIGN KEY ("license_type_id") REFERENCES "license_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_renewed_from_id_fkey" FOREIGN KEY ("renewed_from_id") REFERENCES "licenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_documents" ADD CONSTRAINT "license_documents_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_documents" ADD CONSTRAINT "license_documents_inspection_report_id_fkey" FOREIGN KEY ("inspection_report_id") REFERENCES "inspection_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_license_type_id_fkey" FOREIGN KEY ("license_type_id") REFERENCES "license_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_tasks" ADD CONSTRAINT "inspection_tasks_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_tasks" ADD CONSTRAINT "inspection_tasks_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_tasks" ADD CONSTRAINT "inspection_tasks_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_tasks" ADD CONSTRAINT "inspection_tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "system_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_tasks" ADD CONSTRAINT "inspection_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "system_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "inspection_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "system_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "system_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_checklist_template_id_fkey" FOREIGN KEY ("checklist_template_id") REFERENCES "checklist_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "system_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "system_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "system_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

