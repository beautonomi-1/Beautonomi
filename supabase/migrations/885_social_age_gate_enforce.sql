-- Flip global social age gate from audit-only (log) to server-side enforcement (enforce).
-- Safe to re-run: updates metadata in place. Roll back via Admin → Feature flags if needed.

UPDATE public.feature_flags
SET
  metadata = '{"mode": "enforce"}'::jsonb,
  description = 'Controls server-side social access enforcement: off (disabled), log (audit only), enforce (block).'
WHERE feature_key = 'safety.social_age_gate_mode'
  AND tenant_id IS NULL;
