-- Migration 912: Admin notification types, agent realtime, platform Slack logs
--
-- 1. notification_type enum values for admin ops fidelity
-- 2. Realtime publication for agent_actions + agent_runs (Agentic Console live inbox)
-- 3. slack_delivery_logs.tenant_id nullable for platform-scoped events

-- ─── 1. Admin notification enum values ────────────────────────────────────────

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'admin_ops_alert';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'agent_proposal';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'support_queue';

-- ─── 2. Agent workforce realtime ─────────────────────────────────────────────

ALTER TABLE public.agent_actions REPLICA IDENTITY FULL;
ALTER TABLE public.agent_runs REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'agent_actions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_actions;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'agent_runs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_runs;
    END IF;
  END IF;
END $$;

-- ─── 3. Platform-scoped Slack delivery logs ──────────────────────────────────

ALTER TABLE public.slack_delivery_logs ALTER COLUMN tenant_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_slack_delivery_platform_dedupe
  ON public.slack_delivery_logs (event_key, dedupe_key, created_at DESC)
  WHERE tenant_id IS NULL;
