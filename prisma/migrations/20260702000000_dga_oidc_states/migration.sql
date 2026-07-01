CREATE TABLE "dga_oidc_states" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "nonce" VARCHAR(64) NOT NULL,
  "state_hash" VARCHAR(64) NOT NULL,
  "redirect_uri" TEXT NOT NULL,
  "scope" VARCHAR(200) NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "consumed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dga_oidc_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dga_oidc_states_nonce_key" ON "dga_oidc_states"("nonce");
CREATE UNIQUE INDEX "dga_oidc_states_state_hash_key" ON "dga_oidc_states"("state_hash");
CREATE INDEX "dga_oidc_states_expires_at_idx" ON "dga_oidc_states"("expires_at");
CREATE INDEX "dga_oidc_states_consumed_at_idx" ON "dga_oidc_states"("consumed_at");
