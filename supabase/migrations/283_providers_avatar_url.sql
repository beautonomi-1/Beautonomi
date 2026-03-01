-- Add business avatar (profile circle / "face" of the business) to providers.
-- thumbnail_url = main card/listing image; avatar_url = small circle on card (business identity).
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN providers.avatar_url IS 'Business profile image shown in the small circle on listing cards. Use thumbnail_url for the main card hero image.';
