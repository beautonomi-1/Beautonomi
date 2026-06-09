import { cache } from "react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantIdFromServerHeaders } from "@/lib/tenant/resolve-tenant-from-headers";
import type { PublicProviderCard } from "@/types/beautonomi";

/**
 * Fetch active providers whose primary location matches a given city name.
 * Used by the /location/[slug] server component.
 * Wrapped in React.cache for dedup between generateMetadata and page render.
 */
export const getProvidersByCity = cache(
  async (cityName: string, limit = 50): Promise<PublicProviderCard[]> => {
    try {
      const supabase = await getSupabaseServer();

      let tenantId: string;
      try {
        tenantId = await resolveTenantIdFromServerHeaders();
      } catch {
        return [];
      }

      const { data: locationRows } = await supabase
        .from("provider_locations")
        .select("provider_id")
        .ilike("city", cityName)
        .eq("is_active", true);

      if (!locationRows || locationRows.length === 0) return [];

      const providerIds = Array.from(new Set(locationRows.map((r) => r.provider_id)));

      const { data: providers } = await supabase
        .from("providers")
        .select(
          `id, slug, business_name, business_type, description,
           rating_average, review_count, thumbnail_url, avatar_url,
           is_featured, is_verified, currency`,
        )
        .in("id", providerIds)
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .is("deleted_at", null)
        .limit(limit);

      if (!providers) return [];

      return providers.map((p: any) => ({
        id: p.id,
        slug: p.slug,
        business_name: p.business_name || "Provider",
        business_type: p.business_type,
        rating: p.rating_average ?? 0,
        review_count: p.review_count ?? 0,
        thumbnail_url: p.thumbnail_url,
        avatar_url: p.avatar_url ?? null,
        city: cityName,
        country: "",
        is_featured: p.is_featured ?? false,
        is_verified: p.is_verified ?? false,
        currency: p.currency || "ZAR",
        description: p.description ?? null,
      }));
    } catch (error) {
      console.error("getProvidersByCity error:", error);
      return [];
    }
  },
);
