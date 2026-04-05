import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type RegionOnlineGatewayRow = {
  gateway: string;
  config: Record<string, unknown>;
  is_primary_online: boolean;
};

/**
 * Returns the primary online payment gateway for a region (e.g. paystack, stripe).
 * Use with `getTenantRegionConfig(tenantId).regionId` (migration 377 + 379).
 */
export async function getPrimaryOnlinePaymentGatewayForRegion(
  regionId: string,
): Promise<RegionOnlineGatewayRow | null> {
  if (!regionId?.trim()) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("region_payment_gateways")
    .select("gateway, config, is_primary_online")
    .eq("region_id", regionId)
    .eq("is_active", true)
    .eq("is_primary_online", true)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as { gateway?: string; config?: unknown; is_primary_online?: boolean };
  const name = String(row.gateway ?? "").trim();
  if (!name) return null;

  const cfg = row.config;
  const config =
    cfg && typeof cfg === "object" && !Array.isArray(cfg) ? (cfg as Record<string, unknown>) : {};

  return {
    gateway: name,
    config,
    is_primary_online: Boolean(row.is_primary_online),
  };
}
