-- P0: Private message-attachments bucket + path-scoped RLS (conversation / support ticket).

UPDATE storage.buckets
SET public = false
WHERE id = 'message-attachments';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  false,
  52428800,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = COALESCE(EXCLUDED.file_size_limit, storage.buckets.file_size_limit);

CREATE OR REPLACE FUNCTION public.user_can_access_message_attachment_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN (storage.foldername(p_name))[1] = 'support-tickets' THEN
      EXISTS (
        SELECT 1
        FROM public.support_tickets st
        WHERE st.id::text = (storage.foldername(p_name))[2]
          AND (
            st.user_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.users u
              WHERE u.id = auth.uid()
                AND u.role IN ('superadmin', 'support_agent')
            )
          )
      )
    ELSE
      EXISTS (
        SELECT 1
        FROM public.conversations c
        WHERE c.id::text = (storage.foldername(p_name))[1]
          AND (
            c.customer_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.providers p
              WHERE p.id = c.provider_id AND p.user_id = auth.uid()
            )
            OR EXISTS (
              SELECT 1 FROM public.provider_staff ps
              WHERE ps.provider_id = c.provider_id
                AND ps.user_id = auth.uid()
                AND ps.is_active = true
            )
          )
      )
  END;
$$;

CREATE OR REPLACE FUNCTION public.user_owns_message_attachment_upload(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN (storage.foldername(p_name))[1] = 'support-tickets' THEN
      (storage.foldername(p_name))[3] = auth.uid()::text
    ELSE
      (storage.foldername(p_name))[2] = auth.uid()::text
  END;
$$;

DROP POLICY IF EXISTS "Public read message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete message attachments" ON storage.objects;

CREATE POLICY message_attachments_select_participant
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND public.user_can_access_message_attachment_object(name)
  );

CREATE POLICY message_attachments_insert_owner
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND public.user_owns_message_attachment_upload(name)
    AND public.user_can_access_message_attachment_object(name)
  );

CREATE POLICY message_attachments_update_owner
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND public.user_owns_message_attachment_upload(name)
    AND public.user_can_access_message_attachment_object(name)
  )
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND public.user_owns_message_attachment_upload(name)
    AND public.user_can_access_message_attachment_object(name)
  );

CREATE POLICY message_attachments_delete_owner
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND public.user_owns_message_attachment_upload(name)
    AND public.user_can_access_message_attachment_object(name)
  );

-- Service role retains full bucket access for cron expiry and admin maintenance.
