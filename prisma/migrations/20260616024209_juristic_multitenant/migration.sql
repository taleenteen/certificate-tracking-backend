/*
  Warnings:

  - You are about to drop the column `juristic_person_id` on the `system_users` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "JuristicRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- DropForeignKey
ALTER TABLE "system_users" DROP CONSTRAINT "system_users_juristic_person_id_fkey";

-- AlterTable
ALTER TABLE "account_link_challenges" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "juristic_id" UUID;

-- AlterTable
ALTER TABLE "system_users" DROP COLUMN "juristic_person_id";

-- AlterTable
ALTER TABLE "user_sessions" ADD COLUMN     "active_juristic_id" UUID;

-- CreateTable
CREATE TABLE "juristic_members" (
    "id" UUID NOT NULL,
    "juristic_person_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "JuristicRole" NOT NULL DEFAULT 'MEMBER',
    "position" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "invited_by_id" UUID,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "juristic_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "juristic_invites" (
    "id" UUID NOT NULL,
    "juristic_person_id" UUID NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "role" "JuristicRole" NOT NULL DEFAULT 'MEMBER',
    "position" VARCHAR(100),
    "token_hash" VARCHAR(255) NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ NOT NULL,
    "accepted_at" TIMESTAMPTZ,
    "accepted_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "juristic_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "juristic_members_user_id_idx" ON "juristic_members"("user_id");

-- CreateIndex
CREATE INDEX "juristic_members_juristic_person_id_idx" ON "juristic_members"("juristic_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "juristic_members_juristic_person_id_user_id_key" ON "juristic_members"("juristic_person_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "juristic_invites_token_hash_key" ON "juristic_invites"("token_hash");

-- CreateIndex
CREATE INDEX "juristic_invites_juristic_person_id_idx" ON "juristic_invites"("juristic_person_id");

-- CreateIndex
CREATE INDEX "juristic_invites_email_idx" ON "juristic_invites"("email");

-- CreateIndex
CREATE INDEX "audit_logs_juristic_id_created_at_idx" ON "audit_logs"("juristic_id", "created_at");

-- AddForeignKey
ALTER TABLE "juristic_members" ADD CONSTRAINT "juristic_members_juristic_person_id_fkey" FOREIGN KEY ("juristic_person_id") REFERENCES "juristic_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "juristic_members" ADD CONSTRAINT "juristic_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "system_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "juristic_members" ADD CONSTRAINT "juristic_members_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "system_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "juristic_invites" ADD CONSTRAINT "juristic_invites_juristic_person_id_fkey" FOREIGN KEY ("juristic_person_id") REFERENCES "juristic_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "juristic_invites" ADD CONSTRAINT "juristic_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "system_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
