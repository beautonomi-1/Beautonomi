-- Storage policies for merchant-onboarding-documents bucket
-- Create bucket via Supabase Dashboard: merchant-onboarding-documents (private)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'merchant-onboarding-documents'
  ) THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'merchant-onboarding-documents',
      'merchant-onboarding-documents',
      false,
      10485760,
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    );
  END IF;
END $$;

DROP POLICY IF EXISTS merchant_onboarding_docs_service_role ON storage.objects;
CREATE POLICY merchant_onboarding_docs_service_role
  ON storage.objects FOR ALL
  USING (bucket_id = 'merchant-onboarding-documents' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'merchant-onboarding-documents' AND auth.role() = 'service_role');
