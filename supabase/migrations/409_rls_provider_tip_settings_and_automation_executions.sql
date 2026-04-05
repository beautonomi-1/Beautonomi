-- Migration 409: RLS for provider_tip_settings and automation_executions
-- Addresses audit finding: these tables were created without enabling RLS,
-- leaving them accessible to any authenticated Supabase client.

-- ============================================================================
-- 1. provider_tip_settings
--    Provider owners / staff can read and manage their own tip settings.
-- ============================================================================
ALTER TABLE IF EXISTS public.provider_tip_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'provider_tip_settings' AND policyname = 'Providers can view own tip settings'
  ) THEN
    CREATE POLICY "Providers can view own tip settings"
      ON public.provider_tip_settings FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.providers p
          WHERE p.id = provider_tip_settings.provider_id
            AND (
              p.user_id = auth.uid()
              OR EXISTS (
                SELECT 1 FROM public.provider_staff ps
                WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
              )
            )
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'provider_tip_settings' AND policyname = 'Provider owners can manage tip settings'
  ) THEN
    CREATE POLICY "Provider owners can manage tip settings"
      ON public.provider_tip_settings FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.providers p
          WHERE p.id = provider_tip_settings.provider_id
            AND p.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'provider_tip_settings' AND policyname = 'Service role full access provider_tip_settings'
  ) THEN
    CREATE POLICY "Service role full access provider_tip_settings"
      ON public.provider_tip_settings FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;

-- ============================================================================
-- 2. automation_executions
--    Provider owners / staff can view executions for their automations.
--    Service role has full access (automation cron jobs run server-side).
-- ============================================================================
ALTER TABLE IF EXISTS public.automation_executions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'automation_executions' AND policyname = 'Providers can view own automation executions'
  ) THEN
    CREATE POLICY "Providers can view own automation executions"
      ON public.automation_executions FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.marketing_automations ma
          JOIN public.providers p ON p.id = ma.provider_id
          WHERE ma.id = automation_executions.automation_id
            AND (
              p.user_id = auth.uid()
              OR EXISTS (
                SELECT 1 FROM public.provider_staff ps
                WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
              )
            )
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'automation_executions' AND policyname = 'Service role full access automation_executions'
  ) THEN
    CREATE POLICY "Service role full access automation_executions"
      ON public.automation_executions FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;
