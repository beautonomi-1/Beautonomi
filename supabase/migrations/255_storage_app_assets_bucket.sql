-- App assets bucket for on-demand UX (ringtones, waiting screen assets)
-- Path convention: ux/ringtones/<environment>/default.mp3
-- Use signed URLs for delivery; do not set public = true for entire bucket

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-assets',
  'app-assets',
  false,
  5242880,
  ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: only superadmin can upload/update/delete; service role can read for signed URL generation
-- Public read is disabled; use signed URLs in API routes for ringtone delivery
