-- Optional photo URLs for customer reviews (API already sends `photos` JSON array)
ALTER TABLE reviews
ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN reviews.photos IS 'Array of public image URLs attached to the review';
