import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  badRequestResponse,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/service-zones/analytics
 * Get analytics for service zones
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    // Get provider's zone selections (new two-tier system)
    const { data: zoneSelections, error: selectionsError } = await supabase
      .from("provider_zone_selections")
      .select(`
        id,
        platform_zone_id,
        is_active,
        platform_zone:platform_zones(
          id,
          name,
          zone_type,
          postal_codes,
          cities
        )
      `)
      .eq("provider_id", providerId);

    if (selectionsError) {
      throw selectionsError;
    }

    // Fallback: Also check old service_zones table (for migration period)
    const { data: oldZones, error: _oldZonesError } = await supabase
      .from("service_zones")
      .select("id, name, zone_type, is_active, postal_codes, cities")
      .eq("provider_id", providerId);

    // Combine both (prefer new system)
    const zones = (zoneSelections || []).map((selection: any) => ({
      id: selection.platform_zone?.id || selection.id,
      name: selection.platform_zone?.name || "Unknown Zone",
      zone_type: selection.platform_zone?.zone_type || "unknown",
      is_active: selection.is_active,
      postal_codes: selection.platform_zone?.postal_codes,
      cities: selection.platform_zone?.cities,
      selection_id: selection.id,
    })).concat(
      (oldZones || []).map((zone: any) => ({
        id: zone.id,
        name: zone.name,
        zone_type: zone.zone_type,
        is_active: zone.is_active,
        postal_codes: zone.postal_codes,
        cities: zone.cities,
        selection_id: null,
      }))
    );

    // Build date filter
    let bookingsQuery = supabase
      .from("bookings")
      .select("id, service_address, address_city, address_postal_code, total_amount, travel_fee, created_at, status")
      .eq("provider_id", providerId)
      .eq("location_type", "at_home");

    if (startDate) {
      bookingsQuery = bookingsQuery.gte("created_at", startDate);
    }
    if (endDate) {
      bookingsQuery = bookingsQuery.lte("created_at", endDate);
    }

    const { data: bookings, error: bookingsError } = await bookingsQuery;

    if (bookingsError) {
      throw bookingsError;
    }

    // Match bookings to zones
    const zoneStats = zones?.map((zone) => {
      const matchingBookings = bookings?.filter((booking) => {
        if (zone.zone_type === "postal_code" && zone.postal_codes) {
          return booking.address_postal_code && 
            zone.postal_codes.includes(booking.address_postal_code);
        } else if (zone.zone_type === "city" && zone.cities) {
          return booking.address_city && 
            zone.cities.some((city: string) => 
              city.toLowerCase().trim() === booking.address_city?.toLowerCase().trim()
            );
        }
        // For polygon and radius, we'd need coordinates - skip for now
        return false;
      }) || [];

      const totalBookings = matchingBookings.length;
      const completedBookings = matchingBookings.filter((b) => b.status === "completed").length;
      const totalRevenue = matchingBookings.reduce((sum, b) => sum + parseFloat(b.total_amount || "0"), 0);
      const totalTravelFees = matchingBookings.reduce((sum, b) => sum + parseFloat(b.travel_fee || "0"), 0);

      return {
        zone_id: zone.id,
        zone_name: zone.name,
        zone_type: zone.zone_type,
        is_active: zone.is_active,
        selection_id: zone.selection_id,
        total_bookings: totalBookings,
        completed_bookings: completedBookings,
        cancelled_bookings: matchingBookings.filter((b) => b.status === "cancelled").length,
        total_revenue: totalRevenue,
        total_travel_fees: totalTravelFees,
        average_booking_value: totalBookings > 0 ? totalRevenue / totalBookings : 0,
        completion_rate: totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0,
      };
    }) || [];

    // Overall stats
    const totalAtHomeBookings = bookings?.length || 0;
    const totalRevenue = bookings?.reduce((sum, b) => sum + parseFloat(b.total_amount || "0"), 0) || 0;
    const totalTravelFees = bookings?.reduce((sum, b) => sum + parseFloat(b.travel_fee || "0"), 0) || 0;

    return successResponse({
      zones: zoneStats,
      summary: {
        total_zones: zones?.length || 0,
        active_zones: zones?.filter((z) => z.is_active).length || 0,
        total_at_home_bookings: totalAtHomeBookings,
        total_revenue: totalRevenue,
        total_travel_fees: totalTravelFees,
        average_booking_value: totalAtHomeBookings > 0 ? totalRevenue / totalAtHomeBookings : 0,
      },
      period: {
        start_date: startDate || null,
        end_date: endDate || null,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch zone analytics");
  }
}
