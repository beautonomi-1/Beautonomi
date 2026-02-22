-- Store customer "Beautonomi for Business" preferences (account-settings/business)
-- business_preferences: { email: text | null, enabled: boolean }
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS business_preferences JSONB DEFAULT '{"email": null, "enabled": false}';
COMMENT ON COLUMN user_profiles.business_preferences IS 'Customer business features: email and enabled flag for Beautonomi for Business';
