import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse } from "@/lib/supabase/api-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

export const dynamic = "force-dynamic";

/**
 * GET /api/services
 * 
 * Get services filtered by type (salon or mobile)
 * Query params: type, providerSlug
 */
export async function GET(request: NextRequest) {
  try {
    let lastResortCurrency: string = LAST_RESORT_CURRENCY;
    let resolvedTenantId: string | null = null;
    try {
      const tid = await resolveTenantIdWithZaFallback(request);
      resolvedTenantId = tid;
      const tr = await getTenantRegionConfig(tid);
      lastResortCurrency = tr?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    } catch {
      // misconfigured host — keep ZAR, no tenant scope
    }
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // "salon" or "mobile"
    const providerSlug = searchParams.get("providerSlug");
    const serviceIdFromBookingRaw = searchParams.get("serviceId") || searchParams.get("services"); // support both
    const serviceIdsFromBooking = serviceIdFromBookingRaw ? serviceIdFromBookingRaw.split(",").map(id => id.trim()).filter(Boolean) : [];
    const serviceIdFromBooking = serviceIdsFromBooking.length > 0 ? serviceIdsFromBooking[0] : null;

    if (!providerSlug && !serviceIdFromBooking) {
      console.warn("[Services API] No providerSlug or serviceId provided, returning empty array.");
      return successResponse([]);
    }

    // Use admin client (bypasses RLS) to ensure consistent behavior with the public provider profile API
    // which loads regardless of the provider's active status (for previews during onboarding).
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      console.error("[Services API] Database connection not available");
      const response = successResponse([]);
      response.headers.set('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
      return response;
    }

    console.log(`[Services API] Loading for providerSlug: ${providerSlug}, serviceId: ${serviceIdFromBooking || "none"}`);

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
    
    // If provider not found via serviceId, try slug-based lookup.
    // All queries are scoped to the resolved tenant to prevent cross-tenant slug collisions.
    if (!provider && providerSlug) {
      try {
        const decodedSlug = decodeURIComponent(providerSlug);
        console.log(`[Services API] Looking for provider with slug: "${decodedSlug}" (original: "${providerSlug}")`);

        /** Apply tenant scope when we have a resolved tenant ID */
        function applyTenantScope(query: any) {
          return resolvedTenantId ? query.eq("tenant_id", resolvedTenantId) : query;
        }
        
        const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        let providerData = null;
        let decodeError = null;

        if (isUUID(decodedSlug)) {
          const qUuid = applyTenantScope(
            supabase.from("providers").select("id, slug, status").eq("id", decodedSlug).eq("status", "active")
          );
          const resUuid = await qUuid.single();
          providerData = resUuid.data;
          decodeError = resUuid.error;
        }
        
        if (!providerData) {
          // First try: exact match with decoded slug, active status, tenant-scoped
          const q1 = applyTenantScope(
            supabase.from("providers").select("id, slug, status").eq("slug", decodedSlug).eq("status", "active")
          );
          const res1 = await q1.single();
          providerData = res1.data;
          decodeError = res1.error;
        }
        
        console.log(`[Services API] First lookup result:`, { providerData, error: decodeError });
        
        if (providerData && !decodeError) {
          provider = providerData;
        } else {
          // Try with original slug (no decoding), tenant-scoped
          const q2 = applyTenantScope(
            supabase.from("providers").select("id, slug, status").eq("slug", providerSlug).eq("status", "active")
          );
          const { data: providerData2, error: originalError } = await q2.single();
          
          console.log(`[Services API] Second lookup result:`, { providerData: providerData2, error: originalError });
          
          if (providerData2 && !originalError) {
            provider = providerData2;
          } else {
            // Last resort: try without status filter (in case provider exists but status is different)
            const q3 = applyTenantScope(
              supabase.from("providers").select("id, slug, status").eq("slug", decodedSlug).limit(1)
            );
            const { data: providerData3 } = await q3.maybeSingle();
            
            if (!providerData3) {
              const q4 = applyTenantScope(
                supabase.from("providers").select("id, slug, status").eq("slug", providerSlug).limit(1)
              );
              const { data: providerData4 } = await q4.maybeSingle();
              
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
          .select("provider_id, id, title, description, duration_minutes, buffer_minutes, price, at_home_price_adjustment, currency, supports_at_home, supports_at_salon, provider_category_id, parent_service_id, service_type, is_active, display_order, online_booking_enabled")
          .eq("id", serviceIdFromBooking)
          .single();

        if (lastResortService && !lastResortError && lastResortService.provider_id) {
          console.log(`[Services API] Found service directly, provider_id: ${lastResortService.provider_id}`);
          // Use this service as the only result
          if (lastResortService.is_active) {
            const services = [{
              id: lastResortService.id,
              title: lastResortService.title,
              description: lastResortService.description,
              duration: lastResortService.duration_minutes,
              bufferMinutes: Number(lastResortService.buffer_minutes ?? 0),
              price: parseFloat(lastResortService.price || 0),
              at_home_price_adjustment: Number(lastResortService.at_home_price_adjustment ?? 0) || undefined,
              currency: lastResortService.currency || lastResortCurrency,
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
          buffer_minutes,
          price,
          at_home_price_adjustment,
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

    // Query offerings
    // Filter out variants (only show base services) unless a specific serviceId is requested
    const { data: offeringsData, error } = await supabase
      .from("offerings")
      .select(`
        id,
        title,
        description,
        duration_minutes,
        buffer_minutes,
        price,
        at_home_price_adjustment,
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

    // If the requested serviceId is actually a VARIANT, find its parent service instead.
    // We don't want to surface variants as standalone services in the list; the pre-selection
    // logic in the booking flow handles selecting the right variant once the parent is visible.
    let resolvedServiceId = serviceIdFromBooking;
    if (resolvedServiceId && requestedService?.service_type === "variant" && requestedService.parent_service_id) {
      console.log(`[Services API] Requested service ${resolvedServiceId} is a variant; resolving parent ${requestedService.parent_service_id}`);
      resolvedServiceId = requestedService.parent_service_id;
    }

    // Filter offerings: exclude variants, and filter by online_booking_enabled.
    // The parent service for the requested variant will be present in the normal results.
    let filteredOfferings = (offerings || []).filter((o: any) => {
      // Exclude all variants — the booking flow fetches them separately per service
      if (o.service_type === "variant") {
        return false;
      }

      // Include if online_booking_enabled is true or not set (null/undefined)
      // Express link exception: if this is one of the explicitly requested services, keep it
      if (o.online_booking_enabled === false) {
        if (serviceIdsFromBooking.includes(o.id) || o.id === resolvedServiceId) {
          return true;
        }
        return false;
      }

      return true;
    });

    // If the parent of the requested variant is not already included, add it
    if (resolvedServiceId && resolvedServiceId !== serviceIdFromBooking) {
      const parentIncluded = filteredOfferings.some((o: any) => o.id === resolvedServiceId);
      if (!parentIncluded) {
        const { data: parentService } = await supabase
          .from("offerings")
          .select("id, title, description, duration_minutes, buffer_minutes, price, at_home_price_adjustment, currency, supports_at_home, supports_at_salon, provider_category_id, parent_service_id, service_type, is_active, display_order, online_booking_enabled")
          .eq("id", resolvedServiceId)
          .eq("provider_id", provider.id)
          .single();
        if (parentService && parentService.is_active) {
          filteredOfferings = [parentService, ...filteredOfferings];
        }
      }
    }

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
    
    // No longer need to force-include a variant as a standalone service since the pre-selection
    // logic in the booking flow handles it by searching within variants of parent services.
    // The parent service is already ensured to be in filteredOfferings above.

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
            buffer_minutes,
            price,
            at_home_price_adjustment,
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
            bufferMinutes: Number(specificService.buffer_minutes ?? 0),
            price: parseFloat(specificService.price || 0),
            at_home_price_adjustment: Number(specificService.at_home_price_adjustment ?? 0) || undefined,
            currency: specificService.currency || lastResortCurrency,
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
      bufferMinutes: Number(offering.buffer_minutes ?? 0),
      price: parseFloat(offering.price || 0),
      at_home_price_adjustment: Number(offering.at_home_price_adjustment ?? 0) || undefined,
      currency: offering.currency || lastResortCurrency,
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
