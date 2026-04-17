import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { runAdsAuction, recordAdImpressions } from "@/lib/ads/auction";
import { haversineDistanceKmFromCoords } from "@/lib/geo/distance";
import type { SearchFilters, SearchResult } from "@/types/beautonomi";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

export const dynamic = "force-dynamic";
// Cache search results for 30 seconds
export const revalidate = 30;

/**
 * GET /api/public/search
 * 
 * Search for providers and services based on filters.
 */
export async function GET(request: Request) {
  try {
    const supabase = await getSupabaseServer();
    let tenantId: string;
    try {
      tenantId = await resolveTenantIdWithZaFallback(request);
    } catch (tenantErr) {
      console.error("Tenant resolution failed in /api/public/search:", tenantErr);
      return NextResponse.json(
        {
          data: null,
          error: { message: "Tenant not configured", code: "TENANT_UNAVAILABLE" },
        },
        { status: 503 }
      );
    }
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const defaultCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const { searchParams } = new URL(request.url);
    

    // Get text query for provider name search (accept both "query" and "q" for compatibility)
    const queryText = searchParams.get("query") || searchParams.get("q") || undefined;

    // Parse filters from query params
    const filters: SearchFilters = {
      category: searchParams.get("category") || undefined,
      subcategory: searchParams.get("subcategory") || undefined,
      service: searchParams.get("service") || undefined,
      at_home: searchParams.get("at_home") === "true" ? true : undefined,
      date: searchParams.get("date") || undefined,
      time_preference: (searchParams.get("time_preference") as any) || undefined,
      price_min: searchParams.get("price_min") ? Number(searchParams.get("price_min")) : undefined,
      price_max: searchParams.get("price_max") ? Number(searchParams.get("price_max")) : undefined,
      rating_min: searchParams.get("rating_min") ? Number(searchParams.get("rating_min")) : undefined,
      sort_by: (searchParams.get("sort_by") as any) || "relevance",
      page: searchParams.get("page") ? Number(searchParams.get("page")) : 1,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : 20,
    };

    // Location filters
    const city = searchParams.get("city");
    const country = searchParams.get("country");
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const radius = searchParams.get("radius_km");

    if (city || country || (lat && lng)) {
      filters.location = {
        city: city || undefined,
        country: country || undefined,
        latitude: lat ? Number(lat) : undefined,
        longitude: lng ? Number(lng) : undefined,
        radius_km: radius ? Number(radius) : undefined,
      };
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    // Build query with count
    // Note: city and country are in provider_locations, not providers table
    // starting_price may need to be calculated from offerings
    // Exclude providers whose user has opted out of public search / SEO
    const { data: seoOptedOutProviders } = await supabase
      .from("providers")
      .select("id, users!inner(include_in_search_engines)")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .eq("users.include_in_search_engines", false);
    const seoOptedOutIds = (seoOptedOutProviders ?? []).map((p: any) => p.id as string);

    let query = supabase
      .from("providers")
      .select(`
        id,
        slug,
        business_name,
        business_type,
        description,
        rating_average,
        review_count,
        thumbnail_url,
        avatar_url,
        is_featured,
        is_verified,
        currency
      `, { count: "exact" })
      .eq("status", "active")
      .eq("tenant_id", tenantId);

    // Filter out SEO-opted-out providers
    if (seoOptedOutIds.length > 0) {
      query = query.not("id", "in", `(${seoOptedOutIds.map((id) => `"${id}"`).join(",")})`);
    }

    // Apply text search for provider name
    // Search in business_name and description
    if (queryText && queryText.trim()) {
      const searchTerm = queryText.trim();
      // Use or() to search across multiple fields with proper wildcard syntax
      query = query.or(`business_name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
    }

    // Apply filters
    // Location filtering needs to go through provider_locations
    // We'll filter by provider IDs that match the location criteria
    let locationProviderIds: string[] | undefined;
    if (filters.location?.city || filters.location?.country) {
      const locationQuery = supabase
        .from("provider_locations")
        .select("provider_id, providers!inner(tenant_id)")
        .eq("is_active", true)
        .eq("providers.tenant_id", tenantId);
      
      // Use case-insensitive matching for city and country with partial matching
      if (filters.location?.city) {
        const cityValue = filters.location.city.trim();
        locationQuery.ilike("city", `%${cityValue}%`);
      }
      if (filters.location?.country) {
        const countryValue = filters.location.country.trim();
        locationQuery.ilike("country", `%${countryValue}%`);
      }
      
      const { data: locations, error: locationError } = await locationQuery;
      
      if (locationError) {
        console.error("Error querying provider_locations:", locationError);
        // Continue without location filter if there's an error
        locationProviderIds = undefined;
      } else {
        locationProviderIds = locations?.map((loc: any) => loc.provider_id) || [];
      }
      
      if (locationProviderIds && locationProviderIds.length === 0) {
        // No providers match location criteria, return empty result
        return NextResponse.json({
          data: {
            providers: [],
            services: [],
            total: 0,
            page: page,
            limit: limit,
            has_more: false,
          },
          error: null,
        });
      }
      
      if (locationProviderIds && locationProviderIds.length > 0) {
        query = query.in("id", locationProviderIds);
      }
    }
    
    if (filters.rating_min) {
      query = query.gte("rating_average", filters.rating_min);
    }

    // At-home filter: only providers that have at least one offering with supports_at_home = true
    if (filters.at_home === true) {
      const { data: atHomeOfferings } = await supabase
        .from("offerings")
        .select("provider_id, providers!inner(tenant_id)")
        .eq("is_active", true)
        .eq("supports_at_home", true)
        .eq("providers.tenant_id", tenantId);
      const atHomeProviderIds = [...new Set((atHomeOfferings ?? []).map((o: any) => o.provider_id))];
      if (atHomeProviderIds.length === 0) {
        return NextResponse.json({
          data: {
            providers: [],
            services: [],
            total: 0,
            page: page,
            limit: limit,
            has_more: false,
          },
          error: null,
        });
      }
      query = query.in("id", atHomeProviderIds);
    }

    // Apply sorting
    switch (filters.sort_by) {
      case "price_low":
        // Note: starting_price doesn't exist, would need to calculate from offerings
        // For now, sort by rating as fallback
        query = query.order("rating_average", { ascending: true });
        break;
      case "price_high":
        // Note: starting_price doesn't exist, would need to calculate from offerings
        // For now, sort by rating as fallback
        query = query.order("rating_average", { ascending: false });
        break;
      case "rating":
        query = query.order("rating_average", { ascending: false });
        break;
      case "relevance":
      default:
        query = query.order("is_featured", { ascending: false }).order("rating_average", { ascending: false });
        break;
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: providers, error, count } = await query;

    if (error) {
      console.error("Error searching providers:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to search providers",
            code: "SEARCH_ERROR",
          },
        },
        { status: 500 }
      );
    }
    
    if (!providers || providers.length === 0) {
      return NextResponse.json({
        data: {
          providers: [],
          services: [],
          total: count || 0,
          page: page,
          limit: limit,
          has_more: false,
        },
        error: null,
      });
    }

    // Get provider IDs to fetch additional data
    const providerIds = providers.map((p: any) => p.id);

    // Fetch locations for all providers (city, country; and lat/lng when user coords present for distance_km)
    const userLat = filters.location?.latitude;
    const userLng = filters.location?.longitude;
    const { data: locations } = await supabase
      .from("provider_locations")
      .select("provider_id, city, country, is_primary, latitude, longitude, location_type")
      .in("provider_id", providerIds)
      .eq("is_active", true)
      .order("is_primary", { ascending: false });

    // Create a map of provider_id -> location (prefer primary)
    const locationMap = new Map<string, { city: string; country: string }>();
    const distanceMap = new Map<string, number>();
    if (locations) {
      const byProvider = new Map<string, any[]>();
      locations.forEach((loc: any) => {
        if (!locationMap.has(loc.provider_id)) {
          locationMap.set(loc.provider_id, { city: loc.city || "", country: loc.country || "" });
        }
        if (!byProvider.has(loc.provider_id)) byProvider.set(loc.provider_id, []);
        byProvider.get(loc.provider_id)!.push(loc);
      });
      if (userLat != null && userLng != null && Number.isFinite(userLat) && Number.isFinite(userLng)) {
        byProvider.forEach((locs, providerId) => {
          let minKm = Infinity;
          for (const loc of locs) {
            const lat = loc.latitude ?? loc.address_lat;
            const lng = loc.longitude ?? loc.address_lng;
            if (lat != null && lng != null) {
              const km = haversineDistanceKmFromCoords(userLat, userLng, Number(lat), Number(lng));
              if (km < minKm) minKm = km;
            }
          }
          if (Number.isFinite(minKm)) distanceMap.set(providerId, Math.round(minKm * 10) / 10);
        });
      }
    }

    // Fetch minimum prices and location support from offerings for each provider
    const { data: offerings } = await supabase
      .from("offerings")
      .select("provider_id, price, currency, supports_at_home, supports_at_salon")
      .in("provider_id", providerIds)
      .eq("is_active", true);

    // Create a map of provider_id -> minimum price and location support
    const priceMap = new Map<string, { price: number; currency: string }>();
    const supportsHouseCallsMap = new Map<string, boolean>();
    const supportsSalonMap = new Map<string, boolean>();
    if (offerings) {
      offerings.forEach((offering: any) => {
        const pid = offering.provider_id;
        const existing = priceMap.get(pid);
        if (!existing || offering.price < existing.price) {
          priceMap.set(pid, {
            price: offering.price,
            currency: offering.currency,
          });
        }
        if (offering.supports_at_home === true) supportsHouseCallsMap.set(pid, true);
        if (offering.supports_at_salon !== false) supportsSalonMap.set(pid, true);
      });
    }
    // supports_salon: also true if provider has at least one salon location (physical venue)
    if (locations) {
      locations.forEach((loc: any) => {
        if ((loc.location_type || "salon") === "salon") supportsSalonMap.set(loc.provider_id, true);
      });
    }

    // Transform providers to match PublicProviderCard type
    const transformedProviders = providers.map((provider: any) => {
      const location = locationMap.get(provider.id);
      const priceInfo = priceMap.get(provider.id);
      const distance_km = distanceMap.get(provider.id) ?? null;
      const supports_house_calls = supportsHouseCallsMap.get(provider.id) ?? false;
      const supports_salon = supportsSalonMap.get(provider.id) ?? false;

      return {
        id: provider.id,
        slug: provider.slug,
        business_name: provider.business_name,
        business_type: provider.business_type,
        rating: provider.rating_average || 0,
        review_count: provider.review_count || 0,
        thumbnail_url: provider.thumbnail_url,
        avatar_url: provider.avatar_url ?? null,
        city: location?.city || "",
        country: location?.country || "",
        is_featured: provider.is_featured || false,
        is_verified: provider.is_verified || false,
        starting_price: priceInfo?.price,
        currency: priceInfo?.currency || provider.currency || defaultCurrency,
        supports_house_calls,
        supports_salon,
        ...(distance_km != null ? { distance_km } : {}),
      };
    });

    // Sponsored slots: run auction and merge winners at top
    let finalProviders = transformedProviders;
    const sponsoredProviderIds = new Set<string>();
    try {
      const winners = await runAdsAuction({
        tenantId,
        categorySlug: filters.category || undefined,
        maxSlots: 5,
        excludeProviderIds: [],
      });
      if (winners.length > 0) {
        const supabaseAdmin = getSupabaseAdmin();
        const winnerProviderIds = [...new Set(winners.map((w) => w.provider_id))];
        const winnerToCampaign = new Map(winners.map((w) => [w.provider_id, w.campaign_id]));
        const { data: sponsoredProviders } = await supabaseAdmin
          .from("providers")
          .select("id, slug, business_name, business_type, rating_average, review_count, thumbnail_url, avatar_url, is_featured, is_verified, currency")
          .in("id", winnerProviderIds)
          .eq("status", "active")
          .eq("tenant_id", tenantId);
        const { data: sponsoredLocations } = await supabaseAdmin
          .from("provider_locations")
          .select("provider_id, city, country, is_primary, latitude, longitude")
          .in("provider_id", winnerProviderIds)
          .eq("is_active", true)
          .order("is_primary", { ascending: false });
        const { data: sponsoredOfferings } = await supabaseAdmin
          .from("offerings")
          .select("provider_id, price, currency")
          .in("provider_id", winnerProviderIds)
          .eq("is_active", true);
        const locMap = new Map<string, { city: string; country: string }>();
        const sponsoredDistanceMap = new Map<string, number>();
        const hasUserCoords = userLat != null && userLng != null && Number.isFinite(userLat) && Number.isFinite(userLng);
        if (hasUserCoords && (sponsoredLocations ?? []).length > 0) {
          const byProvider = new Map<string, any[]>();
          (sponsoredLocations ?? []).forEach((loc: any) => {
            if (!byProvider.has(loc.provider_id)) byProvider.set(loc.provider_id, []);
            byProvider.get(loc.provider_id)!.push(loc);
          });
          byProvider.forEach((locs, providerId) => {
            let minKm = Infinity;
            for (const loc of locs) {
              const lat = loc.latitude ?? loc.address_lat;
              const lng = loc.longitude ?? loc.address_lng;
              if (lat != null && lng != null) {
                const km = haversineDistanceKmFromCoords(userLat!, userLng!, Number(lat), Number(lng));
                if (km < minKm) minKm = km;
              }
            }
            if (Number.isFinite(minKm)) sponsoredDistanceMap.set(providerId, Math.round(minKm * 10) / 10);
          });
        }
        (sponsoredLocations ?? []).forEach((loc: any) => {
          if (!locMap.has(loc.provider_id)) locMap.set(loc.provider_id, { city: loc.city || "", country: loc.country || "" });
        });
        const priceMapSponsored = new Map<string, { price: number; currency: string }>();
        (sponsoredOfferings ?? []).forEach((o: any) => {
          const ex = priceMapSponsored.get(o.provider_id);
          if (!ex || o.price < ex.price) priceMapSponsored.set(o.provider_id, { price: o.price, currency: o.currency || defaultCurrency });
        });
        const sponsoredCards = (sponsoredProviders ?? []).map((p: any) => {
          sponsoredProviderIds.add(p.id);
          const loc = locMap.get(p.id);
          const priceInfo = priceMapSponsored.get(p.id);
          const distance_km = sponsoredDistanceMap.get(p.id) ?? null;
          return {
            id: p.id,
            slug: p.slug,
            business_name: p.business_name,
            business_type: p.business_type || "salon",
            rating: p.rating_average || 0,
            review_count: p.review_count || 0,
            thumbnail_url: p.thumbnail_url,
            avatar_url: p.avatar_url ?? null,
            city: loc?.city ?? "",
            country: loc?.country ?? "",
            is_featured: p.is_featured ?? false,
            is_verified: p.is_verified ?? false,
            starting_price: priceInfo?.price,
            currency: priceInfo?.currency ?? p.currency ?? defaultCurrency,
            is_sponsored: true,
            campaign_id: winnerToCampaign.get(p.id) ?? null,
            supports_house_calls: supportsHouseCallsMap.get(p.id) ?? false,
            supports_salon: supportsSalonMap.get(p.id) ?? true,
            ...(distance_km != null ? { distance_km } : {}),
          };
        });
        // Order sponsored by auction order (winners order)
        const order = new Map(winners.map((w, i) => [w.provider_id, i]));
        sponsoredCards.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
        const organicOnly = transformedProviders.filter((p: any) => !sponsoredProviderIds.has(p.id));
        finalProviders = [...sponsoredCards, ...organicOnly];
        const idempotencyPrefix = `search:${Date.now()}:${filters.category ?? "all"}:${page}`;
        await recordAdImpressions(winners, idempotencyPrefix);
      }
    } catch (e) {
      console.warn("Ads auction failed, returning organic only:", e);
    }

    // When sort is relevance and ranking module is enabled, re-sort organic results by quality score
    const sortByRelevance = !filters.sort_by || filters.sort_by === "relevance";
    if (sortByRelevance && finalProviders.length > 0) {
      try {
        const supabaseAdmin = getSupabaseAdmin();
        const { data: rankingRow } = await supabaseAdmin
          .from("ranking_module_config")
          .select("enabled")
          .eq("environment", process.env.NODE_ENV === "production" ? "production" : "development")
          .maybeSingle();
        if (rankingRow?.enabled) {
          const ids = [...new Set(finalProviders.map((p: any) => p.id))];
          const { data: scores } = await supabaseAdmin
            .from("provider_quality_score")
            .select("provider_id, computed_score")
            .in("provider_id", ids);
          const scoreMap = new Map<string, number>(
            (scores ?? []).map((s: { provider_id: string; computed_score: number }) => [s.provider_id, Number(s.computed_score)])
          );
          const sponsoredList = finalProviders.filter((p: any) => sponsoredProviderIds.has(p.id));
          const organicList = finalProviders.filter((p: any) => !sponsoredProviderIds.has(p.id));
          organicList.sort((a: any, b: any) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0));
          finalProviders = [...sponsoredList, ...organicList];
        }
      } catch (e) {
        console.warn("Ranking re-sort failed:", e);
      }
    }


    // Also search services/offerings
    let serviceResults: any[] = [];
    const searchQuery = searchParams.get('q') || searchParams.get('query');
    if (searchQuery) {
      const { data: offerings } = await supabase
        .from("offerings")
        .select(
          "id, name, description, price, duration_minutes, type, provider_id, providers!inner(id, business_name, slug, avatar_url)"
        )
        .eq("is_active", true)
        .eq("type", "service")
        .eq("providers.tenant_id", tenantId)
        .or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
        .limit(20);
      serviceResults = (offerings ?? []).map((row: any) => {
        const { providers: provider, ...rest } = row;
        return { ...rest, provider };
      });
    }
    const services: any[] = serviceResults;

    const result: SearchResult = {
      providers: finalProviders,
      services: services,
      total: count || 0,
      page: page,
      limit: limit,
      has_more: (count || 0) > offset + limit,
    };

    const response = NextResponse.json({
      data: result,
      error: null,
    });
    
    // Cache search results for 30 seconds
    response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    
    return response;
  } catch (error) {
    console.error("Unexpected error in /api/public/search:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to perform search",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
