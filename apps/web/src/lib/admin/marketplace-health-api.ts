import type { SupabaseClient } from "@supabase/supabase-js";
import { getFinanceMetricContracts } from "@/lib/admin/finance-metric-contracts";

export type MarketplaceHealthSnapshotRow = {
  as_of: string;
  booking_frequency_30d: number | null;
  repeat_rate_90d: number | null;
  transacting_providers_7d: number;
  transacting_providers_30d: number;
  active_providers: number;
  supply_liquidity: number | null;
  provider_bookings_per_week: number | null;
  take_rate: number | null;
  gmv: number | null;
  platform_net: number | null;
  contribution_margin: number | null;
  completed_bookings_day: number;
  booking_take_net: number | null;
  subscription_net: number | null;
  ads_net: number | null;
  service_fees_net: number | null;
  refreshed_at: string;
};

export async function fetchLatestMarketplaceHealth(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<MarketplaceHealthSnapshotRow | null> {
  const { data, error } = await supabase
    .from("marketplace_health_daily")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as MarketplaceHealthSnapshotRow;
}

export async function fetchMarketplaceHealthSeries(
  supabase: SupabaseClient,
  tenantId: string,
  since: string,
  until: string,
): Promise<MarketplaceHealthSnapshotRow[]> {
  const { data, error } = await supabase
    .from("marketplace_health_daily")
    .select("*")
    .eq("tenant_id", tenantId)
    .gte("as_of", since.slice(0, 10))
    .lte("as_of", until.slice(0, 10))
    .order("as_of", { ascending: true });
  if (error || !data) return [];
  return data as MarketplaceHealthSnapshotRow[];
}

export function deltaPct(current: number | null | undefined, prior: number | null | undefined): number | null {
  if (current == null || prior == null || prior === 0) {
    if (current != null && prior === 0 && current > 0) return 100;
    return null;
  }
  return Math.round(((current - prior) / Math.abs(prior)) * 1000) / 10;
}

export function marketplaceHealthContractsPayload() {
  return getFinanceMetricContracts([
    "bookingFrequency30d",
    "repeatRate90d",
    "takeRate",
    "supplyLiquidity",
    "contributionMargin",
  ]);
}
