-- Beautonomi Database Migration
-- 086_booking_documents_storage_policies.sql
-- Creates storage policies for booking-documents bucket

-- Note: The booking-documents bucket must be created first via Supabase Dashboard or CLI
-- This migration creates the RLS policies for the bucket

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can insert booking documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update booking documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete booking documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read booking documents" ON storage.objects;

-- Helper function to extract booking ID from storage path
-- Path format: {timestamp}-{bookingId}/{filename}.{ext}
-- Example: "1234567890-abc123-def456/document.pdf"
CREATE OR REPLACE FUNCTION extract_booking_id_from_path(path text)
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
  
  -- Get first segment (format: {timestamp}-{bookingId})
  first_segment := parts[1];
  
  -- Find the position of the first '-' (separates timestamp from booking ID)
  dash_pos := position('-' in first_segment);
  
  IF dash_pos > 0 THEN
    -- Return everything after the first '-' (this is the booking ID)
    RETURN substring(first_segment from dash_pos + 1);
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Policy: Users can insert documents for their own bookings
-- Path format: {timestamp}-{bookingId}/{filename}.{ext}
CREATE POLICY "Users can insert booking documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'booking-documents' AND
  EXISTS (
    SELECT 1 FROM bookings
    WHERE id::text = extract_booking_id_from_path(name)
    AND (
      customer_id = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM providers
        WHERE id = provider_id
        AND user_id = auth.uid()
      )
    )
  )
);

-- Policy: Users can update documents for their own bookings
CREATE POLICY "Users can update booking documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'booking-documents' AND
  EXISTS (
    SELECT 1 FROM bookings
    WHERE id::text = extract_booking_id_from_path(name)
    AND (
      customer_id = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM providers
        WHERE id = provider_id
        AND user_id = auth.uid()
      )
    )
  )
)
WITH CHECK (
  bucket_id = 'booking-documents' AND
  EXISTS (
    SELECT 1 FROM bookings
    WHERE id::text = extract_booking_id_from_path(name)
    AND (
      customer_id = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM providers
        WHERE id = provider_id
        AND user_id = auth.uid()
      )
    )
  )
);

-- Policy: Users can delete documents for their own bookings (or superadmins can delete any)
CREATE POLICY "Users can delete booking documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'booking-documents' AND
  (
    EXISTS (
      SELECT 1 FROM bookings
      WHERE id::text = extract_booking_id_from_path(name)
      AND (
        customer_id = auth.uid()
        OR
        EXISTS (
          SELECT 1 FROM providers
          WHERE id = provider_id
          AND user_id = auth.uid()
        )
      )
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
    )
  )
);

-- Policy: Users can read documents for their own bookings
CREATE POLICY "Users can read booking documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'booking-documents' AND
  EXISTS (
    SELECT 1 FROM bookings
    WHERE id::text = extract_booking_id_from_path(name)
    AND (
      customer_id = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM providers
        WHERE id = provider_id
        AND user_id = auth.uid()
      )
    )
  )
);
