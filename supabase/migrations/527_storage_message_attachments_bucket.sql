-- Chat + support-ticket file uploads use Storage bucket `message-attachments`
-- (see apps/web/src/lib/messaging/message-attachments.ts and /api/me/messages/upload).
-- Ensures the bucket row exists and RLS allows authenticated uploads when the API
-- uses the user JWT (no service role), avoiding misleading "Bucket not found" / upload failures.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  true,
  52428800,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = COALESCE(EXCLUDED.file_size_limit, storage.buckets.file_size_limit),
  allowed_mime_types = COALESCE(storage.buckets.allowed_mime_types, EXCLUDED.allowed_mime_types);

DROP POLICY IF EXISTS "Public read message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete message attachments" ON storage.objects;

CREATE POLICY "Public read message attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'message-attachments');

CREATE POLICY "Authenticated upload message attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'message-attachments');

CREATE POLICY "Authenticated update message attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'message-attachments')
WITH CHECK (bucket_id = 'message-attachments');

CREATE POLICY "Authenticated delete message attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'message-attachments');
