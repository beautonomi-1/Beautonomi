-- Draft creates sent published_at = null and failed with a not-null violation
-- (API 500 "Failed to create post" / app alert "Couldn't save draft").
-- Publish sends a timestamp and succeeded. Allow null so a draft is "not yet published".
ALTER TABLE public.explore_posts
  ALTER COLUMN published_at DROP NOT NULL;
