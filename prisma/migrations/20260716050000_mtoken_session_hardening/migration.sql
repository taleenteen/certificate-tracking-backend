CREATE TYPE "SessionAuthFlow" AS ENUM ('PASSWORD', 'ADMIN_PORTAL', 'OIDC', 'MTOKEN');

ALTER TABLE "user_sessions"
  ADD COLUMN "auth_flow" "SessionAuthFlow" NOT NULL DEFAULT 'PASSWORD';

UPDATE "user_sessions"
SET "auth_flow" = CASE
  WHEN "auth_provider" = 'tang_rat' AND "provider_id_token" IS NOT NULL THEN 'OIDC'::"SessionAuthFlow"
  WHEN "auth_provider" = 'tang_rat' THEN 'MTOKEN'::"SessionAuthFlow"
  WHEN "client_type" = 'web_admin' THEN 'ADMIN_PORTAL'::"SessionAuthFlow"
  ELSE 'PASSWORD'::"SessionAuthFlow"
END;

CREATE INDEX "user_sessions_user_id_auth_flow_is_revoked_idx"
  ON "user_sessions"("user_id", "auth_flow", "is_revoked");
