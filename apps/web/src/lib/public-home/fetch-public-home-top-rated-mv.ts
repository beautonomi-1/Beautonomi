import type { SupabaseClient } from "@supabase/supabase-js";

export interface PublicHomeMvProviderRow {
  tenant_id: string;
  provider_id: string;
  slug: string | null;
  business_name: string | null;
  rating_average: number | null;
  review_count: number | null;
  thumbnail_url: string | null;
  status: string | null;
  created_at: string | null;
  rank_in_tenant: number;
}

/** Read precomputed top-rated cards for a tenant (falls back to empty on error). */
export async function fetchPublicHomeTopRatedFromMv(
  supabase: SupabaseClient,
  tenantId: string,
  limit = 20,
): Promise<PublicHomeMvProviderRow[]> {
  const { data, error } = await supabase
    .from("public_home_top_rated" as never)
    .select(
      "tenant_id, provider_id, slug, business_name, rating_average, review_count, thumbnail_url, status, created_at, rank_in_tenant",
    )
    .eq("tenant_id", tenantId)
    .lte("rank_in_tenant", limit)
    .order("rank_in_tenant", { ascending: true });
  if (error) {
    console.warn("[public_home_top_rated_mv] read failed:", error.message);
    return [];
  }
  return (data ?? []) as PublicHomeMvProviderRow[];
}

/**
 * Provider ids ranked by trailing-30-day booking volume, highest first.
 * Empty result means the caller should fall back to the live booking scan.
 */
export async function fetchPublicHomeHottestFromMv(
  supabase: SupabaseClient,
  tenantId: string,
  limit = 12,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("public_home_hottest" as never)
    .select("provider_id, rank_in_tenant")
    .eq("tenant_id", tenantId)
    .lte("rank_in_tenant", limit)
    .order("rank_in_tenant", { ascending: true });
  if (error) {
    console.warn("[public_home_hottest_mv] read failed:", error.message);
    return [];
  }
  return ((data ?? []) as { provider_id: string }[]).map((r) => r.provider_id);
}
