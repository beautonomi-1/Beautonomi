import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/search/advanced
 * 
 * Advanced search with filters for staff, availability, etc.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const searchParams = request.nextUrl.searchParams;

    const query = searchParams.get("q") || "";
    const location = searchParams.get("location");
    const staffId = searchParams.get("staff_id");
    const serviceId = searchParams.get("service_id");
    const date = searchParams.get("date");
    const time = searchParams.get("time");
    const _minPrice = searchParams.get("min_price");
    const _maxPrice = searchParams.get("max_price");
    const rating = searchParams.get("min_rating");
    const _locationType = searchParams.get("location_type"); // at_salon, at_home

    // Build provider query
    let providerQuery = supabase
      .from("providers")
      .select(`
        id,
        business_name,
        slug,
        rating_average,
        review_count,
        thumbnail_url,
        locations(
          id,
          name,
          address_line1,
          city,
          latitude,
          longitude
        )
      `)
      .eq("status", "active");

    // Text search
    if (query) {
      providerQuery = providerQuery.or(
        `business_name.ilike.%${query}%,description.ilike.%${query}%`
      );
    }

    // Location filter
    if (location) {
      providerQuery = providerQuery.ilike("locations.city", `%${location}%`);
    }

    // Rating filter
    if (rating) {
      providerQuery = providerQuery.gte("rating_average", parseFloat(rating));
    }

    // Price filter (would need to join with offerings)
    // This is simplified - would need proper joins

    const { data: providers, error } = await providerQuery.limit(50);

    if (error) {
      throw error;
    }

    // If staff_id or service_id specified, filter further
    let filteredProviders = providers || [];

    if (staffId || serviceId) {
      // Get providers that have the staff/service
      const { data: staffData } = await supabase
        .from("provider_staff")
        .select("provider_id")
        .eq("id", staffId)
        .limit(1);

      const { data: serviceData } = await supabase
        .from("offerings")
        .select("provider_id")
        .eq("id", serviceId)
        .limit(1);

      const providerIds = new Set<string>();
      if (staffData && staffData.length > 0) {
        providerIds.add(staffData[0].provider_id);
      }
      if (serviceData && serviceData.length > 0) {
        providerIds.add(serviceData[0].provider_id);
      }

      if (providerIds.size > 0) {
        filteredProviders = filteredProviders.filter((p) => providerIds.has(p.id));
      }
    }

    // Availability check (if date/time provided)
    if (date && time) {
      // This would check actual availability
      // For now, return all providers
      // In production, would check availability_blocks and existing bookings
    }

    return successResponse({
      providers: filteredProviders,
      count: filteredProviders.length,
    });
  } catch (error) {
    return handleApiError(error, "Failed to perform advanced search");
  }
}
