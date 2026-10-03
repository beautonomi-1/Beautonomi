-- Ensure all storage buckets that exist on production (manual dashboard + migrations) exist on greenfield projects.
-- RLS policies for these buckets live in migrations 082–088, 222, 527, etc.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, NULL, NULL),
  ('provider-gallery', 'provider-gallery', true, NULL, NULL),
  ('service-images', 'service-images', true, NULL, NULL),
  ('booking-documents', 'booking-documents', false, 10485760, NULL),
  ('verification-documents', 'verification-documents', false, 10485760, NULL),
  ('explore-posts', 'explore-posts', true, NULL, NULL),
  ('learning-center', 'learning-center', true, NULL, NULL),
  ('CMS-IMAGES', 'CMS-IMAGES', true, NULL, NULL),
  (
    'custom-request-attachments',
    'custom-request-attachments',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']::text[]
  ),
  (
    'receipts',
    'receipts',
    false,
    5242880,
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']::text[]
  ),
  (
    'reciepts',
    'reciepts',
    false,
    5242880,
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']::text[]
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = COALESCE(EXCLUDED.file_size_limit, storage.buckets.file_size_limit),
  allowed_mime_types = COALESCE(EXCLUDED.allowed_mime_types, storage.buckets.allowed_mime_types);
