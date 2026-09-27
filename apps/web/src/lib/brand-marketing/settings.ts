import type { SupabaseClient } from "@supabase/supabase-js";

export type BrandSettingsRow = {
  go_live_budget_threshold: number;
  fiscal_year_start_month: number;
  stale_metric_days: number;
};

export async function loadBrandSettings(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<BrandSettingsRow> {
  const { data: tenantRow } = await supabase
    .from("brand_settings")
    .select("go_live_budget_threshold, fiscal_year_start_month, stale_metric_days")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { data: globalRow } = await supabase
    .from("brand_settings")
    .select("go_live_budget_threshold, fiscal_year_start_month, stale_metric_days")
    .is("tenant_id", null)
    .maybeSingle();

  const base = globalRow ?? {
    go_live_budget_threshold: 50000,
    fiscal_year_start_month: 1,
    stale_metric_days: 7,
  };
  return {
    go_live_budget_threshold: Number(tenantRow?.go_live_budget_threshold ?? base.go_live_budget_threshold),
    fiscal_year_start_month: Number(tenantRow?.fiscal_year_start_month ?? base.fiscal_year_start_month),
    stale_metric_days: Number(tenantRow?.stale_metric_days ?? base.stale_metric_days),
  };
}
