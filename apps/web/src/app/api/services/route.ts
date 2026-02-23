import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse } from "@/lib/supabase/api-helpers";

export const dynamic = "force-dynamic";
// Cache services for 2 minutes (they don't change often during booking)
export const revalidate = 120;

/**
 * GET /api/services
 * 
 * Get services filtered by type (salon or mobile)
 * Query params: type, providerSlug
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // "salon" or "mobile"
    const providerSlug = searchParams.get("providerSlug");
    const serviceIdFromBooking = searchParams.get("serviceId"); // New: serviceId from booking flow

    if (!providerSlug && !serviceIdFromBooking) {
      console.warn("[Services API] No providerSlug or serviceId provided, returning empty array.");
      return successResponse([]);
    }

    // Use server client (same as partner profile endpoint which works)
    // This ensures consistent behavior with the partner profile page
    const supabase = await getSupabaseServer();
    if (!supabase) {
      console.error("[Services API] Database connection not available");
      const response = successResponse([]);
      response.headers.set('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
      return response;
    }

    // Log some sample providers to help debug slug issues
    const { data: sampleProviders, error: sampleError } = await supabase
      .from("providers")
      .select("id, business_name, slug, status")
      .limit(5);
    if (sampleError) {
      console.error("[Services API] Error fetching sample providers:", sampleError);
    } else {
      console.log("[Services API] Sample active providers:", sampleProviders?.filter(p => p.status === 'active').map(p => ({ id: p.id, slug: p.slug, status: p.status })));
    }

    console.log(`[Services API] Searching for providerSlug: ${providerSlug}, or serviceId: ${serviceIdFromBooking}`);

    let provider;
    
    // First, try to find provider via serviceId if provided (most reliable)
    if (serviceIdFromBooking) {
      console.log(`[Services API] Attempting to find provider via serviceId: ${serviceIdFromBooking}`);
      const { data: serviceData, error: serviceError } = await supabase
        .from("offerings")
        .select("provider_id")
        .eq("id", serviceIdFromBooking)
        .single();

      if (serviceError) {
        console.error(`[Services API] Error fetching service by ID ${serviceIdFromBooking}:`, serviceError);
      } else if (serviceData && serviceData.provider_id) {
        console.log(`[Services API] Found provider ID ${serviceData.provider_id} via service ID.`);
        // Verify the provider exists (don't filter by status - we found it via serviceId)
        const { data: providerData, error: providerError } = await supabase
          .from("providers")
          .select("id, slug, status")
          .eq("id", serviceData.provider_id)
          .single();

        if (providerError) {
          console.error(`[Services API] Error verifying provider ${serviceData.provider_id}:`, providerError);
        } else if (providerData) {
          provider = providerData;
          console.log(`[Services API] Verified provider: ${providerData.id}, slug: ${providerData.slug}, status: ${providerData.status}`);
        } else {
          console.error(`[Services API] Provider ${serviceData.provider_id} not found in providers table`);
        }
      } else {
        console.error(`[Services API] Service ${serviceIdFromBooking} found but has no provider_id`);
      }
    }
    
    // If provider not found via serviceId, try slug-based lookup
    // Match the exact logic from /api/public/providers/[slug]/offerings which works
    if (!provider && providerSlug) {
      try {
        const decodedSlug = decodeURIComponent(providerSlug);
        console.log(`[Services API] Looking for provider with slug: "${decodedSlug}" (original: "${providerSlug}")`);
        
        // First try: exact match with decoded slug and active status (matches partner profile endpoint)
        const { data: providerData, error: decodeError } = await supabase
          .from("providers")
          .select("id, slug, status")
          .eq("slug", decodedSlug)
          .eq("status", "active")
          .single();
        
        console.log(`[Services API] First lookup result:`, { providerData, error: decodeError });
        
        if (providerData && !decodeError) {
          provider = providerData;
        } else {
          // Try with original slug (no decoding)
          const { data: providerData2, error: originalError } = await supabase
            .from("providers")
            .select("id, slug, status")
            .eq("slug", providerSlug)
            .eq("status", "active")
            .single();
          
          console.log(`[Services API] Second lookup result:`, { providerData: providerData2, error: originalError });
          
          if (providerData2 && !originalError) {
            provider = providerData2;
          } else {
            // Last resort: try without status filter (in case provider exists but status is different)
            // This matches the fallback in partner profile endpoint
            const { data: providerData3 } = await supabase
              .from("providers")
              .select("id, slug, status")
              .eq("slug", decodedSlug)
              .limit(1)
              .maybeSingle();
            
            if (!providerData3) {
              // Try original slug without status
              const { data: providerData4 } = await supabase
                .from("providers")
                .select("id, slug, status")
                .eq("slug", providerSlug)
                .limit(1)
                .maybeSingle();
              
              if (providerData4) {
                console.log(`[Services API] Found provider without status filter: ${providerData4.slug}, status: ${providerData4.status}`);
                provider = providerData4;
              }
            } else {
              console.log(`[Services API] Found provider without status filter: ${providerData3.slug}, status: ${providerData3.status}`);
              provider = providerData3;
            }
          }
        }
      } catch (error) {
        console.error(`[Services API] Error fetching provider by slug:`, error);
      }
    }

    if (!provider || !provider.id) {
      console.error(`[Services API] Final: Provider not found for slug: ${providerSlug} or serviceId: ${serviceIdFromBooking}.`);
      
      // Last resort: if we have a serviceId, try to get provider directly from the service
      if (serviceIdFromBooking) {
        console.log(`[Services API] Last resort: Fetching service ${serviceIdFromBooking} to get provider...`);
        const { data: lastResortService, error: lastResortError } = await supabase
          .from("offerings")
          .select("provider_id, id, title, description, duration_minutes, price, currency, supports_at_home, supports_at_salon, provider_category_id, parent_service_id, service_type, is_active, display_order, online_booking_enabled")
          .eq("id", serviceIdFromBooking)
          .single();

        if (lastResortService && !lastResortError && lastResortService.provider_id) {
          console.log(`[Services API] Found service directly, provider_id: ${lastResortService.provider_id}`);
          // Use this service as the only result
          if (lastResortService.is_active && lastResortService.online_booking_enabled !== false) {
            const services = [{
              id: lastResortService.id,
              title: lastResortService.title,
              description: lastResortService.description,
              duration: lastResortService.duration_minutes,
              price: parseFloat(lastResortService.price || 0),
              currency: lastResortService.currency || "ZAR",
              category: "Other", // Will be resolved from provider_category_id later
              hasAddons: false,
              hasVariants: false,
            }];
            console.log(`[Services API] Returning direct service:`, services[0]);
            const response = successResponse(services);
            response.headers.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
            return response;
          }
        }
      }
      
      const response = successResponse([]);
      response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      return response;
    }
    
    console.log(`[Services API] Final: Found provider ID: ${provider.id} for slug: ${providerSlug}, type filter: ${type}`);

    // If we have a specific serviceId, fetch it first to ensure it's included
    let requestedService: any = null;
    if (serviceIdFromBooking) {
      console.log(`[Services API] Fetching specific service ${serviceIdFromBooking}...`);
      const { data: directService, error: directError } = await supabase
        .from("offerings")
        .select(`
          id,
          title,
          description,
          duration_minutes,
          price,
          currency,
          supports_at_home,
          supports_at_salon,
          provider_category_id,
          parent_service_id,
          service_type,
          is_active,
          display_order,
          online_booking_enabled
        `)
        .eq("id", serviceIdFromBooking)
        .eq("provider_id", provider.id)
        .single();
      
      if (directError) {
        console.error(`[Services API] Error fetching specific service:`, directError);
      } else if (directService) {
        requestedService = directService;
        console.log(`[Services API] Found requested service:`, {
          id: directService.id,
          title: directService.title,
          service_type: directService.service_type,
          is_active: directService.is_active,
          online_booking_enabled: directService.online_booking_enabled
        });
      } else {
        console.warn(`[Services API] Requested service ${serviceIdFromBooking} not found`);
      }
    }

    // First, let's check ALL offerings for this provider (without filters) for debugging
    const { data: allOfferingsDebug, error: _debugError } = await supabase
      .from("offerings")
      .select("id, title, service_type, is_active, provider_id")
      .eq("provider_id", provider.id);
    
    console.log(`[Services API] DEBUG: Total offerings for provider ${provider.id} (no filters): ${allOfferingsDebug?.length || 0}`);
    if (allOfferingsDebug && allOfferingsDebug.length > 0) {
      console.log(`[Services API] DEBUG: Sample offerings:`, allOfferingsDebug.slice(0, 5).map((o: any) => ({
        id: o.id,
        title: o.title,
        service_type: o.service_type,
        is_active: o.is_active
      })));
    }

    // Query offerings directly - we know the service exists here
    // Filter out variants (only show base services) unless a specific serviceId is requested
    const { data: offeringsData, error } = await supabase
      .from("offerings")
      .select(`
        id,
        title,
        description,
        duration_minutes,
        price,
        currency,
        supports_at_home,
        supports_at_salon,
        provider_category_id,
        parent_service_id,
        service_type,
        is_active,
        display_order,
        online_booking_enabled
      `)
      .eq("provider_id", provider.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true, nullsFirst: false });
    
    let offerings = offeringsData;

    console.log(`[Services API] Raw query for provider ${provider.id}: ${offerings?.length || 0} offerings`);
    if (error) {
      console.error("[Services API] Error fetching offerings:", error);
      console.error("[Services API] Error details:", JSON.stringify(error, null, 2));
    } else if (offerings && offerings.length > 0) {
      console.log(`[Services API] Found offerings:`, offerings.map((o: any) => ({
        id: o.id,
        title: o.title,
        service_type: o.service_type,
        online_booking_enabled: o.online_booking_enabled,
        is_active: o.is_active
      })));
    } else {
      console.warn(`[Services API] No offerings found for provider ${provider.id} with is_active=true`);
      // If we have a requested service, use it even if the query returned nothing
      if (requestedService && requestedService.is_active) {
        console.log(`[Services API] Using requested service since query returned empty`);
        offerings = [requestedService];
      }
    }

    if (error) {
      console.error("[Services API] Error fetching offerings:", error);
      // Even if there's an error, try to return the requested service if we have it
      if (requestedService && requestedService.is_active) {
        console.log(`[Services API] Error occurred but returning requested service anyway`);
        offerings = [requestedService];
      } else {
        console.warn("[Services API] Returning empty services array due to offerings fetch error.");
        const response = successResponse([]);
        response.headers.set('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
        return response;
      }
    }

    // Ensure requested service is in the offerings array if it exists
    if (requestedService && requestedService.is_active) {
      const alreadyIncluded = offerings?.some((o: any) => o.id === requestedService.id);
      if (!alreadyIncluded) {
        console.log(`[Services API] Adding requested service to offerings array`);
        offerings = [requestedService, ...(offerings || [])];
      }
    }

    console.log(`[Services API] Query returned ${offerings?.length || 0} offerings before JS filtering.`);
    if (offerings && offerings.length > 0) {
      console.log(`[Services API] Sample raw offerings:`, offerings.slice(0, 3).map((o: any) => ({
        id: o.id,
        title: o.title,
        service_type: o.service_type,
        is_active: o.is_active
      })));
    }

    // Filter offerings: exclude variants (unless specifically requested), and filter by online_booking_enabled
    let filteredOfferings = (offerings || []).filter((o: any) => {
      // Always include the service that was clicked (if serviceId provided) - even if it's a variant
      if (serviceIdFromBooking && o.id === serviceIdFromBooking) {
        console.log(`[Services API] Including requested service ${serviceIdFromBooking} (type: ${o.service_type})`);
        return true;
      }
      
      // Exclude variants (service_type = "variant")
      if (o.service_type === "variant") {
        return false;
      }
      
      // Include if online_booking_enabled is true or not set (null/undefined)
      // Only exclude if explicitly false
      if (o.online_booking_enabled === false) {
        return false;
      }
      
      return true;
    });

    console.log(`[Services API] After filtering: ${filteredOfferings.length} offerings`);
    if (filteredOfferings.length > 0) {
      console.log(`[Services API] Sample filtered offerings:`, filteredOfferings.slice(0, 3).map((o: any) => ({
        id: o.id,
        title: o.title,
        service_type: o.service_type,
        online_booking_enabled: o.online_booking_enabled,
        is_active: o.is_active
      })));
    }
    
    // If we have a serviceId from booking but it's not in the filtered results, fetch it directly
    if (serviceIdFromBooking && !filteredOfferings.find((o: any) => o.id === serviceIdFromBooking)) {
      console.log(`[Services API] Requested service ${serviceIdFromBooking} not in filtered results, fetching directly...`);
      const { data: directService, error: directError } = await supabase
        .from("offerings")
        .select(`
          id,
          title,
          description,
          duration_minutes,
          price,
          currency,
          supports_at_home,
          supports_at_salon,
          provider_category_id,
          parent_service_id,
          service_type,
          is_active,
          display_order,
          online_booking_enabled
        `)
        .eq("id", serviceIdFromBooking)
        .eq("provider_id", provider.id)
        .single();
      
      if (directError) {
        console.error(`[Services API] Error fetching direct service:`, directError);
      } else if (directService) {
        console.log(`[Services API] Found direct service:`, {
          id: directService.id,
          title: directService.title,
          service_type: directService.service_type,
          is_active: directService.is_active,
          online_booking_enabled: directService.online_booking_enabled
        });
        // Only add if it's active (we'll check online_booking_enabled in the filter)
        if (directService.is_active) {
          filteredOfferings = [directService, ...filteredOfferings];
          console.log(`[Services API] Added requested service ${serviceIdFromBooking} to results.`);
        }
      }
    }

    if (filteredOfferings.length === 0) {
      console.log(`[Services API] No active, non-variant offerings found for provider ${provider.id}.`);
      // If we have a serviceId, try to fetch that specific service even if it's inactive or a variant
      if (serviceIdFromBooking) {
        console.log(`[Services API] Attempting to fetch specific service ${serviceIdFromBooking} regardless of filters...`);
        const { data: specificService, error: specificError } = await supabase
          .from("offerings")
          .select(`
            id,
            title,
            description,
            duration_minutes,
            price,
            currency,
            supports_at_home,
            supports_at_salon,
            provider_category_id,
            parent_service_id,
            service_type,
            is_active,
            display_order,
            online_booking_enabled
          `)
          .eq("id", serviceIdFromBooking)
          .eq("provider_id", provider.id)
          .single();
        
        if (specificService && !specificError) {
          console.log(`[Services API] Found specific service: ${specificService.title} (type: ${specificService.service_type})`);
          // Use this service as the only offering
          const services = [{
            id: specificService.id,
            title: specificService.title,
            description: specificService.description,
            duration: specificService.duration_minutes,
            price: parseFloat(specificService.price || 0),
            currency: specificService.currency || "ZAR",
            category: "Other", // Will be resolved from provider_category_id later
            hasAddons: false,
            hasVariants: false,
          }];
          const response = successResponse(services);
          response.headers.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
          return response;
        }
      }
      const response = successResponse([]);
      response.headers.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
      return response;
    }

    // Filter by type - if type is "mobile", only show mobile services
    // If type is "salon" or not specified, show all services (both salon and mobile)
    let typeFilteredOfferings = filteredOfferings;
    if (type === "mobile") {
      typeFilteredOfferings = filteredOfferings.filter((o: any) => o.supports_at_home === true);
      console.log(`[Services API] After mobile filter: ${typeFilteredOfferings.length} offerings`);
    }

    if (error) {
      console.error("[Services API] Error fetching offerings:", error);
      // Return empty array instead of throwing to prevent booking flow from breaking
      console.warn("[Services API] Returning empty services array due to error");
      const response = successResponse([]);
      response.headers.set('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
      return response;
    }

    // If no offerings found after type filtering, return empty array early
    // But only if we don't have a requested service that should be included
    if ((!typeFilteredOfferings || typeFilteredOfferings.length === 0) && !requestedService) {
      console.log(`[Services API] No offerings found for provider ${provider.id} after type filtering`);
      const response = successResponse([]);
      response.headers.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
      return response;
    }

    // Fetch provider categories and check for variants/addons in parallel
    const providerCategoryIds = Array.from(
      new Set(typeFilteredOfferings.map((o: any) => o.provider_category_id).filter(Boolean))
    );
    const serviceIds = typeFilteredOfferings.map((o: any) => o.id);
    
    // Run parallel queries for better performance
    const [categoryResult, variantResult, addonResult] = await Promise.allSettled([
      // Fetch categories
      providerCategoryIds.length > 0 ? supabase
        .from("provider_categories")
        .select("id, name")
        .in("id", providerCategoryIds) : Promise.resolve({ data: null, error: null }),
      
      // Check for variants
      serviceIds.length > 0 ? supabase
        .from("offerings")
        .select("parent_service_id")
        .in("parent_service_id", serviceIds)
        .eq("service_type", "variant")
        .eq("is_active", true) : Promise.resolve({ data: null, error: null }),
      
      // Check for addons
      serviceIds.length > 0 ? supabase
        .from("offerings")
        .select("applicable_service_ids")
        .eq("service_type", "addon")
        .eq("is_active", true)
        .eq("online_booking_enabled", true)
        .eq("provider_id", provider.id) : Promise.resolve({ data: null, error: null })
    ]);
    
    // Extract category data
    let categoryMap: Record<string, string> = {};
    if (categoryResult.status === "fulfilled" && categoryResult.value.data) {
      categoryMap = (categoryResult.value.data || []).reduce((acc: Record<string, string>, cat: any) => {
        acc[cat.id] = cat.name;
        return acc;
      }, {});
    }
    
    // Extract variant data
    const servicesWithVariants = new Set<string>();
    if (variantResult.status === "fulfilled" && variantResult.value.data) {
      (variantResult.value.data || []).forEach((v: any) => {
        if (v.parent_service_id) {
          servicesWithVariants.add(v.parent_service_id);
        }
      });
    }
    
    // Extract addon data
    const servicesWithAddons = new Set<string>();
    if (addonResult.status === "fulfilled" && addonResult.value.data) {
      (addonResult.value.data || []).forEach((addon: any) => {
        if (!addon.applicable_service_ids || addon.applicable_service_ids.length === 0) {
          // Addon applies to all services
          serviceIds.forEach((id: string) => servicesWithAddons.add(id));
        } else {
          // Addon applies to specific services
          addon.applicable_service_ids.forEach((id: string) => servicesWithAddons.add(id));
        }
      });
    }

    // Transform to service format
    const services = typeFilteredOfferings.map((offering: any) => ({
      id: offering.id,
      title: offering.title,
      description: offering.description,
      duration: offering.duration_minutes,
      price: parseFloat(offering.price || 0),
      currency: offering.currency || "ZAR",
      category: categoryMap[offering.provider_category_id] || "Other",
      hasAddons: servicesWithAddons.has(offering.id),
      hasVariants: servicesWithVariants.has(offering.id),
    }));
    
    console.log(`[Services API] Final services count after transformation: ${services.length}`);

    const response = successResponse(services);

    // Add caching headers
    response.headers.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    
    return response;
  } catch (error) {
    console.error("[Services API] Unexpected error:", error);
    // Return empty array instead of error to prevent booking flow from breaking
    // The frontend will show "No services available" message
    const response = successResponse([]);
    response.headers.set('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
    return response;
  }
}
