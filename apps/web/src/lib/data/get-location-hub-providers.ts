import { cache } from "react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantIdFromServerHeaders } from "@/lib/tenant/resolve-tenant-from-headers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import type { PublicProviderCard } from "@/types/beautonomi";

export type LocationHubQuery = {
  /** Exact or partial city name for ilike match */
  cityName?: string;
  /** ilike match against provider_locations.country */
  countryMatch: string;
  /** global_service_categories.slug */
  categorySlug?: string | null;
};

function mapRowToCard(
  p: Record<string, any>,
  loc: { city: string; country: string },
  priceInfo: { price: number; currency: string } | undefined,
  defaultCurrency: string,
  supportsHouse: boolean,
  supportsSalon: boolean,
): PublicProviderCard {
  return {
    id: p.id,
    slug: p.slug,
    business_name: p.business_name || "Provider",
    business_type: p.business_type || "salon",
    rating: p.rating_average ?? 0,
    review_count: p.review_count ?? 0,
    thumbnail_url: p.thumbnail_url,
    avatar_url: p.avatar_url ?? null,
    city: loc.city,
    country: loc.country,
    is_featured: p.is_featured ?? false,
    is_verified: p.is_verified ?? false,
    starting_price: priceInfo?.price,
    currency: priceInfo?.currency || p.currency || defaultCurrency,
    description: p.description ?? null,
    supports_house_calls: supportsHouse,
    supports_salon: supportsSalon,
  };
}

/**
 * Providers for /locations/* pages: scoped by city (optional) + country + optional global category.
 * Respects users.include_in_search_engines (same spirit as sitemap).
 */
export const getLocationHubProviders = cache(
  async (query: LocationHubQuery): Promise<PublicProviderCard[]> => {
    try {
      const supabase = await getSupabaseServer();
      let tenantId: string;
      try {
        tenantId = await resolveTenantIdFromServerHeaders();
      } catch {
        return [];
      }

      const tenantRegion = await getTenantRegionConfig(tenantId);
      const defaultCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

      let categoryProviderIds: string[] | null = null;
      const cat = query.categorySlug?.trim();
      if (cat && cat !== "all") {
        const { data: catRow } = await supabase
          .from("global_service_categories")
          .select("id")
          .eq("slug", cat)
          .eq("is_active", true)
          .maybeSingle();
        if (!catRow?.id) {
          return [];
        }
        const { data: assocs } = await supabase
          .from("provider_global_category_associations")
          .select("provider_id, providers!inner(tenant_id)")
          .eq("global_category_id", catRow.id)
          .eq("providers.tenant_id", tenantId);
        categoryProviderIds = [...new Set((assocs ?? []).map((a: any) => a.provider_id as string))];
        if (categoryProviderIds.length === 0) return [];
      }

      let locQuery = supabase
        .from("provider_locations")
        .select("provider_id, city, country, is_primary, location_type, providers!inner(tenant_id, status)")
        .eq("is_active", true)
        .eq("providers.tenant_id", tenantId)
        .eq("providers.status", "active")
        .ilike("country", `%${query.countryMatch.trim()}%`);

      if (query.cityName?.trim()) {
        locQuery = locQuery.ilike("city", `%${query.cityName.trim()}%`);
      }

      const { data: locRows, error: locErr } = await locQuery;
      if (locErr) {
        console.error("getLocationHubProviders locations:", locErr);
        return [];
      }

      let providerIds = [...new Set((locRows ?? []).map((r: any) => r.provider_id as string))];
      if (categoryProviderIds) {
        const catSet = new Set(categoryProviderIds);
        providerIds = providerIds.filter((id) => catSet.has(id));
      }
      if (providerIds.length === 0) return [];

      const { data: providers } = await supabase
        .from("providers")
        .select(
          `id, slug, business_name, business_type, offers_mobile_services, rating_average, review_count,
           thumbnail_url, avatar_url, is_featured, is_verified, currency, description, created_at,
           users!inner(include_in_search_engines)`,
        )
        .in("id", providerIds)
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .eq("users.include_in_search_engines", true);

      if (!providers?.length) return [];

      const locByProvider = new Map<string, { city: string; country: string }>();
      for (const row of locRows ?? []) {
        const r = row as any;
        const pid = r.provider_id as string;
        if (!locByProvider.has(pid)) {
          locByProvider.set(pid, {
            city: (r.city as string) || "",
            country: (r.country as string) || "",
          });
        }
      }

      const { data: offerings } = await supabase
        .from("offerings")
        .select("provider_id, price, currency, supports_at_home, supports_at_salon")
        .in("provider_id", providerIds)
        .eq("is_active", true);

      const priceMap = new Map<string, { price: number; currency: string }>();
      const houseMap = new Map<string, boolean>();
      const salonMap = new Map<string, boolean>();
      for (const o of offerings ?? []) {
        const row = o as any;
        const pid = row.provider_id;
        if (row.price != null && row.price > 0) {
          const ex = priceMap.get(pid);
          if (!ex || Number(row.price) < ex.price) {
            priceMap.set(pid, { price: Number(row.price), currency: row.currency || defaultCurrency });
          }
        }
        if (row.supports_at_home) houseMap.set(pid, true);
        if (row.supports_at_salon !== false) salonMap.set(pid, true);
      }

      for (const row of locRows ?? []) {
        const r = row as any;
        if ((r.location_type || "salon") === "salon") salonMap.set(r.provider_id, true);
      }

      const byId = new Map(providers.map((p: any) => [p.id, p]));
      const cards: PublicProviderCard[] = [];
      for (const id of providerIds) {
        const p = byId.get(id);
        if (!p) continue;
        const loc = locByProvider.get(id) ?? { city: "", country: "" };
        const supportsHouse = Boolean(p.offers_mobile_services || houseMap.get(id));
        const supportsSalon = salonMap.get(id) ?? false;
        cards.push(
          mapRowToCard(p, loc, priceMap.get(id), defaultCurrency, supportsHouse, supportsSalon),
        );
      }

      return cards;
    } catch (e) {
      console.error("getLocationHubProviders:", e);
      return [];
    }
  },
);

