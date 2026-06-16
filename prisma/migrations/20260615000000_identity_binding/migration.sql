-- +goose Up
-- Create new enum for profile origin channel (Tang Rat is primary)
CREATE TYPE "ProfileChannel" AS ENUM ('domain', 'tang_rat');

-- Extend SystemUser with verified citizen identity (HMAC only, Tang Rat source of truth per D5)
ALTER TABLE "system_users" ADD COLUMN "citizen_id_hash" VARCHAR(64);
ALTER TABLE "system_users" ADD COLUMN "citizen_id_verified_at" TIMESTAMPTZ;
ALTER TABLE "system_users" ADD COLUMN "citizen_id_last4" VARCHAR(4);
ALTER TABLE "system_users" ADD COLUMN "primary_channel" "ProfileChannel" NOT NULL DEFAULT 'domain';

-- Unique index on citizen hash (nullable: allows many nulls, one non-null per value)
CREATE UNIQUE INDEX "system_users_citizen_id_hash_key" ON "system_users"("citizen_id_hash");

-- Extend AuthProviderLink with phone + verification timestamp (from Tang Rat)
ALTER TABLE "auth_provider_links" ADD COLUMN "provider_phone" VARCHAR(20);
ALTER TABLE "auth_provider_links" ADD COLUMN "verified_at" TIMESTAMPTZ;

-- New table for link/merge proof challenges (D5; used for async if needed, created for compat)
CREATE TABLE "account_link_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "initiator_id" UUID NOT NULL,
    "target_id" UUID,
    "method" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "confirmed_at" TIMESTAMPTZ,

    CONSTRAINT "account_link_challenges_pkey" PRIMARY KEY ("id")
);

-- Index + FK (cascade on initiator delete)
CREATE INDEX "account_link_challenges_initiator_id_idx" ON "account_link_challenges"("initiator_id");
ALTER TABLE "account_link_challenges" ADD CONSTRAINT "account_link_challenges_initiator_id_fkey" FOREIGN KEY ("initiator_id") REFERENCES "system_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add relation back to SystemUser (no column change; Prisma manages via relation table metadata)
-- (The linkChallenges field is virtual via the FK above.)

