-- Beautonomi Database Migration
-- 085_verification_documents_storage_policies.sql
-- Creates storage policies for verification-documents bucket

-- Note: The verification-documents bucket must be created first via Supabase Dashboard or CLI
-- This migration creates the RLS policies for the bucket

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can insert own verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Superadmins can read verification documents" ON storage.objects;

-- Helper function to extract user ID from verification document path
-- Path format: {userId}/{documentType}-{timestamp}.{ext}
-- Example: "abc123-def456/license-1234567890.jpg"
-- Note: The actual path in storage might be: "verification-documents/{userId}/{documentType}-{timestamp}.{ext}"
-- But the name field in storage.objects only contains the path relative to bucket root
CREATE OR REPLACE FUNCTION extract_user_id_from_verification_path(path text)
RETURNS uuid AS $$
DECLARE
  first_segment text;
  parts text[];
BEGIN
  -- Split path by '/' to get segments
  parts := string_to_array(path, '/');
  IF array_length(parts, 1) < 1 THEN
    RETURN NULL;
  END IF;
  
  -- Get first segment (this is the user ID)
  first_segment := parts[1];
  
  -- Try to cast to UUID
  BEGIN
    RETURN first_segment::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Policy: Users can insert their own verification documents
-- Path format: {userId}/{documentType}-{timestamp}.{ext}
CREATE POLICY "Users can insert own verification documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'verification-documents' AND
  extract_user_id_from_verification_path(name) = auth.uid()
);

-- Policy: Users can update their own verification documents
CREATE POLICY "Users can update own verification documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'verification-documents' AND
  extract_user_id_from_verification_path(name) = auth.uid()
)
WITH CHECK (
  bucket_id = 'verification-documents' AND
  extract_user_id_from_verification_path(name) = auth.uid()
);

-- Policy: Users can delete their own verification documents (or superadmins can delete any)
CREATE POLICY "Users can delete own verification documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'verification-documents' AND
  (
    extract_user_id_from_verification_path(name) = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
    )
  )
);

-- Policy: Users can read their own verification documents
CREATE POLICY "Users can read own verification documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'verification-documents' AND
  extract_user_id_from_verification_path(name) = auth.uid()
);

-- Policy: Superadmins can read all verification documents
CREATE POLICY "Superadmins can read verification documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'verification-documents' AND
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'superadmin'
  )
);
