-- Beautonomi Database Migration
-- 082_provider_gallery_storage_policies.sql
-- Creates storage policies for provider-gallery bucket

-- Note: The provider-gallery bucket must be created first via Supabase Dashboard or CLI
-- This migration creates the RLS policies for the bucket

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Providers can insert own gallery images" ON storage.objects;
DROP POLICY IF EXISTS "Providers can update own gallery images" ON storage.objects;
DROP POLICY IF EXISTS "Providers can delete own gallery images" ON storage.objects;
DROP POLICY IF EXISTS "Public can read provider gallery images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read provider gallery images" ON storage.objects;

-- Helper function to extract provider ID from storage path
-- Path format: {timestamp}-{providerId}/{filename}
-- Example: "1234567890-abc123-def456/thumbnail.jpg"
-- We need to extract the provider ID from the first segment after the timestamp
CREATE OR REPLACE FUNCTION extract_provider_id_from_path(path text)
RETURNS text AS $$
DECLARE
  first_segment text;
  parts text[];
  dash_pos int;
BEGIN
  -- Split path by '/' to get segments
  parts := string_to_array(path, '/');
  IF array_length(parts, 1) < 1 THEN
    RETURN NULL;
  END IF;
  
  -- Get first segment (format: {timestamp}-{providerId})
  first_segment := parts[1];
  
  -- Find the position of the first '-' (separates timestamp from provider ID)
  dash_pos := position('-' in first_segment);
  
  IF dash_pos > 0 THEN
    -- Return everything after the first '-' (this is the provider ID)
    -- This works for UUIDs and other provider ID formats
    RETURN substring(first_segment from dash_pos + 1);
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Policy: Providers can insert images to their own gallery
-- Path format: {timestamp}-{providerId}/gallery-{index}.{ext} or {timestamp}-{providerId}/thumbnail.{ext}
CREATE POLICY "Providers can insert own gallery images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'provider-gallery' AND
  EXISTS (
    SELECT 1 FROM providers
    WHERE id::text = extract_provider_id_from_path(name)
    AND user_id = auth.uid()
  )
);

-- Policy: Providers can update their own gallery images
CREATE POLICY "Providers can update own gallery images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'provider-gallery' AND
  EXISTS (
    SELECT 1 FROM providers
    WHERE id::text = extract_provider_id_from_path(name)
    AND user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'provider-gallery' AND
  EXISTS (
    SELECT 1 FROM providers
    WHERE id::text = extract_provider_id_from_path(name)
    AND user_id = auth.uid()
  )
);

-- Policy: Providers can delete their own gallery images
CREATE POLICY "Providers can delete own gallery images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'provider-gallery' AND
  (
    EXISTS (
      SELECT 1 FROM providers
      WHERE id::text = extract_provider_id_from_path(name)
      AND user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
    )
  )
);

-- Policy: Public can read provider gallery images (for active providers)
-- This allows public viewing of gallery images on provider profiles
CREATE POLICY "Public can read provider gallery images"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'provider-gallery' AND
  EXISTS (
    SELECT 1 FROM providers
    WHERE id::text = extract_provider_id_from_path(name)
    AND status = 'active'
  )
);

-- Also allow authenticated users (including providers) to read
CREATE POLICY "Authenticated can read provider gallery images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'provider-gallery'
);
