-- Rename the citizen ID column to clean name (citizen_id) per owner-authorized exception to Golden Rule.
-- This makes the schema clearer for DBAs: the column now obviously holds the ID, not a "hash".

ALTER TABLE "system_users" RENAME COLUMN "citizen_id_hash" TO "citizen_id";

-- Rename the corresponding unique index
ALTER INDEX IF EXISTS "system_users_citizen_id_hash_key" RENAME TO "system_users_citizen_id_key";
