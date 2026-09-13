import type { SupabaseClient } from "@supabase/supabase-js";

/** After first missing-table error in dev, skip MV reads for this process (migrations not applied). */
let devMvUnavailable = false;
let devMvWarned = false;

/** Returns true when the error means MV tables are absent (dev without migration 824). */
function markDevMvUnavailable(error: { message?: string } | null): boolean {
  if (process.env.NODE_ENV === "production" || !error?.message) return false;
  if (
    error.message.includes("schema cache") ||
    error.message.includes("does not exist") ||
    error.message.includes("Could not find the table")
  ) {
    devMvUnavailable = true;
    return true;
  }
  return false;
}

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
  if (devMvUnavailable) return [];
  const { data, error } = await supabase
    .from("public_home_top_rated" as never)
    .select(
      "tenant_id, provider_id, slug, business_name, rating_average, review_count, thumbnail_url, status, created_at, rank_in_tenant",
    )
    .eq("tenant_id", tenantId)
    .lte("rank_in_tenant", limit)
    .order("rank_in_tenant", { ascending: true });
  if (error) {
    const missingTable = markDevMvUnavailable(error);
    if (!missingTable && !devMvWarned) {
      devMvWarned = true;
      console.warn("[public_home_top_rated_mv] read failed:", error.message);
    }
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
  if (devMvUnavailable) return [];
  const { data, error } = await supabase
    .from("public_home_hottest" as never)
    .select("provider_id, rank_in_tenant")
    .eq("tenant_id", tenantId)
    .lte("rank_in_tenant", limit)
    .order("rank_in_tenant", { ascending: true });
  if (error) {
    const missingTable = markDevMvUnavailable(error);
    if (!missingTable && !devMvWarned) {
      devMvWarned = true;
      console.warn("[public_home_hottest_mv] read failed:", error.message);
    }
    return [];
  }
  return ((data ?? []) as { provider_id: string }[]).map((r) => r.provider_id);
}
