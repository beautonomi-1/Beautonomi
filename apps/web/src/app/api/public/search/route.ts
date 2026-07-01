import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { buildAdReachKey, runAdsAuction, recordAdImpressions } from "@/lib/ads/auction";
import { haversineDistanceKmFromCoords } from "@/lib/geo/distance";
import type { SearchFilters, SearchResult } from "@/types/beautonomi";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import {
  buildIlikeOrClause,
  expandSearchTokens,
  fuzzyTextRelevanceScore,
} from "@/lib/search/fuzzy-rank";
import { getProviderIdsForGlobalCategory } from "@/lib/categories/provider-ids-for-global-category";
import { applyPublicProviderVisibility } from "@/lib/providers/public-provider-visibility";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
// Cache search results for 30 seconds
export const revalidate = 30;

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function sanitizeSearchTerm(value: string): string {
  return value.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ").slice(0, 80);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function finiteNumberParam(value: string | null): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isUsableCoordinatePair(latitude?: number, longitude?: number): boolean {
  if (latitude == null || longitude == null) return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  // Customer app/web can temporarily emit 0,0 before location is available.
  // Treat that as "no location" rather than sorting around the Gulf of Guinea.
  return !(latitude === 0 && longitude === 0);
}

/**
 * GET /api/public/search
 * 
 * Search for providers and services based on filters.
 */
