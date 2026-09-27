-- 960 created brand_* policies as USING (true) with no role, which exposed the tables to
-- anon/authenticated PostgREST clients. The brand desk is only read and written by the
-- admin API with the service role, so restrict every policy to that role.

DROP POLICY IF EXISTS brand_settings_service ON public.brand_settings;
CREATE POLICY brand_settings_service ON public.brand_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS brand_briefs_service ON public.brand_briefs;
CREATE POLICY brand_briefs_service ON public.brand_briefs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS brand_campaigns_service ON public.brand_campaigns;
CREATE POLICY brand_campaigns_service ON public.brand_campaigns
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS brand_placements_service ON public.brand_placements;
CREATE POLICY brand_placements_service ON public.brand_placements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS brand_metric_entries_service ON public.brand_metric_entries;
CREATE POLICY brand_metric_entries_service ON public.brand_metric_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS brand_activity_service ON public.brand_activity;
CREATE POLICY brand_activity_service ON public.brand_activity
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS brand_period_snapshots_service ON public.brand_period_snapshots;
CREATE POLICY brand_period_snapshots_service ON public.brand_period_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.brand_settings, public.brand_briefs, public.brand_campaigns,
  public.brand_placements, public.brand_metric_entries, public.brand_activity,
  public.brand_period_snapshots FROM anon, authenticated;
