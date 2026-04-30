-- Provider membership plan benefits (matches mobile/web UI chip lists).
ALTER TABLE membership_plans
  ADD COLUMN IF NOT EXISTS benefits JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN membership_plans.benefits IS 'Human-readable benefit strings shown to customers (UI-managed).';

CREATE INDEX IF NOT EXISTS idx_user_memberships_provider_plan_status
  ON user_memberships (provider_id, plan_id, status)
  WHERE status = 'active';
