import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getMapboxService } from "@/lib/mapbox/mapbox";
import { resolveActiveMarketFromRequest } from "@/lib/tenant/resolve-active-market";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import type { PublicProviderCard } from "@/types/beautonomi";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { buildAdReachKey, runAdsAuction, recordAdImpressions } from "@/lib/ads/auction";

export const dynamic = "force-dynamic";
// Increase timeout for this route (Next.js default is 10s, we need more for parallel queries)
export const maxDuration = 30;
// Cache response for 60 seconds (revalidate every minute)
export const revalidate = 60;

/**
 * GET /api/public/home
 * 
 * Returns homepage data:
 * - Top rated providers
 * - Nearest providers (requires location)
 * - Hottest picks (trending)
 * - Upcoming talent (new providers)
 * - Browse by city data
 * 
 * Optimized to run queries in parallel for better performance
 */
export async function GET(request: Request) {
  try {
    // Prefer admin client for broad read access, but probe it first.
    // If the admin key is invalid/mismatched for this URL, fall back to
    // request-scoped server client so public home can still return data.
    let supabase;
    let usingAdminClient = false;
    try {
      supabase = getSupabaseAdmin();
      usingAdminClient = true;
    } catch (adminError) {
      console.warn("Admin client not available, falling back to server client:", adminError);
      supabase = await getSupabaseServer(request);
      if (!supabase) {
        console.error("Supabase client not available in /api/public/home");
        return NextResponse.json(
          {
            data: {
              all: [],
              topRated: [],
              nearest: [],
              hottest: [],
              upcoming: [],
              browseByCity: [],
            },
            error: "Database connection not available",
          },
          { status: 503 }
        );
      }
    }

    let tenantId: string;
    try {
      tenantId = await resolveTenantIdWithZaFallback(request);
    } catch (tenantErr) {
      console.error("Tenant resolution failed in /api/public/home:", tenantErr);
      return NextResponse.json(
        {
          data: {
            all: [],
            topRated: [],
            nearest: [],
            hottest: [],
            upcoming: [],
            browseByCity: [],
          },
          error: { message: "Tenant not configured", code: "TENANT_UNAVAILABLE" },
        },
        { status: 503 }
      );
    }

    const tenantRegionConfig = await getTenantRegionConfig(tenantId);
    const defaultCurrency = tenantRegionConfig?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    // Probe admin client against providers for this tenant. If it returns an
    // auth/key error, use the server client instead of returning empty sections.
    if (usingAdminClient) {
      const probe = await supabase
        .from("providers")
        .select("id", { head: true, count: "exact" })
        .eq("tenant_id", tenantId)
        .limit(1);
      if (probe.error) {
        console.warn("Admin probe failed in /api/public/home; falling back to server client:", {
          message: probe.error.message,
          code: probe.error.code,
          details: probe.error.details,
        });
        supabase = await getSupabaseServer(request);
      }
    }
    
    const { searchParams } = new URL(request.url);
    const latitude = searchParams.get("lat");
    const longitude = searchParams.get("lng");
    const city = searchParams.get("city");
    const country = resolveActiveMarketFromRequest(request, searchParams.get("country")).countryCode;
    const categorySlug = searchParams.get("category"); // Filter by category slug

    const cacheKey = `home-${tenantId}-${latitude ?? ""}-${longitude ?? ""}-${city ?? ""}-${country}-${categorySlug ?? "all"}`;
    const result = await unstable_cache(
      async () => {
    // Supabase query builders require .select() before .eq() in this context.
    // Wrap selects so tenant scoping is always applied consistently.
    const providersTable = () => ({
      select: (...args: any[]) =>
        (supabase.from("providers") as any)
          .select(...args)
          .eq("tenant_id", tenantId),
    });
    // Get category ID if category slug is provided (skip if "all")
    let categoryId: string | null = null;
    let providerIdsForCategory: string[] | null = null;
    
    if (categorySlug && categorySlug !== "all") {
      const { data: categoryData, error: categoryError } = await supabase
        .from("global_service_categories")
        .select("id, name")
        .eq("slug", categorySlug)
        .eq("is_active", true)
        .single();
      
      if (categoryError) {
        console.error(`Category lookup error for slug "${categorySlug}":`, categoryError);
      }
      
      if (categoryData) {
        categoryId = categoryData.id;
        console.log(`Found category "${categoryData.name}" (${categoryId}) for slug "${categorySlug}"`);
        
        // Get provider IDs associated with this category
        const { data: associations, error: assocError } = await supabase
          .from("provider_global_category_associations")
          .select("provider_id, providers!inner(tenant_id)")
          .eq("global_category_id", categoryId)
          .eq("providers.tenant_id", tenantId);
        
        if (assocError) {
          console.error(`Error fetching associations for category ${categoryId}:`, assocError);
        }
        
        if (associations && associations.length > 0) {
          providerIdsForCategory = associations.map((a: any) => a.provider_id);
          console.log(`Found ${providerIdsForCategory.length} providers associated with category "${categorySlug}"`);
        } else {
          // No providers in this category, return empty results
          providerIdsForCategory = [];
          console.log(`No providers found for category "${categorySlug}"`);
        }
      } else {
        console.warn(`Category with slug "${categorySlug}" not found or inactive`);
        providerIdsForCategory = [];
      }
    }

    // Helper function to apply category filter to a query
    const applyCategoryFilter = (query: any) => {
      if (providerIdsForCategory !== null) {
        if (providerIdsForCategory.length === 0) {
          // Return a query that will return no results
          return query.in("id", ["00000000-0000-0000-0000-000000000000"]);
        }
        return query.in("id", providerIdsForCategory);
      }
      return query;
    };

    // Helper function to add timeout to Supabase queries
    const withTimeout = async (queryPromise: Promise<{ data: any; error: any }>, timeoutMs: number = 3000, _queryName: string = 'unknown') => {
      try {
        return await Promise.race([
          queryPromise,
          new Promise<{ data: null; error: { message: string } }>((_, reject) =>
            setTimeout(() => reject(new Error(`Query timeout after ${timeoutMs}ms`)), timeoutMs)
          ),
        ]);
      } catch (error) {
        console.error("Query timeout or error:", error);
        return { data: null, error: { message: error instanceof Error ? error.message : "Query timeout" } };
      }
    };

    // Define common provider fields to avoid repetition
    // Note: starting_price is calculated from offerings, not stored in providers table
    const providerFields = `
      id,
      slug,
      business_name,
      business_type,
      offers_mobile_services,
      rating_average,
      review_count,
      thumbnail_url,
      avatar_url,
      is_featured,
      is_verified,
      currency,
      description,
      user_id
    `;

    // Helper function to filter providers by include_in_search_engines setting
    // NOTE: This filter is NOT applied to the home page - we want to show all active providers
    // The SEO setting only affects search engine indexing (sitemap, robots.txt), not home page visibility
    // This function is kept for potential future use but is currently not called
    const filterProvidersBySeoSetting = async (providers: any[]): Promise<any[]> => {
      // For home page, return all providers without filtering
      // SEO settings should only affect search engine indexing, not user-facing pages
      return providers;
    };

    // Run independent queries in parallel for better performance
    const [
      topRatedResult,
      upcomingResult,
      allProvidersResult,
      browseByCityResult,
      hottestResult,
    ] = await Promise.allSettled([
      // 1. Top Rated Providers (highest rating, minimum 5 reviews)
      // Fallback: If no providers with 5+ reviews, show providers with any reviews, then verified/featured
      (async () => {
        try {
        // First try: providers with 5+ reviews
        const { data: topRatedWithReviews } = await withTimeout(applyCategoryFilter(
          providersTable()
            .select(providerFields)
            .eq("status", "active")
            .gte("review_count", 5)
            .order("rating_average", { ascending: false })
            .limit(12)
        ), 5000);
        
        if (topRatedWithReviews && topRatedWithReviews.length > 0) {
          const filtered = await filterProvidersBySeoSetting(topRatedWithReviews);
          return { data: filtered, error: null };
        }
        
        // Fallback 1: providers with any reviews
        const { data: topRatedAnyReviews } = await withTimeout(applyCategoryFilter(
          providersTable()
            .select(providerFields)
            .eq("status", "active")
            .gt("review_count", 0)
            .order("rating_average", { ascending: false })
            .limit(12)
        ), 5000, 'topRated-any');
        
        if (topRatedAnyReviews && topRatedAnyReviews.length > 0) {
          const filtered = await filterProvidersBySeoSetting(topRatedAnyReviews);
          return { data: filtered, error: null };
        }
        
        // Fallback 2: verified or featured providers
        const { data: topRatedFallback } = await withTimeout(applyCategoryFilter(
          providersTable()
            .select(providerFields)
            .eq("status", "active")
            .or("is_verified.eq.true,is_featured.eq.true")
            .order("created_at", { ascending: false })
            .limit(12)
        ), 5000, 'topRated-fallback');
        
        const filtered = await filterProvidersBySeoSetting(topRatedFallback || []);
        return { data: filtered, error: null };
        } catch (error) {
          console.error("Error in top rated query:", error);
          return { data: [], error: null };
        }
      })(),

      // 2. Upcoming Talent (new providers, created in last 90 days)
      // Fallback: If no providers in last 90 days, show newest providers
      (async () => {
        try {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        
        // First try: providers created in last 90 days
        const { data: recentProviders } = await withTimeout(applyCategoryFilter(
          providersTable()
            .select(providerFields)
            .eq("status", "active")
            .gte("created_at", ninetyDaysAgo.toISOString())
            .order("created_at", { ascending: false })
            .limit(12)
        ), 5000, 'upcoming-recent');
        
        if (recentProviders && recentProviders.length > 0) {
          const filtered = await filterProvidersBySeoSetting(recentProviders);
          return { data: filtered, error: null };
        }
        
        // Fallback: newest providers (regardless of date)
        const { data: newestProviders } = await withTimeout(applyCategoryFilter(
          providersTable()
            .select(providerFields)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(12)
        ), 5000, 'upcoming-newest');
        
        const filtered = await filterProvidersBySeoSetting(newestProviders || []);
        return { data: filtered, error: null };
        } catch (error) {
          console.error("Error in upcoming talent query:", error);
          return { data: [], error: null };
        }
      })(),

      // 3. All providers for initial listings
      (async () => {
        try {
          const result = await withTimeout(applyCategoryFilter(
            providersTable()
              .select(providerFields)
              .eq("status", "active")
              .order("created_at", { ascending: false })
              .limit(20)
          ), 5000, 'all-providers');
          const filtered = await filterProvidersBySeoSetting(result.data || []);
          return { data: filtered, error: result.error };
        } catch (error) {
          console.error("Error in all providers query:", error);
          return { data: [], error: null };
        }
      })(),

      // 4. Browse by City - Count unique providers per city and include provider names/slugs
      (async () => {
        try {
          // Get locations with provider info
          // Increased limit to capture more cities, especially for countries with many locations
          const { data: locationsData, error: locationsError } = await supabase
            .from("provider_locations")
            .select("city, country, provider_id, providers!inner(tenant_id)")
            .eq("is_active", true)
            .eq("providers.tenant_id", tenantId)
            .limit(400);

          if (locationsError || !locationsData) {
            console.error("Error fetching locations for browse by city:", locationsError);
            return { data: [], error: null };
          }

          // Get unique provider IDs
          const providerIds = [...new Set(locationsData.map((loc: any) => loc.provider_id).filter(Boolean))];
          
          // Fetch provider names, slugs, and ratings for sorting
          const { data: providersDataRaw } = providerIds.length > 0 ? await providersTable()
            .select("id, business_name, slug, status, user_id, rating_average, review_count")
            .eq("status", "active")
            .in("id", providerIds) : { data: null };
          
          // Filter by include_in_search_engines
          const providersData = providersDataRaw ? await filterProvidersBySeoSetting(providersDataRaw) : null;

          // Create a map of provider_id -> {name, slug, rating, review_count}
          const providerMap = new Map<string, { name: string; slug: string; rating: number; review_count: number }>();
          if (providersData) {
            (providersData as any[]).forEach((p: any) => {
              if (p.business_name && p.slug) {
                providerMap.set(p.id, { 
                  name: p.business_name, 
                  slug: p.slug,
                  rating: p.rating_average || 0,
                  review_count: p.review_count || 0
                });
              }
            });
          }

          // Normalize country names for consistent matching
          const normalizeCountryName = (country: string): string => {
            if (!country) return "";
            // Normalize common variations
            const normalized = country.trim();
            const countryMap: Record<string, string> = {
              "south africa": "South Africa",
              "kenya": "Kenya",
              "ghana": "Ghana",
              "nigeria": "Nigeria",
              "egypt": "Egypt",
            };
            const lower = normalized.toLowerCase();
            return countryMap[lower] || normalized;
          };

          // Group by city/country and track unique provider IDs with their info (including ratings)
          const citiesMap = new Map<string, { 
            city: string; 
            country: string; 
            providers: Map<string, { name: string; slug: string; rating: number; review_count: number }> 
          }>();
          
          (locationsData as any[]).forEach((loc: any) => {
            if (!loc.city || !loc.country || !loc.provider_id) return; // Skip invalid data
            
            // Normalize country name for consistency
            const normalizedCountry = normalizeCountryName(loc.country);
            const normalizedCity = loc.city.trim();
            
            const key = `${normalizedCity}-${normalizedCountry}`;
            const existing = citiesMap.get(key);
            const providerInfo = providerMap.get(loc.provider_id);
            
            if (!providerInfo) return; // Skip if provider not found or inactive
            
            if (existing) {
              existing.providers.set(loc.provider_id, providerInfo);
            } else {
              citiesMap.set(key, { 
                city: normalizedCity, 
                country: normalizedCountry, 
                providers: new Map([[loc.provider_id, providerInfo]])
              });
            }
          });

          // Convert to array with count and businesses array
          // Sort providers within each city by rating (highest first), then by review count
          const browseByCity = Array.from(citiesMap.values())
            .map(city => {
              // Sort providers by rating (highest first), then by review count (most reviews first)
              const sortedProviders = Array.from(city.providers.values())
                .sort((a, b) => {
                  // First sort by rating (descending)
                  if (b.rating !== a.rating) {
                    return b.rating - a.rating;
                  }
                  // If ratings are equal, sort by review count (descending)
                  return b.review_count - a.review_count;
                });
              
              return {
                city: city.city,
                country: city.country,
                count: city.providers.size, // Count unique providers
                businesses: sortedProviders.map(p => p.name), // Provider names (sorted by rating)
                providers: sortedProviders.map(p => ({ name: p.name, slug: p.slug })) // Full provider info with slugs (sorted by rating)
              };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 50); // Increased to top 50 cities for better coverage

          return { data: browseByCity, error: null };
        } catch (error) {
          console.error("Error in browse by city:", error);
          return { data: [], error: null };
        }
      })(),

      // 5. Hottest Picks (trending - most bookings in last 30 days)
      (async () => {
        try {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          // Get booking counts per provider for the last 30 days (capped for performance)
          let bookingQuery = supabase
            .from("bookings")
            .select("provider_id")
            .eq("tenant_id", tenantId)
            .gte("created_at", thirtyDaysAgo.toISOString())
            .in("status", ["confirmed", "completed", "in_progress"])
            .limit(5000);
          if (providerIdsForCategory !== null && providerIdsForCategory.length > 0) {
            bookingQuery = bookingQuery.in("provider_id", providerIdsForCategory);
          } else if (providerIdsForCategory !== null && providerIdsForCategory.length === 0) {
            return { data: [], error: null };
          }
          const { data: bookingCounts, error: bookingError } = await bookingQuery;

          if (bookingError || !bookingCounts || bookingCounts.length === 0) {
            // Fallback 1: featured providers
            const { data: featuredData } = await applyCategoryFilter(
              providersTable()
                .select(providerFields)
                .eq("status", "active")
                .eq("is_featured", true)
                .order("created_at", { ascending: false })
                .limit(12)
            );

            if (featuredData && featuredData.length > 0) {
              return { data: featuredData, error: null };
            }

            // Fallback 2: verified providers
            const { data: verifiedData } = await applyCategoryFilter(
              providersTable()
                .select(providerFields)
                .eq("status", "active")
                .eq("is_verified", true)
                .order("created_at", { ascending: false })
                .limit(12)
            );

            if (verifiedData && verifiedData.length > 0) {
              return { data: verifiedData, error: null };
            }

            // Fallback 3: newest providers
            const { data: newestData } = await applyCategoryFilter(
              providersTable()
                .select(providerFields)
                .eq("status", "active")
                .order("created_at", { ascending: false })
                .limit(12)
            );

            return { data: newestData || [], error: null };
          }

          // Count bookings per provider
          const providerBookingCounts = new Map<string, number>();
          (bookingCounts as any[]).forEach((booking: any) => {
            const providerId = booking.provider_id;
            if (providerId) {
              providerBookingCounts.set(
                providerId,
                (providerBookingCounts.get(providerId) || 0) + 1
              );
            }
          });

          // Get provider IDs sorted by booking count (descending)
          const sortedProviderIds = Array.from(providerBookingCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)
            .map(([providerId]) => providerId);

          if (sortedProviderIds.length === 0) {
            // No bookings, fallback 1: featured providers
            const { data: featuredData } = await applyCategoryFilter(
              providersTable()
                .select(providerFields)
                .eq("status", "active")
                .eq("is_featured", true)
                .order("created_at", { ascending: false })
                .limit(12)
            );

            if (featuredData && featuredData.length > 0) {
              return { data: featuredData, error: null };
            }

            // Fallback 2: verified providers
            const { data: verifiedData } = await applyCategoryFilter(
              providersTable()
                .select(providerFields)
                .eq("status", "active")
                .eq("is_verified", true)
                .order("created_at", { ascending: false })
                .limit(12)
            );

            if (verifiedData && verifiedData.length > 0) {
              return { data: verifiedData, error: null };
            }

            // Fallback 3: newest providers
            const { data: newestData } = await applyCategoryFilter(
              providersTable()
                .select(providerFields)
                .eq("status", "active")
                .order("created_at", { ascending: false })
                .limit(12)
            );

            return { data: newestData || [], error: null };
          }

          // Fetch provider details for top providers
          const { data: hottestProvidersRaw, error: hottestError } = await providersTable()
            .select(providerFields)
            .eq("status", "active")
            .in("id", sortedProviderIds);
          
          // Filter by include_in_search_engines
          const hottestProviders = hottestProvidersRaw ? await filterProvidersBySeoSetting(hottestProvidersRaw) : null;

          if (hottestError || !hottestProviders) {
            // Fallback 1: featured providers
            const { data: featuredData } = await applyCategoryFilter(
              providersTable()
                .select(providerFields)
                .eq("status", "active")
                .eq("is_featured", true)
                .order("created_at", { ascending: false })
                .limit(12)
            );

            if (featuredData && featuredData.length > 0) {
              return { data: featuredData, error: null };
            }

            // Fallback 2: verified providers
            const { data: verifiedData } = await applyCategoryFilter(
              providersTable()
                .select(providerFields)
                .eq("status", "active")
                .eq("is_verified", true)
                .order("created_at", { ascending: false })
                .limit(12)
            );

            if (verifiedData && verifiedData.length > 0) {
              return { data: verifiedData, error: null };
            }

            // Fallback 3: newest providers
            const { data: newestData } = await applyCategoryFilter(
              providersTable()
                .select(providerFields)
                .eq("status", "active")
                .order("created_at", { ascending: false })
                .limit(12)
            );

            return { data: newestData || [], error: null };
          }

          // Sort providers to match the booking count order
          const providerMap = new Map(
            (hottestProviders as any[]).map((p: any) => [p.id, p])
          );
          let hottest: any[] = sortedProviderIds
            .map((id) => providerMap.get(id))
            .filter((p): p is unknown => p !== undefined);

          // If we have fewer than 12 providers with bookings, fill with featured providers
          if (hottest.length < 12) {
            const existingIds = new Set(hottest.map((p: any) => p.id));
            const { data: featuredProviders } = await applyCategoryFilter(
              providersTable()
                .select(providerFields)
                .eq("status", "active")
                .eq("is_featured", true)
                .limit(20)
            );

            if (featuredProviders) {
              const filteredFeatured = (featuredProviders as any[])
                .filter((p: any) => !existingIds.has(p.id))
                .slice(0, 12 - hottest.length);
              // Filter featured providers by SEO setting
              const seoFiltered = await filterProvidersBySeoSetting(filteredFeatured);
              hottest = [...hottest, ...seoFiltered];
            }
          }

          return { data: hottest, error: null };
        } catch (error) {
          console.error("Error calculating hottest picks:", error);
          // Fallback 1: featured providers
          const { data: featuredData } = await applyCategoryFilter(
            providersTable()
              .select(providerFields)
              .eq("status", "active")
              .eq("is_featured", true)
              .order("created_at", { ascending: false })
              .limit(12)
          );

          if (featuredData && featuredData.length > 0) {
            const filtered = await filterProvidersBySeoSetting(featuredData);
            return { data: filtered, error: null };
          }

          // Fallback 2: verified providers
          const { data: verifiedData } = await applyCategoryFilter(
            providersTable()
              .select(providerFields)
              .eq("status", "active")
              .eq("is_verified", true)
              .order("created_at", { ascending: false })
              .limit(12)
          );

          if (verifiedData && verifiedData.length > 0) {
            const filtered = await filterProvidersBySeoSetting(verifiedData);
            return { data: filtered, error: null };
          }

          // Fallback 3: newest providers
          const { data: newestData } = await applyCategoryFilter(
            providersTable()
              .select(providerFields)
              .eq("status", "active")
              .order("created_at", { ascending: false })
              .limit(12)
          );

          const filtered = await filterProvidersBySeoSetting(newestData || []);
          return { data: filtered, error: null };
        }
      })(),
    ]);

    // Extract raw results from Promise.allSettled
    const topRatedRaw = topRatedResult.status === "fulfilled" 
      ? (topRatedResult.value.data || []) as any[]
      : [];
    
    const upcomingRaw = upcomingResult.status === "fulfilled"
      ? (upcomingResult.value.data || []) as any[]
      : [];
    
    const allProvidersRaw = allProvidersResult.status === "fulfilled"
      ? (allProvidersResult.value.data || []) as any[]
      : [];

    const browseByCity = browseByCityResult.status === "fulfilled"
      ? (browseByCityResult.value.data || [])
      : [];

    const hottestRaw = hottestResult.status === "fulfilled"
      ? (hottestResult.value.data || []) as any[]
      : [];

    // Collect all provider IDs to fetch additional data in one go
    const allProviderIds = new Set<string>();
    [...topRatedRaw, ...upcomingRaw, ...allProvidersRaw, ...hottestRaw].forEach((p: any) => {
      if (p?.id) allProviderIds.add(p.id);
    });

    // Fetch locations for all providers (only if we have provider IDs)
    const { data: locations } = allProviderIds.size > 0 ? await supabase
      .from("provider_locations")
      .select("provider_id, city, country, is_primary")
      .in("provider_id", Array.from(allProviderIds))
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .limit(500) : { data: null }; // Primary location first, limit for performance

    // Create a map of provider_id -> location (prefer primary)
    const locationMap = new Map<string, { city: string; country: string }>();
    if (locations) {
      locations.forEach((loc: any) => {
        if (!locationMap.has(loc.provider_id)) {
          locationMap.set(loc.provider_id, {
            city: loc.city || "",
            country: loc.country || "",
          });
        }
      });
    }

    // Fetch badges and points for all providers (non-blocking: skip badges on failure)
    const badgeMap = new Map<string, any>();
    if (allProviderIds.size > 0) {
      try {
        const { data: providerPoints } = await supabase
          .from("provider_points")
          .select(`
            provider_id,
            total_points,
            current_badge_id,
            provider_badges!provider_points_current_badge_id_fkey (
              id,
              name,
              slug,
              description,
              icon_url,
              tier,
              color,
              requirements,
              benefits
            )
          `)
          .in("provider_id", Array.from(allProviderIds));
        if (providerPoints) {
          providerPoints.forEach((pp: any) => {
            if (pp.current_badge_id && pp.provider_badges) {
              badgeMap.set(pp.provider_id, {
                id: pp.provider_badges.id,
                name: pp.provider_badges.name,
                slug: pp.provider_badges.slug,
                description: pp.provider_badges.description,
                icon_url: pp.provider_badges.icon_url,
                tier: pp.provider_badges.tier,
                color: pp.provider_badges.color,
                requirements: pp.provider_badges.requirements,
                benefits: pp.provider_badges.benefits,
              });
            }
          });
        }
      } catch (badgeErr) {
        console.warn("Home: provider_points/badges fetch failed, continuing without badges:", badgeErr);
      }
    }

    // Fetch minimum prices from offerings for each provider (only if we have provider IDs)
    // Increased limit and added price > 0 filter to ensure we get all valid prices
    const { data: offerings } = allProviderIds.size > 0 ? await supabase
      .from("offerings")
      .select("provider_id, price, currency, supports_at_home, service:services(supports_at_home)")
      .in("provider_id", Array.from(allProviderIds))
      .eq("is_active", true)
      .not("price", "is", null)
      .gt("price", 0) // Ensure price is greater than 0
      .order("price", { ascending: true })
      .limit(2000) : { data: null }; // Increased limit to ensure we get all prices

    // Also fetch prices directly from services table as fallback (some providers may have services without offerings)
    const { data: services } = allProviderIds.size > 0 ? await supabase
      .from("services")
      .select("provider_id, price, currency, supports_at_home")
      .in("provider_id", Array.from(allProviderIds))
      .eq("is_active", true)
      .not("price", "is", null)
      .gt("price", 0) // Ensure price is greater than 0
      .order("price", { ascending: true })
      .limit(2000) : { data: null };

    // Create a map of provider_id -> minimum price and service type support
    const priceMap = new Map<string, { price: number; currency: string }>();
    const serviceTypeMap = new Map<string, { supports_house_calls: boolean; supports_salon: boolean }>();
    
    // Process offerings first (preferred source - these are the actual bookable items)
    if (offerings && offerings.length > 0) {
      offerings.forEach((offering: any) => {
        // Only process if price exists and is valid
        if (offering.price != null && offering.price > 0) {
          const existing = priceMap.get(offering.provider_id);
          if (!existing || Number(offering.price) < existing.price) {
            priceMap.set(offering.provider_id, {
              price: Number(offering.price),
              currency: offering.currency || defaultCurrency,
            });
          }
        }
        
        // Check service type support (supports_salon set only from provider_locations with location_type = 'salon')
        const serviceType = serviceTypeMap.get(offering.provider_id) || { supports_house_calls: false, supports_salon: false };
        if (Boolean(offering.supports_at_home) || Boolean(offering.service?.supports_at_home)) {
          serviceType.supports_house_calls = true;
        }
        serviceTypeMap.set(offering.provider_id, serviceType);
      });
    }
    
    // Process services as fallback (if no offerings or to find lower prices)
    if (services && services.length > 0) {
      services.forEach((service: any) => {
        // Only process if price exists and is valid
        if (service.price != null && service.price > 0) {
          const existing = priceMap.get(service.provider_id);
          const servicePrice = Number(service.price);
          // Always use service price if no offering price exists, or if service price is lower
          // This ensures we get the lowest price from both sources
          if (!existing) {
            // No offering price, use service price
            priceMap.set(service.provider_id, {
              price: servicePrice,
              currency: service.currency || defaultCurrency,
            });
          } else if (servicePrice < existing.price) {
            // Service price is lower, use it
            priceMap.set(service.provider_id, {
              price: servicePrice,
              currency: service.currency || defaultCurrency,
            });
          }
        }
        
        // Check service type support (supports_salon set only from provider_locations with location_type = 'salon')
        const serviceType = serviceTypeMap.get(service.provider_id) || { supports_house_calls: false, supports_salon: false };
        if (service.supports_at_home) {
          serviceType.supports_house_calls = true;
        }
        serviceTypeMap.set(service.provider_id, serviceType);
      });
    }
    
    // Salon support only from locations with location_type = 'salon' (base = distance-only)
    if (allProviderIds.size > 0) {
      const { data: providerLocations } = await supabase
        .from("provider_locations")
        .select("provider_id, location_type")
        .in("provider_id", Array.from(allProviderIds))
        .eq("is_active", true)
        .limit(500);

      if (providerLocations) {
        providerLocations.forEach((loc: any) => {
          if ((loc.location_type || "salon") !== "salon") return;
          const serviceType = serviceTypeMap.get(loc.provider_id) || { supports_house_calls: false, supports_salon: false };
          serviceType.supports_salon = true;
          serviceTypeMap.set(loc.provider_id, serviceType);
        });
      }
    }

    // Calculate distances for all providers if user location is available
    const distanceMap = new Map<string, number>();
    if (latitude && longitude) {
      try {
        const mapbox = await getMapboxService();
        const userCoords = {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
        };

        // Get locations with coordinates for all providers in the main sections
        const allProviderIdsArray = Array.from(allProviderIds);
        if (allProviderIdsArray.length > 0) {
          const { data: allLocationsWithCoords } = await supabase
            .from("provider_locations")
            .select("provider_id, latitude, longitude")
            .in("provider_id", allProviderIdsArray)
            .eq("is_active", true)
            .not("latitude", "is", null)
            .not("longitude", "is", null);

          if (allLocationsWithCoords) {
            allLocationsWithCoords.forEach((loc: any) => {
              if (!distanceMap.has(loc.provider_id) && loc.latitude && loc.longitude) {
                try {
                  const distance = mapbox.calculateDistance(userCoords, {
                    latitude: loc.latitude,
                    longitude: loc.longitude,
                  });
                  distanceMap.set(loc.provider_id, distance);
                } catch (error) {
                  console.error(`Error calculating distance for provider ${loc.provider_id}:`, error);
                }
              }
            });
          }
        }
      } catch (error) {
        console.error("Error calculating distances for main sections:", error);
        // Continue without distances if calculation fails
      }
    }

    // Helper function to transform provider data to match PublicProviderCard type
    const transformProvider = (provider: any): PublicProviderCard => {
      const location = locationMap.get(provider.id);
      const priceInfo = priceMap.get(provider.id);
      const serviceType = serviceTypeMap.get(provider.id) || { supports_house_calls: false, supports_salon: false };
      const distance = distanceMap.get(provider.id);
      const badge = badgeMap.get(provider.id);

      // Ensure service type fields are always boolean, never undefined
      const supportsHouseCalls = Boolean(
        serviceType.supports_house_calls || provider.offers_mobile_services === true
      );
      const supportsSalon = Boolean(serviceType.supports_salon);

      // Ensure description is preserved (can be string, null, or undefined)
      const description = provider.description !== undefined ? provider.description : null;

      return {
        id: provider.id,
        slug: provider.slug,
        business_name: provider.business_name,
        business_type: provider.business_type || 'salon', // Default to salon if not specified
        rating: provider.rating_average || 0, // Map rating_average to rating
        review_count: provider.review_count || 0,
        thumbnail_url: provider.thumbnail_url,
        avatar_url: provider.avatar_url ?? null,
        city: location?.city || "",
        country: location?.country || "",
        is_featured: provider.is_featured || false,
        is_verified: provider.is_verified || false,
        starting_price: priceInfo?.price,
        currency: priceInfo?.currency || provider.currency || defaultCurrency,
        description: description, // Preserve description from provider data
        distance_km: distance || null, // Include distance if calculated
        supports_house_calls: supportsHouseCalls,
        supports_salon: supportsSalon,
        current_badge: badge || null,
      };
    };

    // Transform all provider arrays
    const topRated = topRatedRaw.map(transformProvider);
    const upcoming = upcomingRaw.map(transformProvider);
    const allProviders = allProvidersRaw.map(transformProvider);
    const hottest = hottestRaw.map(transformProvider);

    // Nearest Providers (if location provided) - run separately as it depends on location
    let nearest: PublicProviderCard[] = [];
    if (latitude && longitude) {
      try {
        const mapbox = await getMapboxService();
        const userCoords = {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
        };

        // Get all active providers (will filter by SEO setting after)
        const { data: allProvidersForDistanceRaw, error: providersError } = await providersTable()
          .select(providerFields)
          .eq("status", "active")
          .limit(100);
        
        // Filter by include_in_search_engines
        const allProvidersForDistance = allProvidersForDistanceRaw ? await filterProvidersBySeoSetting(allProvidersForDistanceRaw) : null;

        if (providersError || !allProvidersForDistance) {
          throw providersError || new Error("Failed to fetch providers");
        }

        // For "Nearest" we use the branch closest to the customer (not primary).
        // So Cape Town customers see the CT branch; Johannesburg customers see the JHB branch.
        const providerIds = allProvidersForDistance.map((p: any) => p.id);
        const nearestProviderIds = providerIds;
        const { data: allLocations, error: locationsError } =
          providerIds.length > 0
            ? await supabase
                .from("provider_locations")
                .select("provider_id, latitude, longitude, city, country, location_type")
                .in("provider_id", providerIds)
                .eq("is_active", true)
                .not("latitude", "is", null)
                .not("longitude", "is", null)
            : { data: [] as any[], error: null };

        if (locationsError) {
          throw locationsError;
        }

        // Per provider, pick the location nearest to the user (so multi-branch shows correct branch)
        const distanceLocationMap = new Map<string, { latitude: number; longitude: number }>();
        const nearestLocationMap = new Map<string, { city: string; country: string }>();
        if (allLocations && allLocations.length > 0) {
          const byProvider = new Map<string, any[]>();
          (allLocations as any[]).forEach((loc: any) => {
            if (!byProvider.has(loc.provider_id)) byProvider.set(loc.provider_id, []);
            byProvider.get(loc.provider_id)!.push(loc);
          });
          byProvider.forEach((locs, providerId) => {
            let nearest: { loc: any; distance: number } | null = null;
            for (const loc of locs) {
              const distance = mapbox.calculateDistance(userCoords, {
                latitude: Number(loc.latitude),
                longitude: Number(loc.longitude),
              });
              if (nearest === null || distance < nearest.distance) {
                nearest = { loc, distance };
              }
            }
            if (nearest) {
              distanceLocationMap.set(providerId, {
                latitude: Number(nearest.loc.latitude),
                longitude: Number(nearest.loc.longitude),
              });
              nearestLocationMap.set(providerId, {
                city: nearest.loc.city ?? "",
                country: nearest.loc.country ?? "",
              });
            }
          });
        }

        // Fetch prices and service types for nearest providers from both offerings and services
        const { data: nearestOfferings } = await supabase
          .from("offerings")
          .select("provider_id, price, currency, supports_at_home, service:services(supports_at_home)")
          .in("provider_id", nearestProviderIds)
          .eq("is_active", true)
          .not("price", "is", null)
          .order("price", { ascending: true });

        // Also fetch prices directly from services table
        const { data: nearestServices } = await supabase
          .from("services")
          .select("provider_id, price, currency, supports_at_home")
          .in("provider_id", nearestProviderIds)
          .eq("is_active", true)
          .not("price", "is", null)
          .order("price", { ascending: true });

        const nearestPriceMap = new Map<string, { price: number; currency: string }>();
        const nearestServiceTypeMap = new Map<string, { supports_house_calls: boolean; supports_salon: boolean }>();
        
        // Process offerings first (preferred source)
        if (nearestOfferings && nearestOfferings.length > 0) {
          nearestOfferings.forEach((offering: any) => {
            // Only process if price exists and is valid
            if (offering.price != null && offering.price > 0) {
              const existing = nearestPriceMap.get(offering.provider_id);
              if (!existing || Number(offering.price) < existing.price) {
                nearestPriceMap.set(offering.provider_id, {
                  price: Number(offering.price),
                  currency: offering.currency || defaultCurrency,
                });
              }
            }
            
            // Check service type support (supports_salon set only from salon-type locations below)
            const serviceType = nearestServiceTypeMap.get(offering.provider_id) || { supports_house_calls: false, supports_salon: false };
            if (Boolean(offering.supports_at_home) || Boolean(offering.service?.supports_at_home)) {
              serviceType.supports_house_calls = true;
            }
            nearestServiceTypeMap.set(offering.provider_id, serviceType);
          });
        }
        
        // Process services as fallback (if no offerings or to find lower prices)
        if (nearestServices && nearestServices.length > 0) {
          nearestServices.forEach((service: any) => {
            // Only process if price exists and is valid
            if (service.price != null && service.price > 0) {
              const existing = nearestPriceMap.get(service.provider_id);
              const servicePrice = Number(service.price);
              // Use service price if no offering price exists, or if service price is lower
              if (!existing || servicePrice < existing.price) {
                nearestPriceMap.set(service.provider_id, {
                  price: servicePrice,
                  currency: service.currency || defaultCurrency,
                });
              }
            }
            
            // Check service type support (supports_salon set only from salon-type locations below)
            const serviceType = nearestServiceTypeMap.get(service.provider_id) || { supports_house_calls: false, supports_salon: false };
            if (service.supports_at_home) {
              serviceType.supports_house_calls = true;
            }
            nearestServiceTypeMap.set(service.provider_id, serviceType);
          });
        }
        
        // Salon support only from locations with location_type = 'salon' (base = distance-only)
        if (allLocations && allLocations.length > 0) {
          (allLocations as any[]).forEach((loc: any) => {
            if ((loc.location_type || "salon") !== "salon") return;
            const serviceType = nearestServiceTypeMap.get(loc.provider_id) || { supports_house_calls: false, supports_salon: false };
            serviceType.supports_salon = true;
            nearestServiceTypeMap.set(loc.provider_id, serviceType);
          });
        }

        // Fill missing service type from provider_locations (salon-type only)
        if (nearestProviderIds.length > 0) {
          const { data: allNearestLocations } = await supabase
            .from("provider_locations")
            .select("provider_id, location_type")
            .in("provider_id", nearestProviderIds)
            .eq("is_active", true)
            .limit(500);

          if (allNearestLocations) {
            allNearestLocations.forEach((loc: any) => {
              if ((loc.location_type || "salon") !== "salon") return;
              if (!nearestServiceTypeMap.has(loc.provider_id)) {
                nearestServiceTypeMap.set(loc.provider_id, { supports_house_calls: false, supports_salon: true });
              } else {
                const serviceType = nearestServiceTypeMap.get(loc.provider_id)!;
                serviceType.supports_salon = true;
              }
            });
          }
        }

        // Calculate distances and sort
        const providersWithDistance = allProvidersForDistance
          .map((provider: any) => {
            const location = distanceLocationMap.get(provider.id);

            if (!location) {
              return null;
            }

            const distance = mapbox.calculateDistance(userCoords, location);

            return {
              ...provider,
              distance_km: distance,
            };
          })
          .filter((p): p is NonNullable<typeof p> => p !== null)
          .sort((a, b) => (a as { distance_km: number }).distance_km - (b as { distance_km: number }).distance_km)
          .slice(0, 12)
          .map((providerWithDistance: any) => {
            // Extract distance_km before destructuring
            const distance_km = providerWithDistance.distance_km;
            const { distance_km: _, ...provider } = providerWithDistance;
            
            // Transform to PublicProviderCard format
            const loc = nearestLocationMap.get(provider.id);
            const priceInfo = nearestPriceMap.get(provider.id);
            const badge = badgeMap.get(provider.id);
            let serviceType = nearestServiceTypeMap.get(provider.id);
            
            if (!serviceType) {
              serviceType = { supports_house_calls: false, supports_salon: false };
            }

            const supportsHouseCalls = Boolean(
              serviceType.supports_house_calls || provider.offers_mobile_services === true
            );
            const supportsSalon = Boolean(serviceType.supports_salon);
            
            return {
              id: provider.id,
              slug: provider.slug,
              business_name: provider.business_name,
              business_type: provider.business_type || 'salon',
              rating: provider.rating_average || 0,
              review_count: provider.review_count || 0,
              thumbnail_url: provider.thumbnail_url,
              avatar_url: provider.avatar_url ?? null,
              city: loc?.city || "",
              country: loc?.country || "",
              is_featured: provider.is_featured || false,
              is_verified: provider.is_verified || false,
              starting_price: priceInfo?.price,
              currency: priceInfo?.currency || provider.currency || defaultCurrency,
              description: provider.description ?? null, // Use ?? to preserve empty strings
              distance_km: distance_km || null, // Include distance in the result
              supports_house_calls: supportsHouseCalls,
              supports_salon: supportsSalon,
              current_badge: badge || null,
            };
          });

        nearest = providersWithDistance as PublicProviderCard[];
      } catch (error) {
        console.error("Error calculating distances for nearest providers:", error);
        // Fallback to city/country filtering via provider_locations
        try {
          const { data: fallbackLocations } = await supabase
            .from("provider_locations")
            .select("provider_id, providers!inner(tenant_id)")
            .eq("country", country)
            .eq("is_active", true)
            .eq("providers.tenant_id", tenantId)
            .limit(12);
          
          const providerIds = fallbackLocations?.map(loc => loc.provider_id) || [];
          if (providerIds.length > 0) {
            const { data: fallbackData } = await providersTable()
              .select(providerFields)
              .eq("status", "active")
              .in("id", providerIds)
              .limit(12);

            if (fallbackData) {
              // Transform fallback data
              const fallbackLocationMap = new Map<string, { city: string; country: string }>();
              const { data: fallbackLocationsData } = await supabase
                .from("provider_locations")
                .select("provider_id, city, country, is_primary")
                .in("provider_id", providerIds)
                .eq("is_active", true)
                .order("is_primary", { ascending: false });
              
              if (fallbackLocationsData) {
                fallbackLocationsData.forEach((loc: any) => {
                  if (!fallbackLocationMap.has(loc.provider_id)) {
                    fallbackLocationMap.set(loc.provider_id, {
                      city: loc.city || "",
                      country: loc.country || "",
                    });
                  }
                });
              }

              const { data: fallbackOfferings } = await supabase
                .from("offerings")
                .select("provider_id, price, currency")
                .in("provider_id", providerIds)
                .eq("is_active", true)
                .not("price", "is", null)
                .order("price", { ascending: true });

              // Also fetch from services
              const { data: fallbackServices } = await supabase
                .from("services")
                .select("provider_id, price, currency")
                .in("provider_id", providerIds)
                .eq("is_active", true)
                .not("price", "is", null)
                .order("price", { ascending: true });

              const fallbackPriceMap = new Map<string, { price: number; currency: string }>();
              // Process offerings first
              if (fallbackOfferings) {
                fallbackOfferings.forEach((offering: any) => {
                  if (offering.price != null && offering.price > 0) {
                    const existing = fallbackPriceMap.get(offering.provider_id);
                    if (!existing || Number(offering.price) < existing.price) {
                      fallbackPriceMap.set(offering.provider_id, {
                        price: Number(offering.price),
                        currency: offering.currency || defaultCurrency,
                      });
                    }
                  }
                });
              }
              // Process services as fallback
              if (fallbackServices) {
                fallbackServices.forEach((service: any) => {
                  if (service.price != null && service.price > 0) {
                    const existing = fallbackPriceMap.get(service.provider_id);
                    const servicePrice = Number(service.price);
                    if (!existing || servicePrice < existing.price) {
                      fallbackPriceMap.set(service.provider_id, {
                        price: servicePrice,
                        currency: service.currency || defaultCurrency,
                      });
                    }
                  }
                });
              }

              nearest = (fallbackData as any[]).map((provider: any) => {
                const loc = fallbackLocationMap.get(provider.id);
                const priceInfo = fallbackPriceMap.get(provider.id);
                return {
                  id: provider.id,
                  slug: provider.slug,
                  business_name: provider.business_name,
                  business_type: provider.business_type || 'salon',
                  rating: provider.rating_average || 0,
                  review_count: provider.review_count || 0,
                  thumbnail_url: provider.thumbnail_url,
                  avatar_url: provider.avatar_url ?? null,
                  city: loc?.city || "",
                  country: loc?.country || "",
                  is_featured: provider.is_featured || false,
                  is_verified: provider.is_verified || false,
                  starting_price: priceInfo?.price,
                  currency: priceInfo?.currency || provider.currency || defaultCurrency,
                  description: provider.description ?? null, // Use ?? to preserve empty strings
                  supports_house_calls: Boolean(provider.offers_mobile_services),
                  supports_salon: false,
                };
              }) as PublicProviderCard[];
            }
          }
        } catch (fallbackError) {
          console.error("Error in fallback for nearest providers:", fallbackError);
        }
      }
    } else if (city) {
      // Get providers by city via provider_locations
      try {
        const { data: cityLocations } = await supabase
          .from("provider_locations")
          .select("provider_id, providers!inner(tenant_id)")
          .eq("city", city)
          .eq("is_active", true)
          .eq("providers.tenant_id", tenantId)
          .limit(12);
        
        const providerIds = cityLocations?.map(loc => loc.provider_id) || [];
        if (providerIds.length > 0) {
          const { data: nearestData } = await providersTable()
            .select(providerFields)
            .eq("status", "active")
            .in("id", providerIds)
            .limit(12);

          if (nearestData) {
            // Transform city-based data
            const cityLocationMap = new Map<string, { city: string; country: string }>();
            const { data: cityLocationsData } = await supabase
              .from("provider_locations")
              .select("provider_id, city, country, is_primary")
              .in("provider_id", providerIds)
              .eq("is_active", true)
              .order("is_primary", { ascending: false });
            
            if (cityLocationsData) {
              cityLocationsData.forEach((loc: any) => {
                if (!cityLocationMap.has(loc.provider_id)) {
                  cityLocationMap.set(loc.provider_id, {
                    city: loc.city || "",
                    country: loc.country || "",
                  });
                }
              });
            }

            const { data: cityOfferings } = await supabase
              .from("offerings")
              .select("provider_id, price, currency")
              .in("provider_id", providerIds)
              .eq("is_active", true)
              .not("price", "is", null)
              .order("price", { ascending: true });

            // Also fetch from services
            const { data: cityServices } = await supabase
              .from("services")
              .select("provider_id, price, currency")
              .in("provider_id", providerIds)
              .eq("is_active", true)
              .not("price", "is", null)
              .order("price", { ascending: true });

            const cityPriceMap = new Map<string, { price: number; currency: string }>();
            // Process offerings first
            if (cityOfferings) {
              cityOfferings.forEach((offering: any) => {
                if (offering.price != null && offering.price > 0) {
                  const existing = cityPriceMap.get(offering.provider_id);
                  if (!existing || Number(offering.price) < existing.price) {
                    cityPriceMap.set(offering.provider_id, {
                      price: Number(offering.price),
                      currency: offering.currency || defaultCurrency,
                    });
                  }
                }
              });
            }
            // Process services as fallback
            if (cityServices) {
              cityServices.forEach((service: any) => {
                if (service.price != null && service.price > 0) {
                  const existing = cityPriceMap.get(service.provider_id);
                  const servicePrice = Number(service.price);
                  if (!existing || servicePrice < existing.price) {
                    cityPriceMap.set(service.provider_id, {
                      price: servicePrice,
                      currency: service.currency || defaultCurrency,
                    });
                  }
                }
              });
            }

            nearest = (nearestData as any[]).map((provider: any) => {
              const loc = cityLocationMap.get(provider.id);
              const priceInfo = cityPriceMap.get(provider.id);
              return {
                id: provider.id,
                slug: provider.slug,
                business_name: provider.business_name,
                business_type: provider.business_type || 'salon',
                rating: provider.rating_average || 0,
                review_count: provider.review_count || 0,
                thumbnail_url: provider.thumbnail_url,
                avatar_url: provider.avatar_url ?? null,
                city: loc?.city || "",
                country: loc?.country || "",
                is_featured: provider.is_featured || false,
                is_verified: provider.is_verified || false,
                starting_price: priceInfo?.price,
                currency: priceInfo?.currency || provider.currency || defaultCurrency,
                description: provider.description ?? null, // Use ?? to preserve empty strings
                supports_house_calls: Boolean(provider.offers_mobile_services),
                supports_salon: false,
              };
            }) as PublicProviderCard[];
          }
        }
      } catch (error) {
        console.error("Error fetching providers by city:", error);
      }
    } else {
      // No location provided - show featured/verified/newest providers as fallback
      try {
        // Try featured first
        const { data: featuredNearestRaw } = await applyCategoryFilter(
          providersTable()
            .select(providerFields)
            .eq("status", "active")
            .eq("is_featured", true)
            .limit(12)
        );
        
        // Filter by include_in_search_engines
        const featuredNearest = featuredNearestRaw ? await filterProvidersBySeoSetting(featuredNearestRaw) : null;

        if (featuredNearest && featuredNearest.length > 0) {
          // Transform featured providers
          const featuredLocationMap = new Map<string, { city: string; country: string }>();
          const featuredIds = featuredNearest.map((p: any) => p.id);
          const { data: featuredLocations } = await supabase
            .from("provider_locations")
            .select("provider_id, city, country, is_primary")
            .in("provider_id", featuredIds)
            .eq("is_active", true)
            .order("is_primary", { ascending: false });

          if (featuredLocations) {
            featuredLocations.forEach((loc: any) => {
              if (!featuredLocationMap.has(loc.provider_id)) {
                featuredLocationMap.set(loc.provider_id, {
                  city: loc.city || "",
                  country: loc.country || "",
                });
              }
            });
          }

          const { data: featuredOfferings } = await supabase
            .from("offerings")
            .select("provider_id, price, currency")
            .in("provider_id", featuredIds)
            .eq("is_active", true)
            .not("price", "is", null)
            .order("price", { ascending: true });

          // Also fetch from services
          const { data: featuredServices } = await supabase
            .from("services")
            .select("provider_id, price, currency")
            .in("provider_id", featuredIds)
            .eq("is_active", true)
            .not("price", "is", null)
            .order("price", { ascending: true });

          const featuredPriceMap = new Map<string, { price: number; currency: string }>();
          // Process offerings first
          if (featuredOfferings) {
            featuredOfferings.forEach((offering: any) => {
              if (offering.price != null && offering.price > 0) {
                const existing = featuredPriceMap.get(offering.provider_id);
                if (!existing || Number(offering.price) < existing.price) {
                  featuredPriceMap.set(offering.provider_id, {
                    price: Number(offering.price),
                    currency: offering.currency || defaultCurrency,
                  });
                }
              }
            });
          }
          // Process services as fallback
          if (featuredServices) {
            featuredServices.forEach((service: any) => {
              if (service.price != null && service.price > 0) {
                const existing = featuredPriceMap.get(service.provider_id);
                const servicePrice = Number(service.price);
                if (!existing || servicePrice < existing.price) {
                  featuredPriceMap.set(service.provider_id, {
                    price: servicePrice,
                    currency: service.currency || defaultCurrency,
                  });
                }
              }
            });
          }

          nearest = (featuredNearest as any[]).map((provider: any) => {
            const loc = featuredLocationMap.get(provider.id);
            const priceInfo = featuredPriceMap.get(provider.id);
            return {
              id: provider.id,
              slug: provider.slug,
              business_name: provider.business_name,
              business_type: provider.business_type || 'salon',
              rating: provider.rating_average || 0,
              review_count: provider.review_count || 0,
              thumbnail_url: provider.thumbnail_url,
              avatar_url: provider.avatar_url ?? null,
              city: loc?.city || "",
              country: loc?.country || "",
              is_featured: provider.is_featured || false,
              is_verified: provider.is_verified || false,
              starting_price: priceInfo?.price,
              currency: priceInfo?.currency || provider.currency || defaultCurrency,
              description: provider.description ?? null, // Use ?? to preserve empty strings
              supports_house_calls: Boolean(provider.offers_mobile_services),
              supports_salon: false,
            };
          }) as PublicProviderCard[];
        } else {
          // Fallback to verified or newest providers
          const { data: fallbackNearestRaw } = await applyCategoryFilter(
            providersTable()
              .select(providerFields)
              .eq("status", "active")
              .order("created_at", { ascending: false })
              .limit(12)
          );
          
          // Filter by include_in_search_engines
          const fallbackNearest = fallbackNearestRaw ? await filterProvidersBySeoSetting(fallbackNearestRaw) : null;

          if (fallbackNearest && fallbackNearest.length > 0) {
            const fallbackIds = fallbackNearest.map((p: any) => p.id);
            const { data: fallbackLocations } = await supabase
              .from("provider_locations")
              .select("provider_id, city, country, is_primary")
              .in("provider_id", fallbackIds)
              .eq("is_active", true)
              .order("is_primary", { ascending: false });

            const fallbackLocationMap = new Map<string, { city: string; country: string }>();
            if (fallbackLocations) {
              fallbackLocations.forEach((loc: any) => {
                if (!fallbackLocationMap.has(loc.provider_id)) {
                  fallbackLocationMap.set(loc.provider_id, {
                    city: loc.city || "",
                    country: loc.country || "",
                  });
                }
              });
            }

            const { data: fallbackOfferings } = await supabase
              .from("offerings")
              .select("provider_id, price, currency")
              .in("provider_id", fallbackIds)
              .eq("is_active", true)
              .not("price", "is", null)
              .order("price", { ascending: true });

            // Also fetch from services
            const { data: fallbackServices } = await supabase
              .from("services")
              .select("provider_id, price, currency")
              .in("provider_id", fallbackIds)
              .eq("is_active", true)
              .not("price", "is", null)
              .order("price", { ascending: true });

            const fallbackPriceMap = new Map<string, { price: number; currency: string }>();
            // Process offerings first
            if (fallbackOfferings) {
              fallbackOfferings.forEach((offering: any) => {
                if (offering.price != null && offering.price > 0) {
                  const existing = fallbackPriceMap.get(offering.provider_id);
                  if (!existing || Number(offering.price) < existing.price) {
                    fallbackPriceMap.set(offering.provider_id, {
                      price: Number(offering.price),
                      currency: offering.currency || defaultCurrency,
                    });
                  }
                }
              });
            }
            // Process services as fallback
            if (fallbackServices) {
              fallbackServices.forEach((service: any) => {
                if (service.price != null && service.price > 0) {
                  const existing = fallbackPriceMap.get(service.provider_id);
                  const servicePrice = Number(service.price);
                  if (!existing || servicePrice < existing.price) {
                    fallbackPriceMap.set(service.provider_id, {
                      price: servicePrice,
                      currency: service.currency || defaultCurrency,
                    });
                  }
                }
              });
            }

            nearest = (fallbackNearest as any[]).map((provider: any) => {
              const loc = fallbackLocationMap.get(provider.id);
              const priceInfo = fallbackPriceMap.get(provider.id);
              return {
                id: provider.id,
                slug: provider.slug,
                business_name: provider.business_name,
                business_type: provider.business_type || 'salon',
                rating: provider.rating_average || 0,
                review_count: provider.review_count || 0,
                thumbnail_url: provider.thumbnail_url,
                avatar_url: provider.avatar_url ?? null,
                city: loc?.city || "",
                country: loc?.country || "",
                is_featured: provider.is_featured || false,
                is_verified: provider.is_verified || false,
                starting_price: priceInfo?.price,
                currency: priceInfo?.currency || provider.currency || defaultCurrency,
                description: provider.description ?? null, // Use ?? to preserve empty strings
                supports_house_calls: Boolean(provider.offers_mobile_services),
                supports_salon: false,
              };
            }) as PublicProviderCard[];
          }
        }
      } catch (error) {
        console.error("Error in nearest providers fallback:", error);
      }
    }

    // Sort by distance (closest first) when user location is available
    if (latitude && longitude) {
      const sortByDistance = (a: PublicProviderCard, b: PublicProviderCard) =>
        (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity);
      topRated.sort(sortByDistance);
      hottest.sort(sortByDistance);
      upcoming.sort(sortByDistance);
    }

    return {
      data: {
        all: allProviders,
        topRated: topRated,
        nearest: nearest,
        hottest: hottest,
        upcoming: upcoming,
        browseByCity: browseByCity,
      },
      error: null,
    };
      },
      [cacheKey],
      { revalidate: 60 }
    )();

    // Post-process: ranking, distance radius filter, sponsored ads (gated by module config)
    const env = process.env.NODE_ENV === "production" ? "production" : "development";
    const supabaseAdmin = getSupabaseAdmin();
    const [adsRow, rankingRow, distanceRow] = await Promise.all([
      supabaseAdmin
        .from("ads_module_config")
        .select("enabled, max_sponsored_slots, disclosure_label")
        .eq("environment", env)
        .maybeSingle(),
      supabaseAdmin.from("ranking_module_config").select("enabled").eq("environment", env).maybeSingle(),
      supabaseAdmin.from("distance_module_config").select("enabled").eq("environment", env).maybeSingle(),
    ]);
    const radiusKmParam = new URL(request.url).searchParams.get("radius_km");
    const radiusKm = radiusKmParam ? parseFloat(radiusKmParam) : null;

    let data = result?.data ?? { all: [], topRated: [], nearest: [], hottest: [], upcoming: [], browseByCity: [], sponsored: [] as PublicProviderCard[] };
    const sponsored: PublicProviderCard[] = [];

    if (distanceRow?.data?.enabled && radiusKm != null && radiusKm > 0 && Array.isArray(data.nearest)) {
      data = {
        ...data,
        nearest: (data.nearest as PublicProviderCard[]).filter((p) => p.distance_km != null && p.distance_km <= radiusKm),
      };
    }

    if (rankingRow?.data?.enabled && (data.topRated?.length > 0 || data.hottest?.length > 0)) {
      const providerIds = [...new Set([...(data.topRated ?? []).map((p: PublicProviderCard) => p.id), ...(data.hottest ?? []).map((p: PublicProviderCard) => p.id)])];
      const { data: scores } = await supabaseAdmin.from("provider_quality_score").select("provider_id, computed_score").in("provider_id", providerIds);
      const scoreMap = new Map<string, number>((scores ?? []).map((s: { provider_id: string; computed_score: number }) => [s.provider_id, Number(s.computed_score)]));
      const sortByScore = (a: PublicProviderCard, b: PublicProviderCard) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0);
      data = {
        ...data,
        topRated: [...(data.topRated ?? [])].sort(sortByScore),
        hottest: [...(data.hottest ?? [])].sort(sortByScore),
      };
    }

    // Always return empty browseByCity (feature removed from UI)
    data = { ...data, browseByCity: [] };

    const adsDisclosureLabel =
      String((adsRow?.data as { disclosure_label?: string | null } | null | undefined)?.disclosure_label ?? "").trim() ||
      "Sponsored";
    data = {
      ...data,
      ads_disclosure_label: adsDisclosureLabel,
    } as typeof data & { ads_disclosure_label: string };

    if (adsRow?.data?.enabled && adsRow.data.max_sponsored_slots) {
      const maxSlots = Math.min(Number(adsRow.data.max_sponsored_slots) || 5, 10);
      try {
        const auctionWinners = await runAdsAuction({ tenantId, maxSlots });
        const winnerProviderIds = auctionWinners.map((w) => w.provider_id);
        const winnerCampaignMap = new Map(auctionWinners.map((w) => [w.provider_id, w.campaign_id]));
        if (winnerProviderIds.length > 0) {
          const { data: providersRaw } = await supabaseAdmin.from("providers").select("id, slug, business_name, business_type, rating_average, review_count, thumbnail_url, avatar_url, is_featured, is_verified, description, currency").in("id", winnerProviderIds).eq("status", "active").eq("tenant_id", tenantId);
          if (providersRaw?.length) {
            const allMap = new Map((data.all ?? []).map((p: PublicProviderCard) => [p.id, p]));
            for (const w of auctionWinners) {
              const p = (providersRaw as any[]).find((pr) => pr.id === w.provider_id);
              if (!p) continue;
              const existing = allMap.get(p.id);
              const card = existing ? { ...existing, is_sponsored: true, campaign_id: winnerCampaignMap.get(p.id) ?? null } : {
                id: p.id,
                slug: p.slug,
                business_name: p.business_name,
                business_type: p.business_type || "salon",
                rating: p.rating_average ?? 0,
                review_count: p.review_count ?? 0,
                thumbnail_url: p.thumbnail_url,
                avatar_url: p.avatar_url ?? null,
                city: "",
                country: "",
                is_featured: p.is_featured ?? false,
                is_verified: p.is_verified ?? false,
                starting_price: null,
                currency: p.currency ?? defaultCurrency,
                description: p.description ?? null,
                distance_km: null,
                supports_house_calls: false,
                supports_salon: false,
                current_badge: null,
                is_sponsored: true,
                campaign_id: winnerCampaignMap.get(p.id) ?? null,
              };
              sponsored.push(card as PublicProviderCard);
            }
            const reachKey = buildAdReachKey(request);
            const idempotencyPrefix = `home:${reachKey}:${Date.now()}`;
            await recordAdImpressions(auctionWinners, idempotencyPrefix, {
              placement: "home",
              reach_key: reachKey,
            }).catch((err) =>
              console.warn("Home: ad impression recording failed:", err)
            );
          }
        }
      } catch (auctionErr) {
        console.warn("Home: ads auction failed, falling back to no sponsored:", auctionErr);
      }
      if (sponsored.length > 0) {
        const lat = new URL(request.url).searchParams.get("lat");
        const lng = new URL(request.url).searchParams.get("lng");
        if (lat && lng) {
          try {
            const mapbox = await getMapboxService();
            const userCoords = { latitude: parseFloat(lat), longitude: parseFloat(lng) };
            const idsNeedingDistance = sponsored.filter((c) => c.distance_km == null).map((c) => c.id);
            if (idsNeedingDistance.length > 0) {
              const { data: sponsoredLocs } = await supabaseAdmin
                .from("provider_locations")
                .select("provider_id, latitude, longitude")
                .in("provider_id", idsNeedingDistance)
                .eq("is_active", true)
                .not("latitude", "is", null)
                .not("longitude", "is", null);
              const distMap = new Map<string, number>();
              if (sponsoredLocs) {
                for (const loc of sponsoredLocs as { provider_id: string; latitude: number; longitude: number }[]) {
                  try {
                    const d = mapbox.calculateDistance(userCoords, { latitude: loc.latitude, longitude: loc.longitude });
                    if (!distMap.has(loc.provider_id) || d < distMap.get(loc.provider_id)!) distMap.set(loc.provider_id, d);
                  } catch {
                    // skip
                  }
                }
              }
              sponsored.forEach((c) => {
                if (c.distance_km == null && distMap.has(c.id)) c.distance_km = distMap.get(c.id)!;
              });
            }
            sponsored.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
          } catch (err) {
            console.warn("Home: sponsored distance calculation failed:", err);
          }
        }
      }
      data = { ...data, sponsored } as typeof data & { sponsored: PublicProviderCard[] };
    }

    // Distance-sort only sections where proximity is the intent; topRated/hottest preserve quality ordering
    const latParam = new URL(request.url).searchParams.get("lat");
    const lngParam = new URL(request.url).searchParams.get("lng");
    if (latParam && lngParam) {
      const sortByDistance = (a: PublicProviderCard, b: PublicProviderCard) =>
        (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity);
      data = {
        ...data,
        nearest: [...(data.nearest ?? [])].sort(sortByDistance),
      };
    }

    const response = NextResponse.json({ ...result, data });
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return response;
  } catch (error: any) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Unexpected error in /api/public/home:", err.message, err.stack);
    // Return empty data instead of error to prevent page crash
    const errorResponse = NextResponse.json({
      data: {
        all: [],
        topRated: [],
        nearest: [],
        hottest: [],
        upcoming: [],
        browseByCity: [],
      },
      error: null,
    }, { status: 200 }); // Return 200 with empty data instead of 500
    
    // Cache error responses for shorter time
    errorResponse.headers.set('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
    
    return errorResponse;
  }
}
