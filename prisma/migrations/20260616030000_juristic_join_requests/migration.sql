-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "juristic_join_requests" (
    "id" UUID NOT NULL,
    "juristic_person_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_first_owner_claim" BOOLEAN NOT NULL DEFAULT false,
    "requested_role" "JuristicRole" NOT NULL DEFAULT 'MEMBER',
    "requested_position" VARCHAR(100),
    "message" TEXT,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "granted_role" "JuristicRole",
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "review_note" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "juristic_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "juristic_join_requests_juristic_person_id_status_idx" ON "juristic_join_requests"("juristic_person_id", "status");

-- CreateIndex
CREATE INDEX "juristic_join_requests_user_id_status_idx" ON "juristic_join_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "juristic_join_requests_status_is_first_owner_claim_idx" ON "juristic_join_requests"("status", "is_first_owner_claim");

-- Partial unique index: only one PENDING request per (company, user).
-- Prisma cannot declare partial indexes so this is added manually here.
CREATE UNIQUE INDEX "uniq_pending_join" ON "juristic_join_requests" ("juristic_person_id", "user_id") WHERE status = 'PENDING';

-- AddForeignKey
ALTER TABLE "juristic_join_requests" ADD CONSTRAINT "juristic_join_requests_juristic_person_id_fkey" FOREIGN KEY ("juristic_person_id") REFERENCES "juristic_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "juristic_join_requests" ADD CONSTRAINT "juristic_join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "system_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "juristic_join_requests" ADD CONSTRAINT "juristic_join_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "system_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
