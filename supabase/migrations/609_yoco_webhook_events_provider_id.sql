-- §Yoco-audit 2026-05: the Yoco webhook receiver
-- (apps/web/src/app/api/provider/yoco/webhook/route.ts) inserts the resolved
-- `provider_id` into `provider_yoco_webhook_events` so per-provider audit
-- queries can scope events without a string join through `provider_yoco_webhooks`.
-- Migration 302 created the events table without that column, so the
-- conditional insert was a silent no-op (the spread `...(webhookProviderId ? {provider_id} : {})`
-- only added a key — Supabase rejected unknown columns and the column simply
-- never appeared on the row). Add it now with a FK + index so the audit
-- log is correct without breaking historical rows.

ALTER TABLE IF EXISTS public.provider_yoco_webhook_events
  ADD COLUMN IF NOT EXISTS provider_id UUID
    REFERENCES public.providers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_yoco_webhook_events_provider
  ON public.provider_yoco_webhook_events(provider_id);

COMMENT ON COLUMN public.provider_yoco_webhook_events.provider_id IS
  'Provider that owns this webhook event (resolved at receive time from the matching provider_yoco_webhooks row).';

-- Backfill existing event rows from the matching webhook subscription so
-- historic data is queryable by provider without re-receiving the events.
UPDATE public.provider_yoco_webhook_events ev
SET provider_id = w.provider_id
FROM public.provider_yoco_webhooks w
WHERE ev.provider_id IS NULL
  AND ev.webhook_id = w.webhook_id;
