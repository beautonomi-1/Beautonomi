import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, handleApiError, successResponse, badRequestResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/routes?date=YYYY-MM-DD
 * Get route for a specific date with all segments
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const url = new URL(request.url);
    const date = url.searchParams.get("date");
    const staff_id = url.searchParams.get("staff_id");

    if (!date) {
      return badRequestResponse("date parameter is required (YYYY-MM-DD format)");
    }

    // Get route for the date (when no staff_id, match routes where staff_id IS NULL)
    let query = supabase
      .from("travel_routes")
      .select("*")
      .eq("provider_id", providerId)
      .eq("route_date", date);
    if (staff_id != null && staff_id !== "") {
      query = query.eq("staff_id", staff_id);
    } else {
      query = query.is("staff_id", null);
    }
    const { data: route, error: routeError } = await query.single();

    if (routeError && routeError.code !== 'PGRST116') {
      throw routeError;
    }

    if (!route) {
      return successResponse({
        route: null,
        segments: [],
        message: "No route found for this date",
      });
    }

    // Get all segments for this route
    const { data: segments, error: segmentsError } = await supabase
      .from("route_segments")
      .select(`
        *,
        to_booking:bookings!route_segments_to_booking_id_fkey (
          id,
          ref_number,
          scheduled_at,
          duration,
          status,
          customer:users!bookings_customer_id_fkey (
            id,
            full_name,
            email,
            phone
          )
        )
      `)
      .eq("route_id", route.id)
      .order("segment_order", { ascending: true });

    if (segmentsError) {
      throw segmentsError;
    }

    // Calculate savings (best-effort; RPC can fail if starting_address is null or config missing)
    let savings = {
      standard_total: 0,
      chained_total: 0,
      savings: 0,
      savings_percentage: 0,
    };
    try {
      const { data: savingsData } = await supabase
        .rpc('calculate_route_savings', { p_route_id: route.id });
      if (savingsData?.[0]) {
        const row = savingsData[0] as Record<string, unknown>;
        savings = {
          standard_total: Number(row.standard_total ?? 0),
          chained_total: Number(row.chained_total ?? 0),
          savings: Number(row.savings ?? 0),
          savings_percentage: Number(row.savings_percentage ?? 0),
        };
      }
    } catch {
      // use defaults
    }

    return successResponse({
      route: {
        id: route.id,
        date: route.route_date,
        total_distance_km: route.total_distance_km,
        total_duration_minutes: route.total_duration_minutes,
        optimization_status: route.optimization_status,
        optimized_at: route.optimized_at,
        starting_location: route.starting_address,
        ending_location: route.ending_address,
      },
      segments: segments?.map(s => ({
        id: s.id,
        order: s.segment_order,
        distance_km: s.distance_km,
        duration_minutes: s.duration_minutes,
        travel_fee_calculated: s.travel_fee_calculated,
        travel_fee_charged: s.travel_fee_charged,
        from_location: s.from_location,
        to_location: s.to_location,
        booking: s.to_booking ? {
          id: s.to_booking.id,
          ref_number: s.to_booking.ref_number,
          scheduled_at: s.to_booking.scheduled_at,
          duration: s.to_booking.duration,
          status: s.to_booking.status,
          customer: s.to_booking.customer,
        } : null,
      })) || [],
      savings,
    });

  } catch (error) {
    return handleApiError(error, "Failed to fetch route");
  }
}
