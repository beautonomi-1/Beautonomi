-- Migration: Add signup_source to users for "How did you hear about us?" tracking
-- 330_add_signup_source_to_users.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS signup_source TEXT;

COMMENT ON COLUMN users.signup_source IS 'How the user heard about us (e.g. google, social_instagram, friend_or_family). Used for signup source analytics in admin.';
