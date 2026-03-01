import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/wishlists/providers
 *
 * Get all saved providers from all wishlists (for main wishlist page)
 */
export async function GET(request: NextRequest) {
  try {
    let user;
    try {
      const result = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
      user = result.user;
    } catch (authError) {
      console.error("Authentication error:", authError);
      // Return empty array if auth fails
      return successResponse([]);
    }
    
    const supabase = await getSupabaseServer();

    // Get all wishlists for user
    const { data: wishlists, error: wishlistError } = await (supabase.from("wishlists") as any)
      .select("id")
      .eq("user_id", user.id);

    if (wishlistError) {
      console.error("Error fetching wishlists:", wishlistError);
      // Return empty array instead of throwing
      return successResponse([]);
    }

    if (!wishlists || wishlists.length === 0) {
      return successResponse([]);
    }

    const wishlistIds = wishlists.map((w: any) => w.id);

    // Get all provider items from all wishlists
    const { data: items, error: itemsError } = await (supabase.from("wishlist_items") as any)
      .select("id, item_type, item_id, wishlist_id, created_at")
      .in("wishlist_id", wishlistIds)
      .eq("item_type", "provider")
      .order("created_at", { ascending: false });

    if (itemsError) {
      console.error("Error fetching wishlist items:", itemsError);
      // Return empty array instead of throwing
      return successResponse([]);
    }

    if (!items || items.length === 0) {
      return successResponse([]);
    }

    // Get unique provider IDs
    const providerIds = Array.from(new Set(items.map((item: any) => item.item_id)));
    
    console.log("Wishlist providers API - Found items:", {
      totalItems: items.length,
      uniqueProviderIds: providerIds.length,
      providerIds: providerIds.slice(0, 5),
    });

    if (providerIds.length === 0) {
      return successResponse([]);
    }

    // Fetch provider data (use rating_average, not rating)
    const { data: providers, error: providersError } = await (supabase.from("providers") as any)
      .select("id, slug, business_name, business_type, rating_average, review_count, thumbnail_url, avatar_url, description, status, is_featured, is_verified, currency")
      .in("id", providerIds);

    console.log("Wishlist providers API - Fetched providers:", {
      count: providers?.length || 0,
      providers: providers?.slice(0, 2).map((p: any) => ({
        id: p.id,
        business_name: p.business_name,
        rating_average: p.rating_average,
        review_count: p.review_count,
      })),
    });

    if (providersError) {
      console.error("Error fetching providers:", {
        error: providersError,
        message: providersError.message,
        code: providersError.code,
        details: providersError.details,
        providerIds: providerIds.slice(0, 5), // Log first 5 IDs
      });
      // Return empty array instead of throwing to prevent page breakage
      return successResponse([]);
    }

    if (!providers || providers.length === 0) {
      return successResponse([]);
    }

    // Fetch locations for all providers (include location_type for salon vs base)
    const { data: locations, error: locationsError } = await supabase
      .from("provider_locations")
      .select("provider_id, city, country, is_primary, location_type")
      .in("provider_id", providerIds)
      .eq("is_active", true)
      .order("is_primary", { ascending: false });

    if (locationsError) {
      console.error("Error fetching locations:", locationsError);
    }

    // Create location map (prefer primary location)
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

    // Fetch minimum prices from offerings
    const { data: offerings, error: offeringsError } = await supabase
      .from("offerings")
      .select("provider_id, price, currency, service:services(supports_at_home)")
      .in("provider_id", providerIds)
      .eq("is_active", true)
      .not("price", "is", null)
      .gt("price", 0)
      .order("price", { ascending: true });

    if (offeringsError) {
      console.error("Error fetching offerings:", offeringsError);
    }

    // Also fetch prices from services as fallback
    const { data: services, error: servicesError } = await supabase
      .from("services")
      .select("provider_id, price, currency, supports_at_home")
      .in("provider_id", providerIds)
      .eq("is_active", true)
      .not("price", "is", null)
      .gt("price", 0)
      .order("price", { ascending: true });

    if (servicesError) {
      console.error("Error fetching services:", servicesError);
    }

    // Create price map and service type map
    const priceMap = new Map<string, { price: number; currency: string }>();
    const serviceTypeMap = new Map<string, { supports_house_calls: boolean; supports_salon: boolean }>();

    // Process offerings first (preferred source)
    if (offerings && offerings.length > 0) {
      offerings.forEach((offering: any) => {
        if (offering.price != null && offering.price > 0) {
          const existing = priceMap.get(offering.provider_id);
          if (!existing || Number(offering.price) < existing.price) {
            priceMap.set(offering.provider_id, {
              price: Number(offering.price),
              currency: offering.currency || "ZAR",
            });
          }
        }
        const serviceType = serviceTypeMap.get(offering.provider_id) || { supports_house_calls: false, supports_salon: false };
        if (offering.service?.supports_at_home) {
          serviceType.supports_house_calls = true;
        }
        serviceType.supports_salon = true; // If provider has offerings, they support salon
        serviceTypeMap.set(offering.provider_id, serviceType);
      });
    }

    // Process services as fallback
    if (services && services.length > 0) {
      services.forEach((service: any) => {
        if (service.price != null && service.price > 0) {
          const existing = priceMap.get(service.provider_id);
          const servicePrice = Number(service.price);
          if (!existing || servicePrice < existing.price) {
            priceMap.set(service.provider_id, {
              price: servicePrice,
              currency: service.currency || "ZAR",
            });
          }
        }
        const serviceType = serviceTypeMap.get(service.provider_id) || { supports_house_calls: false, supports_salon: false };
        if (service.supports_at_home) {
          serviceType.supports_house_calls = true;
        }
        serviceType.supports_salon = true;
        serviceTypeMap.set(service.provider_id, serviceType);
      });
    }

    // Salon support only from locations with location_type = 'salon' (base = distance-only)
    if (locations && locations.length > 0) {
      locations.forEach((loc: any) => {
        if ((loc.location_type || "salon") !== "salon") return;
        const serviceType = serviceTypeMap.get(loc.provider_id) || { supports_house_calls: false, supports_salon: false };
        serviceType.supports_salon = true;
        serviceTypeMap.set(loc.provider_id, serviceType);
      });
    }

    // Create a map of provider_id -> created_at (when it was added to wishlist)
    const addedAtMap = new Map(items.map((item: any) => [item.item_id, item.created_at]));

    // Combine providers with all additional data, maintaining order
    // Map to PublicProviderCard structure (rating_average -> rating)
    const providersWithAddedAt = (providers || [])
      .map((p: any) => {
        const location = locationMap.get(p.id);
        const priceInfo = priceMap.get(p.id);
        const serviceType = serviceTypeMap.get(p.id) || { supports_house_calls: false, supports_salon: false };

        // Map to PublicProviderCard structure
        const mapped: any = {
          id: p.id,
          slug: p.slug || "",
          business_name: p.business_name || "",
          business_type: p.business_type || "salon",
          rating: p.rating_average || 0, // Map rating_average to rating
          review_count: p.review_count || 0,
          thumbnail_url: p.thumbnail_url || null,
          avatar_url: p.avatar_url ?? null,
          city: location?.city || "",
          country: location?.country || "",
          is_featured: p.is_featured || false,
          is_verified: p.is_verified || false,
          starting_price: priceInfo?.price,
          currency: priceInfo?.currency || p.currency || "ZAR",
          description: p.description || null,
          supports_house_calls: Boolean(serviceType.supports_house_calls),
          supports_salon: Boolean(serviceType.supports_salon),
          // Keep added_at for sorting, but it's not part of PublicProviderCard
          added_at: addedAtMap.get(p.id) || new Date().toISOString(),
        };
        return mapped;
      })
      .sort((a: any, b: any) => {
        const aTime = new Date(a.added_at).getTime();
        const bTime = new Date(b.added_at).getTime();
        return bTime - aTime; // Most recently added first
      });

    console.log("Wishlist providers API - Returning providers:", {
      count: providersWithAddedAt.length,
      sample: providersWithAddedAt.slice(0, 1).map((p: any) => ({
        id: p.id,
        business_name: p.business_name,
        hasAllFields: !!(p.id && p.slug && p.business_name),
      })),
    });

    return successResponse(providersWithAddedAt);
  } catch (error) {
    console.error("Unexpected error in GET /api/me/wishlists/providers:", error);
    // Return empty array instead of error to prevent page breakage
    return successResponse([]);
  }
}
