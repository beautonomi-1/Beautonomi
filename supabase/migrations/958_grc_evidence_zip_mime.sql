-- Allow audit pack zip uploads in grc-evidence bucket
UPDATE storage.buckets
SET allowed_mime_types = array(
  SELECT DISTINCT unnest(
    COALESCE(allowed_mime_types, ARRAY[]::text[]) || ARRAY['application/zip', 'application/x-zip-compressed']
  )
)
WHERE id = 'grc-evidence';
