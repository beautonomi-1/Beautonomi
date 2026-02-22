-- Beautonomi Database Migration
-- 083_avatars_storage_policies.sql
-- Creates storage policies for avatars bucket

-- Note: The avatars bucket must be created first via Supabase Dashboard or CLI
-- This migration creates the RLS policies for the bucket

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can insert own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Public can read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read avatars" ON storage.objects;

-- Helper function to extract user ID from storage path
-- Path format: {timestamp}-{userId}.{ext}
-- Example: "1234567890-abc123-def456.jpg"
-- We need to extract the user ID from the filename
CREATE OR REPLACE FUNCTION extract_user_id_from_avatar_path(path text)
RETURNS uuid AS $$
DECLARE
  filename text;
  parts text[];
  dash_pos int;
  user_id_str text;
BEGIN
  -- Get filename (last segment after '/')
  parts := string_to_array(path, '/');
  filename := parts[array_length(parts, 1)];
  
  -- Find the position of the first '-' (separates timestamp from user ID)
  dash_pos := position('-' in filename);
  
  IF dash_pos > 0 THEN
    -- Extract everything after the first '-' and before the file extension
    -- Format: {timestamp}-{userId}.{ext}
    user_id_str := substring(filename from dash_pos + 1);
    -- Remove file extension
    user_id_str := split_part(user_id_str, '.', 1);
    
    -- Try to cast to UUID
    BEGIN
      RETURN user_id_str::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Policy: Users can insert their own avatar
-- Path format: {timestamp}-{userId}.{ext}
CREATE POLICY "Users can insert own avatar"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  extract_user_id_from_avatar_path(name) = auth.uid()
);

-- Policy: Users can update their own avatar
CREATE POLICY "Users can update own avatar"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  extract_user_id_from_avatar_path(name) = auth.uid()
)
WITH CHECK (
  bucket_id = 'avatars' AND
  extract_user_id_from_avatar_path(name) = auth.uid()
);

-- Policy: Users can delete their own avatar (or superadmins can delete any)
CREATE POLICY "Users can delete own avatar"
ON storage.objects
FOR DELETE
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
);

-- Policy: Public can read avatars (for public profiles)
CREATE POLICY "Public can read avatars"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'avatars'
);

-- Policy: Authenticated users can read avatars
CREATE POLICY "Authenticated can read avatars"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
);