export async function GET(request: Request) {
  try {
    let supabase;
    try {
      supabase = getSupabaseAdmin();
    } catch (adminError) {
      console.warn("Admin client not available in /api/public/search; falling back to server client:", adminError);
      supabase = await getSupabaseServer(request);
    }
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
      price_min: finiteNumberParam(searchParams.get("price_min")),
      price_max: finiteNumberParam(searchParams.get("price_max")),
      rating_min: finiteNumberParam(searchParams.get("rating_min")),
      sort_by: (searchParams.get("sort_by") as any) || "relevance",
      page: Math.max(1, finiteNumberParam(searchParams.get("page")) ?? 1),
      limit: Math.min(50, Math.max(1, finiteNumberParam(searchParams.get("limit")) ?? 20)),
    };

    // Location filters
    const city = searchParams.get("city");
    const country = searchParams.get("country");
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const radius = searchParams.get("radius_km");

    const latitude = finiteNumberParam(lat);
    const longitude = finiteNumberParam(lng);
    const hasUsableCoords = isUsableCoordinatePair(latitude, longitude);

    if (city || country || hasUsableCoords) {
      filters.location = {
        city: city || undefined,
        country: country || undefined,
        latitude: hasUsableCoords ? latitude : undefined,
        longitude: hasUsableCoords ? longitude : undefined,
        radius_km: finiteNumberParam(radius),
      };
    }

    const page = Number.isFinite(filters.page) ? filters.page || 1 : 1;
    const limit = Number.isFinite(filters.limit) ? filters.limit || 20 : 20;
    const offset = (page - 1) * limit;

    let query = applyPublicProviderVisibility(
      supabase
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
        currency,
        created_at
      `, { count: "exact" })
        .eq("tenant_id", tenantId),
    );

    // `users.include_in_search_engines` controls external SEO indexing only.
    // Home/search discovery must keep showing active providers to customers.

    let textMatchedProviderIds: string[] = [];
    let textQueryForRanking: string | undefined;
    if (queryText && queryText.trim()) {
      const searchTerm = sanitizeSearchTerm(queryText);
      if (searchTerm) {
        textQueryForRanking = searchTerm;
        const tokens = expandSearchTokens(searchTerm);
        const offeringOr = buildIlikeOrClause(["title", "description"], tokens);
        const providerCatOr = buildIlikeOrClause(["name", "slug"], tokens);
        const globalCatOr = buildIlikeOrClause(["name", "slug"], tokens);
        const [offeringMatches, providerCategoryMatches, globalCategoryMatches] = await Promise.all([
          offeringOr
            ? supabase
                .from("offerings")
                .select("provider_id, providers!inner(tenant_id, status)")
                .eq("is_active", true)
                .eq("providers.tenant_id", tenantId)
                .eq("providers.status", "active")
                .or(offeringOr)
                .limit(300)
            : Promise.resolve({ data: [] as { provider_id?: string }[] }),
          providerCatOr
            ? supabase
                .from("provider_categories")
                .select("provider_id, providers!inner(tenant_id, status)")
                .eq("is_active", true)
                .eq("providers.tenant_id", tenantId)
                .eq("providers.status", "active")
                .or(providerCatOr)
                .limit(300)
            : Promise.resolve({ data: [] as { provider_id?: string }[] }),
          globalCatOr
            ? supabase
                .from("global_service_categories")
                .select("id")
                .eq("is_active", true)
                .or(globalCatOr)
                .limit(50)
            : Promise.resolve({ data: [] as { id?: string }[] }),
        ]);

        const categoryIds = uniqueStrings((globalCategoryMatches.data ?? []).map((row: any) => row.id));
        let categoryProviderIds: string[] = [];
        if (categoryIds.length > 0) {
          const [associationMatches, offeringCategoryMatches] = await Promise.all([
            supabase
              .from("provider_global_category_associations")
              .select("provider_id, providers!inner(tenant_id, status)")
              .in("global_category_id", categoryIds)
              .eq("providers.tenant_id", tenantId)
              .eq("providers.status", "active")
              .limit(300),
            supabase
              .from("offerings")
              .select("provider_id, providers!inner(tenant_id, status)")
              .eq("is_active", true)
              .in("category_id", categoryIds)
              .eq("providers.tenant_id", tenantId)
              .eq("providers.status", "active")
              .limit(300),
          ]);
          categoryProviderIds = uniqueStrings([
            ...(associationMatches.data ?? []).map((row: any) => row.provider_id),
            ...(offeringCategoryMatches.data ?? []).map((row: any) => row.provider_id),
          ]);
        }

        textMatchedProviderIds = uniqueStrings([
          ...(offeringMatches.data ?? []).map((row: any) => row.provider_id),
          ...(providerCategoryMatches.data ?? []).map((row: any) => row.provider_id),
          ...categoryProviderIds,
        ]).slice(0, 300);

        const providerTextPredicates = [
          ...tokens.flatMap((tok) => [
            `business_name.ilike.%${tok}%`,
            `slug.ilike.%${tok}%`,
            `description.ilike.%${tok}%`,
          ]),
        ];
        if (textMatchedProviderIds.length > 0) {
          providerTextPredicates.push(`id.in.(${textMatchedProviderIds.join(",")})`);
        }
        if (providerTextPredicates.length > 0) {
          query = query.or(providerTextPredicates.join(","));
        }
      }
    }

    if (filters.category) {
      let categoryId = isUuid(filters.category) ? filters.category : null;
      if (!categoryId) {
        const { data: categoryRow } = await supabase
          .from("global_service_categories")
          .select("id")
          .eq("slug", filters.category)
          .eq("is_active", true)
          .maybeSingle();
        categoryId = (categoryRow as { id?: string } | null)?.id ?? null;
      }

      if (categoryId) {
        const categoryProviderIds = await getProviderIdsForGlobalCategory({
          supabase,
          globalCategoryId: categoryId,
          tenantId,
        });
        if (categoryProviderIds.length === 0) {
          return NextResponse.json({
            data: {
              providers: [],
              services: [],
              total: 0,
              page,
              limit,
              has_more: false,
            },
            error: null,
          });
        }
        query = query.in("id", categoryProviderIds);
      }
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

    const sortInMemory =
      filters.sort_by === "rating" ||
      filters.sort_by === "relevance" ||
      filters.sort_by === "distance" ||
      filters.sort_by === "price_low" ||
      filters.sort_by === "price_high";

    // Apply sorting. Rating/relevance/price/distance are sorted after card enrichment
    // to avoid fragile PostgREST order clauses and to include derived fields.
    switch (filters.sort_by) {
      case "price_low":
        query = query.order("created_at", { ascending: false });
        break;
      case "price_high":
        query = query.order("created_at", { ascending: false });
        break;
      case "rating":
        query = query.order("created_at", { ascending: false });
        break;
      case "newest":
        query = query.order("created_at", { ascending: false });
        break;
      case "distance":
        query = query.order("created_at", { ascending: false });
        break;
      case "relevance":
      default:
        query = query.order("created_at", { ascending: false });
        break;
    }

    const postPaginateAfterEnrichment =
      sortInMemory ||
      (filters.location?.latitude != null &&
        filters.location?.longitude != null);

    // Derived sorts need enriched fields from provider_locations/offerings, so fetch a wider
    // candidate set and page after calculating the sortable values.
    query = postPaginateAfterEnrichment ? query.limit(1000) : query.range(offset, offset + limit - 1);

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
    const hasUserCoords = userLat != null && userLng != null && Number.isFinite(userLat) && Number.isFinite(userLng);
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
      if (hasUserCoords) {
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
    let transformedProviders = providers.map((provider: any) => {
      const location = locationMap.get(provider.id);
      const priceInfo = priceMap.get(provider.id);
      const distance_km = distanceMap.get(provider.id) ?? null;
      const supports_house_calls = supportsHouseCallsMap.get(provider.id) ?? false;
      const supports_salon = supportsSalonMap.get(provider.id) ?? false;

      return {
        id: provider.id,
        slug: provider.slug || provider.id,
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

    switch (filters.sort_by) {
      case "price_low":
        transformedProviders = [...transformedProviders].sort(
          (a: any, b: any) => (a.starting_price ?? Infinity) - (b.starting_price ?? Infinity),
        );
        break;
      case "price_high":
        transformedProviders = [...transformedProviders].sort(
          (a: any, b: any) => (b.starting_price ?? -Infinity) - (a.starting_price ?? -Infinity),
        );
        break;
      case "rating":
        transformedProviders = [...transformedProviders].sort(
          (a: any, b: any) => (b.rating ?? 0) - (a.rating ?? 0) || (b.review_count ?? 0) - (a.review_count ?? 0),
        );
        break;
      case "distance":
        if (hasUserCoords) {
          transformedProviders = [...transformedProviders].sort(
            (a: any, b: any) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity),
          );
        }
        break;
      case "relevance":
      default:
        transformedProviders = [...transformedProviders].sort((a: any, b: any) => {
          if (textQueryForRanking && textQueryForRanking.trim()) {
            const tq = textQueryForRanking;
            const textB = fuzzyTextRelevanceScore(tq, b.business_name ?? "", b.city ?? "");
            const textA = fuzzyTextRelevanceScore(tq, a.business_name ?? "", a.city ?? "");
            
            if (Math.abs(textB - textA) < 100) {
              if (a.distance_km != null && b.distance_km != null) {
                if (a.distance_km !== b.distance_km) return a.distance_km - b.distance_km;
              } else if (a.distance_km != null) {
                return -1;
              } else if (b.distance_km != null) {
                return 1;
              }
            }

            if (textB !== textA) return textB - textA;
          }
          return (
            Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured)) ||
            (b.rating ?? 0) - (a.rating ?? 0) ||
            (b.review_count ?? 0) - (a.review_count ?? 0)
          );
        });
        break;
    }

    // Sponsored slots: run auction and merge winners at top
    let finalProviders = transformedProviders;
    const sponsoredProviderIds = new Set<string>();
    try {
      const winners = await runAdsAuction({
        tenantId,
        categoryId: isUuid(filters.category) ? filters.category : undefined,
        categorySlug: filters.category && !isUuid(filters.category) ? filters.category : undefined,
        maxSlots: 5,
        excludeProviderIds: [],
        userLat: filters.location?.latitude ?? null,
        userLng: filters.location?.longitude ?? null,
      });
      if (winners.length > 0) {
        const supabaseAdmin = getSupabaseAdmin();
        const winnerProviderIds = [...new Set(winners.map((w) => w.provider_id))];
        const winnerToCampaign = new Map(winners.map((w) => [w.provider_id, w.campaign_id]));
        const { data: sponsoredProviders } = await applyPublicProviderVisibility(
          (supabaseAdmin
            .from("providers")
            .select("id, slug, business_name, business_type, rating_average, review_count, thumbnail_url, avatar_url, is_featured, is_verified, currency")
            .in("id", winnerProviderIds)
            .eq("tenant_id", tenantId) as any),
        );
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
            slug: p.slug || p.id,
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
        const reachKey = buildAdReachKey(request);
        const idempotencyPrefix = `search:${reachKey}:${filters.category ?? "all"}:${page}:${Date.now()}`;
        await recordAdImpressions(winners, idempotencyPrefix, {
          placement: "search",
          reach_key: reachKey,
        }).catch((impressionError) => {
          console.warn("Failed to record search ad impressions:", impressionError);
        });
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
      const safeServiceQuery = sanitizeSearchTerm(searchQuery);
      if (safeServiceQuery) {
        const { data: offerings } = await supabase
        .from("offerings")
        .select(
          "id, title, description, price, duration_minutes, type, provider_id, providers!inner(id, business_name, slug, avatar_url, tenant_id)"
        )
        .eq("is_active", true)
        .eq("type", "service")
        .eq("providers.tenant_id", tenantId)
        .or(`title.ilike.%${safeServiceQuery}%,description.ilike.%${safeServiceQuery}%`)
        .limit(20);
        serviceResults = (offerings ?? []).map((row: any) => {
          const { providers: provider, ...rest } = row;
          return { ...rest, name: row.title, provider };
        });
      }
    }
    const services: any[] = serviceResults;

    const visibleProviders = postPaginateAfterEnrichment
      ? finalProviders.slice(offset, offset + limit)
      : finalProviders;

    const result: SearchResult = {
      providers: visibleProviders,
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
    
    // Cache search results for 30 seconds; Vary: host prevents cross-tenant leakage on CDN.
    response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    response.headers.set('Vary', 'host');
    
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
