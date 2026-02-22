-- Extend feature_flags for control plane: rollout, platforms, roles, versions, environments
ALTER TABLE feature_flags
  ADD COLUMN IF NOT EXISTS rollout_percent INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percent >= 0 AND rollout_percent <= 100),
  ADD COLUMN IF NOT EXISTS platforms_allowed TEXT[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS roles_allowed TEXT[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS min_app_version TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS environments_allowed TEXT[] DEFAULT NULL;

COMMENT ON COLUMN feature_flags.rollout_percent IS 'Percentage of users (0-100) who receive the flag when enabled; 100 = everyone';
COMMENT ON COLUMN feature_flags.platforms_allowed IS 'Allowed platforms: web, customer, provider; null = all';
COMMENT ON COLUMN feature_flags.roles_allowed IS 'Allowed roles; null = all';
COMMENT ON COLUMN feature_flags.min_app_version IS 'Minimum app version (semver or build); null = no minimum';
COMMENT ON COLUMN feature_flags.environments_allowed IS 'Allowed environments: production, staging, development; null = all';
