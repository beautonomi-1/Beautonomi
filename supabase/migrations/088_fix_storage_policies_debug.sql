-- Beautonomi Database Migration
-- 088_fix_storage_policies_debug.sql
-- Fix storage policies for provider uploads with better UUID handling

-- Drop existing policies FIRST (they depend on the function)
DROP POLICY IF EXISTS "Providers can insert own gallery images" ON storage.objects;
DROP POLICY IF EXISTS "Providers can update own gallery images" ON storage.objects;
DROP POLICY IF EXISTS "Providers can delete own gallery images" ON storage.objects;
DROP POLICY IF EXISTS "Public can read provider gallery images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read provider gallery images" ON storage.objects;

-- Now drop the existing function (can't change return type with CREATE OR REPLACE)
DROP FUNCTION IF EXISTS extract_provider_id_from_path(text);

-- Recreate the function with UUID return type
CREATE FUNCTION extract_provider_id_from_path(path text)
RETURNS uuid AS $$
DECLARE
  first_segment text;
  parts text[];
  dash_pos int;
  provider_id_str text;
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
    provider_id_str := substring(first_segment from dash_pos + 1);
    
    -- Try to cast to UUID (handles full UUID format)
    BEGIN
      RETURN provider_id_str::uuid;
    EXCEPTION WHEN OTHERS THEN
      -- If it's not a valid UUID, return NULL
      RETURN NULL;
    END;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Improved INSERT policy with UUID handling
CREATE POLICY "Providers can insert own gallery images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'provider-gallery' AND
  (
    -- Check if user is a provider owner and the provider ID matches
    EXISTS (
      SELECT 1 FROM providers
      WHERE id = extract_provider_id_from_path(name)
      AND user_id = auth.uid()
    )
    OR
    -- Allow superadmins
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
    )
  )
);

-- Improved UPDATE policy
CREATE POLICY "Providers can update own gallery images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'provider-gallery' AND
  (
    EXISTS (
      SELECT 1 FROM providers
      WHERE id = extract_provider_id_from_path(name)
      AND user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
    )
  )
)
WITH CHECK (
  bucket_id = 'provider-gallery' AND
  (
    EXISTS (
      SELECT 1 FROM providers
      WHERE id = extract_provider_id_from_path(name)
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

-- Improved DELETE policy
CREATE POLICY "Providers can delete own gallery images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'provider-gallery' AND
  (
    EXISTS (
      SELECT 1 FROM providers
      WHERE id = extract_provider_id_from_path(name)
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

-- Public read policy for active providers
CREATE POLICY "Public can read provider gallery images"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'provider-gallery' AND
  EXISTS (
    SELECT 1 FROM providers
    WHERE id = extract_provider_id_from_path(name)
    AND status = 'active'
  )
);

-- Authenticated users can read all provider gallery images
CREATE POLICY "Authenticated can read provider gallery images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'provider-gallery'
);

-- Also ensure avatars policies work correctly
DROP POLICY IF EXISTS "Users can insert own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;

CREATE POLICY "Users can insert own avatar"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (
    extract_user_id_from_avatar_path(name) = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
    )
  )
);

CREATE POLICY "Users can update own avatar"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (
    extract_user_id_from_avatar_path(name) = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
    )
  )
)
WITH CHECK (
  bucket_id = 'avatars' AND
  (
    extract_user_id_from_avatar_path(name) = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
    )
  )
);
