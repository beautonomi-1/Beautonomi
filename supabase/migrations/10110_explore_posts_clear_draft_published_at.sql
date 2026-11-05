-- Drafts created before published_at was nullable inherited DEFAULT now().
-- A draft is not published; clear those timestamps. Published rows keep theirs,
-- and any published row missing a time falls back to created_at so feed cursors stay valid.

UPDATE public.explore_posts
SET published_at = COALESCE(created_at, now())
WHERE status = 'published'
  AND published_at IS NULL;

UPDATE public.explore_posts
SET published_at = NULL
WHERE status = 'draft'
  AND published_at IS NOT NULL;