/** Distinct cities (display names) with counts for a country match string */
export const getLocationHubCitiesForCountry = cache(
  async (countryMatch: string, tenantId: string): Promise<{ city: string; count: number }[]> => {
    try {
      const supabase = await getSupabaseServer();
      const { data: locRows, error } = await supabase
        .from("provider_locations")
        .select("city, provider_id, providers!inner(tenant_id, status)")
        .eq("is_active", true)
        .eq("providers.tenant_id", tenantId)
        .eq("providers.status", "active")
        .ilike("country", `%${countryMatch.trim()}%`)
        .not("city", "is", null);

      if (error || !locRows?.length) return [];

      const rawIds = [...new Set((locRows as any[]).map((r) => r.provider_id as string))];
      if (rawIds.length === 0) return [];

      const { data: seoOk } = await supabase
        .from("providers")
        .select("id, users!inner(include_in_search_engines)")
        .in("id", rawIds)
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .eq("users.include_in_search_engines", true);

      const allowed = new Set((seoOk ?? []).map((r: any) => r.id as string));

      const byCity = new Map<string, Set<string>>();
      for (const row of locRows as any[]) {
        const pid = row.provider_id as string;
        if (!allowed.has(pid)) continue;
        const city = String(row.city || "").trim();
        if (!city) continue;
        if (!byCity.has(city)) byCity.set(city, new Set());
        byCity.get(city)!.add(pid);
      }

      return [...byCity.entries()]
        .map(([city, set]) => ({ city, count: set.size }))
        .filter((c) => c.count > 0)
        .sort((a, b) => b.count - a.count);
    } catch {
      return [];
    }
  },
);
