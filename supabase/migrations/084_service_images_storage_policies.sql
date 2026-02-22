-- Beautonomi Database Migration
-- 084_service_images_storage_policies.sql
-- Creates storage policies for service-images bucket

-- Note: The service-images bucket must be created first via Supabase Dashboard or CLI
-- This migration creates the RLS policies for the bucket

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Providers can insert own service images" ON storage.objects;
DROP POLICY IF EXISTS "Providers can update own service images" ON storage.objects;
DROP POLICY IF EXISTS "Providers can delete own service images" ON storage.objects;
DROP POLICY IF EXISTS "Public can read service images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read service images" ON storage.objects;

-- Helper function to extract service ID from storage path
-- Path format: {timestamp}-{serviceId}/image.{ext}
-- Example: "1234567890-abc123-def456/image.jpg"
CREATE OR REPLACE FUNCTION extract_service_id_from_path(path text)
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
  
  -- Get first segment (format: {timestamp}-{serviceId})
  first_segment := parts[1];
  
  -- Find the position of the first '-' (separates timestamp from service ID)
  dash_pos := position('-' in first_segment);
  
  IF dash_pos > 0 THEN
    -- Return everything after the first '-' (this is the service ID)
    RETURN substring(first_segment from dash_pos + 1);
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Policy: Providers can insert images for their own services
-- Path format: {timestamp}-{serviceId}/image.{ext}
CREATE POLICY "Providers can insert own service images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'service-images' AND
  EXISTS (
    SELECT 1 FROM offerings o
    JOIN providers p ON p.id = o.provider_id
    WHERE o.id::text = extract_service_id_from_path(name)
    AND p.user_id = auth.uid()
  )
);

-- Policy: Providers can update their own service images
CREATE POLICY "Providers can update own service images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'service-images' AND
  EXISTS (
    SELECT 1 FROM offerings o
    JOIN providers p ON p.id = o.provider_id
    WHERE o.id::text = extract_service_id_from_path(name)
    AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'service-images' AND
  EXISTS (
    SELECT 1 FROM offerings o
    JOIN providers p ON p.id = o.provider_id
    WHERE o.id::text = extract_service_id_from_path(name)
    AND p.user_id = auth.uid()
  )
);

-- Policy: Providers can delete their own service images (or superadmins can delete any)
CREATE POLICY "Providers can delete own service images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'service-images' AND
  (
    EXISTS (
      SELECT 1 FROM offerings o
      JOIN providers p ON p.id = o.provider_id
      WHERE o.id::text = extract_service_id_from_path(name)
      AND p.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
    )
  )
);

-- Policy: Public can read service images (for active services of active providers)
CREATE POLICY "Public can read service images"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'service-images' AND
  EXISTS (
    SELECT 1 FROM offerings o
    JOIN providers p ON p.id = o.provider_id
    WHERE o.id::text = extract_service_id_from_path(name)
    AND o.status = 'active'
    AND p.status = 'active'
  )
);

-- Policy: Authenticated users can read service images
CREATE POLICY "Authenticated can read service images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'service-images'
);
