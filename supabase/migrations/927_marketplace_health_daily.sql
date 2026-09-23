-- Tenant-level marketplace health daily snapshot (refreshed by cron alongside provider analytics).

CREATE TABLE IF NOT EXISTS public.marketplace_health_daily (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  as_of date NOT NULL,
  booking_frequency_30d numeric,
  repeat_rate_90d numeric,
  transacting_providers_7d integer NOT NULL DEFAULT 0,
  transacting_providers_30d integer NOT NULL DEFAULT 0,
  active_providers integer NOT NULL DEFAULT 0,
  supply_liquidity numeric,
  provider_bookings_per_week numeric,
  take_rate numeric,
  gmv numeric,
  platform_net numeric,
  contribution_margin numeric,
  completed_bookings_day integer NOT NULL DEFAULT 0,
  booking_take_net numeric,
  subscription_net numeric,
  ads_net numeric,
  service_fees_net numeric,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, as_of)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_health_daily_as_of
  ON public.marketplace_health_daily (as_of DESC);

ALTER TABLE public.marketplace_health_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_health_daily_admin_read ON public.marketplace_health_daily;
CREATE POLICY marketplace_health_daily_admin_read
  ON public.marketplace_health_daily
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('superadmin', 'admin_finance', 'admin_operations')
    )
  );

COMMENT ON TABLE public.marketplace_health_daily IS
  'Daily tenant marketplace health metrics for admin dashboard and analytics trends.';
