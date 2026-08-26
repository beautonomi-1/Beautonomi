import { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildSeoRequestFromHeaders } from "@/lib/seo/build-seo-request";
import { getPublicSiteOriginFromHeaders } from "@/lib/seo/public-site-origin";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { buildLocationHubSitemapEntries } from "@/lib/seo/location-sitemap-helpers";
import { isAdminHostRequest } from "@/lib/seo/admin-host";

/**
 * Request-time sitemap: each host lists its own absolute URLs.
 * Provider URLs are filtered by `tenant_id` when `SUPABASE_SERVICE_ROLE_KEY` is set (Host → tenant via resolveTenantIdWithZaFallback).
 * Without the service role key, provider URLs stay unfiltered (legacy local/dev behaviour).
 */
export const dynamic = "force-dynamic";

/**
 * Prefer service role so sitemap can read `users.include_in_search_engines` and location hub joins (anon RLS blocks).
 * Falls back to anon when the service key is missing (local dev).
 */
function getSupabaseForSitemap() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || url.includes("placeholder")) {
    return null;
  }
  try {
    return getSupabaseAdmin();
  } catch {
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!key) return null;
    return createClient<Database>(url, key);
  }
}

type ProviderTenantScope = { mode: "all" } | { mode: "none" } | { mode: "scoped"; tenantId: string };

async function resolveProviderTenantScope(): Promise<ProviderTenantScope> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return { mode: "all" };
  }
  try {
    const seoReq = await buildSeoRequestFromHeaders();
    const tenantId = await resolveTenantIdWithZaFallback(seoReq);
    return { mode: "scoped", tenantId };
  } catch {
    return { mode: "none" };
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (await isAdminHostRequest()) return [];

  const baseUrl = await getPublicSiteOriginFromHeaders();
  const providerScope = await resolveProviderTenantScope();

  // Static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/search`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/locations`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.88,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.78,
    },
    {
      url: `${baseUrl}/become-a-partner`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: `${baseUrl}/resources`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/help`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/career`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/gift-card`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy-policy`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/terms-and-condition`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/cookie-policy`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/age-suitability`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/provider/eula`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/customer/eula`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  try {
    const supabase = getSupabaseForSitemap();
    if (!supabase) {
      return staticRoutes;
    }
    
    // Fetch categories
    const { data: categories } = await supabase
      .from("global_service_categories")
      .select("slug, updated_at")
      .eq("is_active", true)
      .limit(100);

    const categoryRoutes: MetadataRoute.Sitemap =
      categories?.map((category) => ({
        url: `${baseUrl}/category/${category.slug}`,
        lastModified: category.updated_at ? new Date(category.updated_at) : new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })) || [];

    // Provider profile URLs: tenant-scoped when service role + resolution succeed (multi-market).
    if (providerScope.mode === "none") {
      return [...staticRoutes, ...categoryRoutes];
    }

    // Fetch active providers that have include_in_search_engines enabled
    // We need to join with users table to check the privacy setting
    // First, get all active providers with their user_id
    let providersQuery = supabase
      .from("providers")
      .select("slug, updated_at, user_id")
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(1000);
    if (providerScope.mode === "scoped") {
      providersQuery = providersQuery.eq("tenant_id", providerScope.tenantId);
    }
    const { data: allProviders } = await providersQuery;

    if (!allProviders || allProviders.length === 0) {
      return [...staticRoutes, ...categoryRoutes];
    }

    // Get user IDs and fetch their include_in_search_engines setting
    const userIds = Array.from(new Set(allProviders.map(p => p.user_id).filter(Boolean)));
    
    if (userIds.length === 0) {
      return [...staticRoutes, ...categoryRoutes];
    }

    const { data: users } = await supabase
      .from("users")
      .select("id, include_in_search_engines")
      .in("id", userIds)
      .eq("include_in_search_engines", true);

    // Create a set of user IDs that have include_in_search_engines enabled
    const allowedUserIds = new Set(users?.map(u => u.id) || []);

    // Filter providers to only those whose users have include_in_search_engines enabled
    const providers = allProviders.filter(p => p.user_id && allowedUserIds.has(p.user_id));

    const providerRoutes: MetadataRoute.Sitemap =
      providers?.map((provider) => ({
        url: `${baseUrl}/partner-profile?slug=${encodeURIComponent(provider.slug)}`,
        lastModified: provider.updated_at ? new Date(provider.updated_at) : new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })) || [];

    let locationHubRoutes: MetadataRoute.Sitemap = [];
    if (providerScope.mode === "scoped") {
      try {
        locationHubRoutes = await buildLocationHubSitemapEntries(
          supabase,
          providerScope.tenantId,
          baseUrl,
        );
      } catch (locErr) {
        console.warn("Sitemap: location hub entries skipped:", locErr);
      }
    }

    return [...staticRoutes, ...categoryRoutes, ...providerRoutes, ...locationHubRoutes];
  } catch (error) {
    console.error("Error generating sitemap:", error);
    // Return static routes if database fetch fails
    return staticRoutes;
  }
}
