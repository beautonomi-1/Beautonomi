-- Beautonomi Database Migration
-- 087_receipts_storage_policies.sql
-- Creates storage policies for receipts bucket

-- Note: The receipts bucket must be created first via Supabase Dashboard or CLI
-- This migration creates the RLS policies for the bucket

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Superadmins can insert receipts" ON storage.objects;
DROP POLICY IF EXISTS "Superadmins can update receipts" ON storage.objects;
DROP POLICY IF EXISTS "Superadmins can delete receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Superadmins can read receipts" ON storage.objects;

-- Helper function to extract payment ID from storage path
-- Path format: {timestamp}-{paymentId}/{filename}.{ext}
-- Example: "1234567890-abc123-def456/receipt.pdf"
CREATE OR REPLACE FUNCTION extract_payment_id_from_path(path text)
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
  
  -- Get first segment (format: {timestamp}-{paymentId})
  first_segment := parts[1];
  
  -- Find the position of the first '-' (separates timestamp from payment ID)
  dash_pos := position('-' in first_segment);
  
  IF dash_pos > 0 THEN
    -- Return everything after the first '-' (this is the payment ID)
    RETURN substring(first_segment from dash_pos + 1);
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Policy: Only superadmins can insert receipts
CREATE POLICY "Superadmins can insert receipts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'receipts' AND
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'superadmin'
  )
);

-- Policy: Only superadmins can update receipts
CREATE POLICY "Superadmins can update receipts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'receipts' AND
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'superadmin'
  )
)
WITH CHECK (
  bucket_id = 'receipts' AND
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'superadmin'
  )
);

-- Policy: Only superadmins can delete receipts
CREATE POLICY "Superadmins can delete receipts"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts' AND
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'superadmin'
  )
);

-- Policy: Users can read receipts for their own payments
CREATE POLICY "Users can read own receipts"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'receipts' AND
  EXISTS (
    SELECT 1 FROM payments
    WHERE id::text = extract_payment_id_from_path(name)
    AND user_id = auth.uid()
  )
);

-- Policy: Superadmins can read all receipts
CREATE POLICY "Superadmins can read receipts"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'receipts' AND
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'superadmin'
  )
);
