-- §provider-gallery-race 2026-05: Replace read-modify-write gallery appends
-- in `/api/provider/gallery` with an atomic, server-side array_append.
--
-- Symptom we are fixing: when onboarding/gallery flows upload more than one
-- image at once (e.g. 4 photos via the mobile picker), the previous TS code
-- path was:
--   1. SELECT gallery FROM providers WHERE id = :provider_id
--   2. append url to JS array
--   3. UPDATE providers SET gallery = :appended_array
-- Two parallel uploads both read the same gallery, both appended their
-- single new url, and the second UPDATE silently overwrote the first one.
-- The provider would see only the last image land in the gallery.
--
-- This migration adds a transactional RPC the route can call instead, so the
-- append happens inside a single PostgreSQL statement with row-level
-- locking. Optionally applies the new URL as thumbnail/avatar in the same
-- transaction so the dashboard/profile reflects the change immediately.

CREATE OR REPLACE FUNCTION public.append_provider_gallery(
  p_provider_id uuid,
  p_url text,
  p_apply_as text DEFAULT NULL
)
RETURNS TABLE (
  url text,
  "position" integer,
  gallery_length integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_gallery text[];
BEGIN
  IF p_url IS NULL OR length(trim(p_url)) = 0 THEN
    RAISE EXCEPTION 'URL is required';
  END IF;

  UPDATE public.providers
  SET
    gallery = array_append(COALESCE(gallery, ARRAY[]::text[]), p_url),
    thumbnail_url = CASE
      WHEN p_apply_as = 'thumbnail' THEN p_url
      ELSE thumbnail_url
    END,
    avatar_url = CASE
      WHEN p_apply_as = 'avatar' THEN p_url
      ELSE avatar_url
    END
  WHERE id = p_provider_id
  RETURNING gallery INTO new_gallery;

  IF new_gallery IS NULL THEN
    RAISE EXCEPTION 'Provider % not found', p_provider_id;
  END IF;

  RETURN QUERY
  SELECT
    p_url,
    array_length(new_gallery, 1) - 1,
    array_length(new_gallery, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.append_provider_gallery(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_provider_gallery(uuid, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.append_provider_gallery(uuid, text, text) IS
  'Race-free gallery append used by /api/provider/gallery. Optionally promotes the new URL to thumbnail/avatar in the same transaction.';
