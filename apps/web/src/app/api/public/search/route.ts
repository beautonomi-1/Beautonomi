import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { SearchFilters, SearchResult } from "@/types/beautonomi";

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
    const { searchParams } = new URL(request.url);
    
    // Debug logging
    console.log("Search API called with params:", Object.fromEntries(searchParams.entries()));

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
        is_featured,
        is_verified,
        currency
      `, { count: "exact" })
      .eq("status", "active");

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
        .select("provider_id")
        .eq("is_active", true);
      
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
    
    console.log(`Found ${providers?.length || 0} providers (total: ${count || 0})`);

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

    // Fetch locations for all providers
    const { data: locations } = await supabase
      .from("provider_locations")
      .select("provider_id, city, country, is_primary")
      .in("provider_id", providerIds)
      .eq("is_active", true)
      .order("is_primary", { ascending: false }); // Primary location first

    // Create a map of provider_id -> location (prefer primary)
    const locationMap = new Map<string, { city: string; country: string }>();
    if (locations) {
      locations.forEach((loc: any) => {
        if (!locationMap.has(loc.provider_id)) {
          locationMap.set(loc.provider_id, {
            city: loc.city,
            country: loc.country,
          });
        }
      });
    }

    // Fetch minimum prices from offerings for each provider
    const { data: offerings } = await supabase
      .from("offerings")
      .select("provider_id, price, currency")
      .in("provider_id", providerIds)
      .eq("is_active", true);

    // Create a map of provider_id -> minimum price
    const priceMap = new Map<string, { price: number; currency: string }>();
    if (offerings) {
      offerings.forEach((offering: any) => {
        const existing = priceMap.get(offering.provider_id);
        if (!existing || offering.price < existing.price) {
          priceMap.set(offering.provider_id, {
            price: offering.price,
            currency: offering.currency,
          });
        }
      });
    }

    // Transform providers to match PublicProviderCard type
    const transformedProviders = providers.map((provider: any) => {
      const location = locationMap.get(provider.id);
      const priceInfo = priceMap.get(provider.id);

      return {
        id: provider.id,
        slug: provider.slug,
        business_name: provider.business_name,
        business_type: provider.business_type,
        rating: provider.rating_average || 0, // Map rating_average to rating
        review_count: provider.review_count || 0,
        thumbnail_url: provider.thumbnail_url,
        city: location?.city || "",
        country: location?.country || "",
        is_featured: provider.is_featured || false,
        is_verified: provider.is_verified || false,
        starting_price: priceInfo?.price,
        currency: priceInfo?.currency || provider.currency || "ZAR",
      };
    });
    
    console.log(`Returning ${transformedProviders.length} transformed providers`);

    // Also search services/offerings
    let serviceResults: any[] = [];
    const searchQuery = searchParams.get('q') || searchParams.get('query');
    if (searchQuery) {
      const { data: offerings } = await supabase
        .from("offerings")
        .select("id, name, description, price, duration_minutes, type, provider_id, provider:providers(id, business_name, slug, avatar_url)")
        .eq("is_active", true)
        .eq("type", "service")
        .or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
        .limit(20);
      serviceResults = offerings || [];
    }
    const services: any[] = serviceResults;

    const result: SearchResult = {
      providers: transformedProviders,
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
