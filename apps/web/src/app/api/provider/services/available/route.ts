import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/services/available
 * 
 * Get available (active) services for provider
 * 
 * Query params:
 * - locationId: UUID (optional - filter by location)
 * - staffId: UUID (optional - filter by staff who offers service)
 * - categoryId: UUID (optional - filter by category)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    
    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return successResponse({ data: [] });
    }

    // Get query params
    const locationId = searchParams.get('locationId');
    const staffId = searchParams.get('staffId');
    const categoryId = searchParams.get('categoryId');

    // Base query: get all active services/offerings
    let query = supabase
      .from("offerings")
      .select(`
        *,
        offering_staff!left(staff_id),
        offering_locations!left(location_id)
      `)
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .eq("is_bookable", true);

    // Filter by category if provided
    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    const { data: services, error } = await query;

    if (error) {
      throw error;
    }

    if (!services) {
      return successResponse({ data: [] });
    }

    // Filter services based on additional criteria
    let availableServices = services;

    // Filter by location
    if (locationId) {
      availableServices = availableServices.filter(service => {
        const locations = (service as any).offering_locations;
        if (!locations || locations.length === 0) return true; // Available at all locations
        return locations.some((l: any) => l.location_id === locationId);
      });
    }

    // Filter by staff
    if (staffId) {
      availableServices = availableServices.filter(service => {
        const staff = (service as any).offering_staff;
        if (!staff || staff.length === 0) return true; // All staff can offer
        return staff.some((s: any) => s.staff_id === staffId);
      });
    }

    // Clean up response (remove joined tables)
    const cleanedServices = availableServices.map(service => {
      const { offering_staff: _offering_staff, offering_locations: _offering_locations, ...rest } = service as any;
      return rest;
    });

    return successResponse({ data: cleanedServices });
  } catch (error) {
    return handleApiError(error, "Failed to fetch available services");
  }
}
