-- Enable global auto-hide for reported explore UGC (3 pending reports / 24h).
-- Tenant-specific feature_flags rows are not modified.

UPDATE public.feature_flags
SET enabled = true, updated_at = NOW()
WHERE feature_key = 'safety.auto_hide_report_threshold'
  AND tenant_id IS NULL;
