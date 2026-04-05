import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetadataRoute } from "next";
import {
  SEO_MARKETS,
  cityDisplayToSlug,
  type SeoMarket,
} from "@/lib/seo/location-hub-config";

const MAX_LOCATION_URLS = 800;
const MIN_PROVIDERS_FOR_CATEGORY_URL = 1;

function inferMarket(countryRaw: string): SeoMarket | null {
  const c = countryRaw.trim().toLowerCase();
  if (!c) return null;
  for (const m of SEO_MARKETS) {
    if (c.includes(m.locationCountryMatch.toLowerCase())) return m;
  }
  return null;
}

type CityKey = string;

/**
 * Build /locations/* sitemap paths for a tenant. Safe: only uses providers/locations for the given tenant.
 */
export async function buildLocationHubSitemapEntries(
  supabase: SupabaseClient,
  tenantId: string,
  baseUrl: string,
): Promise<MetadataRoute.Sitemap> {
  const { data: locRows, error } = await supabase
    .from("provider_locations")
    .select("city, country, provider_id, providers!inner(tenant_id, status)")
    .eq("is_active", true)
    .eq("providers.tenant_id", tenantId)
    .eq("providers.status", "active")
    .not("city", "is", null);

  if (error || !locRows?.length) return [];

  const rawIds = [...new Set((locRows as any[]).map((r) => r.provider_id as string))];
  if (rawIds.length === 0) return [];

  const { data: seoRows } = await supabase
    .from("providers")
    .select("id, users!inner(include_in_search_engines)")
    .in("id", rawIds)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .eq("users.include_in_search_engines", true);

  const allowed = new Set((seoRows ?? []).map((r: any) => r.id as string));

  const cityToProviders = new Map<CityKey, Set<string>>();
  const cityMeta = new Map<CityKey, { market: SeoMarket; city: string }>();

  for (const row of locRows as any[]) {
    const pid = row.provider_id as string;
    if (!allowed.has(pid)) continue;
    const city = String(row.city || "").trim();
    const country = String(row.country || "").trim();
    if (!city) continue;
    const market = inferMarket(country);
    if (!market) continue;
    const key = `${market.slug}::${city}`;
    if (!cityToProviders.has(key)) {
      cityToProviders.set(key, new Set());
      cityMeta.set(key, { market, city });
    }
    cityToProviders.get(key)!.add(pid);
  }

  const cityKeys = [...cityToProviders.entries()]
    .filter(([, set]) => set.size >= 1)
    .sort((a, b) => b[1].size - a[1].size);

  if (cityKeys.length === 0) return [];

  const { data: categories } = await supabase
    .from("global_service_categories")
    .select("id, slug")
    .eq("is_active", true)
    .limit(100);

  const catSlugs = (categories ?? []).map((c: any) => c.slug as string).filter(Boolean);
  const categoryIdToSlug = new Map<string, string>();
  for (const c of categories ?? []) {
    const row = c as { id: string; slug: string };
    if (row.id && row.slug) categoryIdToSlug.set(row.id, row.slug);
  }

  const { data: assocs } = await supabase
    .from("provider_global_category_associations")
    .select("provider_id, global_category_id");

  const providersByCategory = new Map<string, Set<string>>();
  for (const a of assocs ?? []) {
    const row = a as { provider_id: string; global_category_id: string };
    const slug = categoryIdToSlug.get(row.global_category_id);
    const pid = row.provider_id;
    if (!slug || !pid) continue;
    if (!providersByCategory.has(slug)) providersByCategory.set(slug, new Set());
    providersByCategory.get(slug)!.add(pid);
  }

  const entries: MetadataRoute.Sitemap = [];
  const now = new Date();

  const marketsInUse = new Set<string>();
  for (const [key] of cityKeys) {
    const meta = cityMeta.get(key);
    if (meta) marketsInUse.add(meta.market.slug);
  }
  for (const countrySlug of [...marketsInUse].sort()) {
    if (entries.length >= MAX_LOCATION_URLS) break;
    entries.push({
      url: `${baseUrl}/locations/${countrySlug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.78,
    });
  }

  for (const [key, pids] of cityKeys) {
    if (entries.length >= MAX_LOCATION_URLS) break;
    const meta = cityMeta.get(key);
    if (!meta) continue;
    const citySlug = cityDisplayToSlug(meta.city);
    if (!citySlug) continue;

    entries.push({
      url: `${baseUrl}/locations/${meta.market.slug}/${citySlug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.75,
    });

    for (const cat of catSlugs) {
      if (entries.length >= MAX_LOCATION_URLS) break;
      const catSet = providersByCategory.get(cat);
      if (!catSet) continue;
      let n = 0;
      for (const pid of pids) {
        if (catSet.has(pid)) n++;
        if (n >= MIN_PROVIDERS_FOR_CATEGORY_URL) break;
      }
      if (n < MIN_PROVIDERS_FOR_CATEGORY_URL) continue;
      entries.push({
        url: `${baseUrl}/locations/${meta.market.slug}/${citySlug}/${cat}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.72,
      });
    }
  }

  return entries;
}
