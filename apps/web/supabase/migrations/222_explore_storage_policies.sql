-- ============================================================================
-- Migration 222: Explore Posts Storage Policies
-- ============================================================================
-- Creates storage policies for explore-posts bucket.
-- Path format: explore/{provider_id}/{filename}
-- Note: Create explore-posts bucket manually via Supabase Dashboard or CLI.
-- ============================================================================

-- Helper function to extract provider ID from explore path
-- Path format: explore/{provider_id}/{filename}
CREATE OR REPLACE FUNCTION extract_provider_id_from_explore_path(path text)
RETURNS text AS $$
DECLARE
  parts text[];
BEGIN
  parts := string_to_array(path, '/');
  IF array_length(parts, 1) >= 2 THEN
    RETURN parts[2]; -- explore, provider_id, filename...
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Providers can insert own explore posts media" ON storage.objects;
DROP POLICY IF EXISTS "Providers can update own explore posts media" ON storage.objects;
DROP POLICY IF EXISTS "Providers can delete own explore posts media" ON storage.objects;
DROP POLICY IF EXISTS "Public can read explore posts media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read explore posts media" ON storage.objects;

-- Policy: Provider owner or staff can insert to their provider's path
CREATE POLICY "Providers can insert own explore posts media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'explore-posts' AND
  (
    EXISTS (
      SELECT 1 FROM providers
      WHERE id::text = extract_provider_id_from_explore_path(name)
      AND user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM provider_staff
      WHERE provider_id::text = extract_provider_id_from_explore_path(name)
      AND user_id = auth.uid()
      AND is_active = true
    )
  )
);

-- Policy: Provider owner or staff can update
CREATE POLICY "Providers can update own explore posts media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'explore-posts' AND
  (
    EXISTS (
      SELECT 1 FROM providers
      WHERE id::text = extract_provider_id_from_explore_path(name)
      AND user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM provider_staff
      WHERE provider_id::text = extract_provider_id_from_explore_path(name)
      AND user_id = auth.uid()
      AND is_active = true
    )
  )
)
WITH CHECK (
  bucket_id = 'explore-posts' AND
  (
    EXISTS (
      SELECT 1 FROM providers
      WHERE id::text = extract_provider_id_from_explore_path(name)
      AND user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM provider_staff
      WHERE provider_id::text = extract_provider_id_from_explore_path(name)
      AND user_id = auth.uid()
      AND is_active = true
    )
  )
);

-- Policy: Provider or superadmin can delete
CREATE POLICY "Providers can delete own explore posts media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'explore-posts' AND
  (
    EXISTS (
      SELECT 1 FROM providers
      WHERE id::text = extract_provider_id_from_explore_path(name)
      AND user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM provider_staff
      WHERE provider_id::text = extract_provider_id_from_explore_path(name)
      AND user_id = auth.uid()
      AND is_active = true
    )
    OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
  )
);

-- Policy: Public can read explore posts media (post visibility controlled by API)
CREATE POLICY "Public can read explore posts media"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'explore-posts');

-- Authenticated can read (providers view drafts)
CREATE POLICY "Authenticated can read explore posts media"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'explore-posts');
