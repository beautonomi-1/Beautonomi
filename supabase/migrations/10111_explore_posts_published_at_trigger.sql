-- Enforce publish time in the database so a draft cannot keep DEFAULT now()
-- when the API omits published_at. Published rows with no time fall back to created_at.

CREATE OR REPLACE FUNCTION public.explore_posts_sync_published_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'draft' THEN
    NEW.published_at := NULL;
  ELSIF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := COALESCE(NEW.created_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS explore_posts_sync_published_at ON public.explore_posts;

CREATE TRIGGER explore_posts_sync_published_at
  BEFORE INSERT OR UPDATE OF status, published_at
  ON public.explore_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.explore_posts_sync_published_at();
