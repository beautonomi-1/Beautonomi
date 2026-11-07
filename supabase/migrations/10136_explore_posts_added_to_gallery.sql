-- Track whether publish opted in and successfully linked media to providers.gallery (for unhide restore).

ALTER TABLE public.explore_posts
  ADD COLUMN IF NOT EXISTS added_to_gallery boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.explore_posts.added_to_gallery IS
  'True when this post''s display/poster URL was appended to providers.gallery via also_add_to_gallery.';
