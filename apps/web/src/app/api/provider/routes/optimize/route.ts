import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, handleApiError, successResponse, badRequestResponse } from "@/lib/supabase/api-helpers";

/**
 * POST /api/provider/routes/optimize
 * Optimize route for a specific date
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const body = await request.json();
    const { date, staff_id } = body;

    if (!date) {
      return badRequestResponse("date is required (YYYY-MM-DD format)");
    }

    // Get or create route
    const { data: routeIdRaw, error: routeError } = await supabase
      .rpc('get_or_create_route', {
        p_provider_id: providerId,
        p_route_date: date,
        p_staff_id: staff_id || null,
      });

    if (routeError) {
      throw routeError;
    }

    // PostgREST can return scalar UUID as string or single-element array
    const routeId = Array.isArray(routeIdRaw) ? routeIdRaw[0] : routeIdRaw;
    if (!routeId) {
      throw new Error("Failed to get or create route");
    }

    // Get all at-home bookings for the day (bookings table uses address_latitude, address_longitude per 005_bookings)
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select(`
        id,
        scheduled_at,
        duration,
        location_type,
        address_line1,
        address_city,
        address_state,
        address_postal_code,
        address_latitude,
        address_longitude,
        customer:users!bookings_customer_id_fkey (
          id,
          full_name
        )
      `)
      .eq("provider_id", providerId)
      .eq("location_type", "at_home")
      .gte("scheduled_at", `${date}T00:00:00Z`)
      .lt("scheduled_at", `${date}T23:59:59Z`)
      .not("status", "in", '(cancelled,no_show)')
      .order("scheduled_at", { ascending: true });

    if (bookingsError) {
      throw bookingsError;
    }

    if (!bookings || bookings.length === 0) {
      return successResponse({
        route_id: routeId,
        bookings_count: 0,
        message: "No at-home bookings found for this date",
      });
    }

    // Get provider's starting location (provider_locations uses latitude/longitude per 003_providers)
    const { data: providerLocation } = await supabase
      .from("provider_locations")
      .select("latitude, longitude, address_line1, city, state")
      .eq("provider_id", providerId)
      .eq("is_primary", true)
      .single();

    const startLat = (providerLocation as any)?.latitude ?? (providerLocation as any)?.address_lat ?? 0;
    const startLng = (providerLocation as any)?.longitude ?? (providerLocation as any)?.address_lng ?? 0;
    const startingLocation = providerLocation || { latitude: 0, longitude: 0, address_line1: "Provider Location" };

    // Set starting_address on the route so calculate_route_savings can use it (avoids NULL and 500s)
    await supabase
      .from("travel_routes")
      .update({
        starting_address: { lat: startLat, lng: startLng, address: (startingLocation as any)?.address_line1 ?? "Provider Location" },
        updated_at: new Date().toISOString(),
      })
      .eq("id", routeId);

    // Create route segments
    let previousLocation = {
      lat: (providerLocation as any)?.latitude ?? (providerLocation as any)?.address_lat ?? startLat,
      lng: (providerLocation as any)?.longitude ?? (providerLocation as any)?.address_lng ?? startLng,
      address: ("address_line1" in (startingLocation as any) ? (startingLocation as any).address_line1 : null) || "Provider Location",
    };
    let previousBookingId = null;
    let segmentOrder = 1;
    let totalDistance = 0;
    let totalDuration = 0;

    const segments = [];

    for (const booking of bookings) {
      const bLat = (booking as any).address_latitude ?? (booking as any).address_lat;
      const bLng = (booking as any).address_longitude ?? (booking as any).address_lng;
      if (bLat == null || bLng == null) {
        continue; // Skip bookings without coordinates
      }

      const currentLocation = {
        lat: bLat,
        lng: bLng,
        address: (booking as any).address_line1 || "Customer Location",
      };

      // Calculate distance (RPC may return scalar or single-element array)
      const { data: distanceData } = await supabase
        .rpc('calculate_distance_km', {
          lat1: previousLocation.lat,
          lng1: previousLocation.lng,
          lat2: currentLocation.lat,
          lng2: currentLocation.lng,
        });
      const distance = Number(Array.isArray(distanceData) ? distanceData[0] : distanceData) || 0;
      totalDistance += distance;

      // Estimate duration (assume average speed of 40 km/h)
      const duration = Math.ceil((distance / 40) * 60); // minutes
      totalDuration += duration;

      // Calculate travel fee (RPC may return scalar or single-element array)
      const { data: travelFeeData } = await supabase
        .rpc('calculate_chained_travel_fee', {
          distance_km: distance,
          is_first_in_route: segmentOrder === 1,
        });
      const travelFee = Number(Array.isArray(travelFeeData) ? travelFeeData[0] : travelFeeData) || 0;

      // Create segment
      const { data: segment, error: segmentError } = await supabase
        .from("route_segments")
        .insert({
          route_id: routeId,
          from_booking_id: previousBookingId,
          to_booking_id: booking.id,
          segment_order: segmentOrder,
          distance_km: distance,
          duration_minutes: duration,
          travel_fee_calculated: travelFee,
          travel_fee_charged: travelFee,
          from_location: previousLocation,
          to_location: currentLocation,
        })
        .select()
        .single();

      if (segmentError) {
        console.error("Error creating segment:", segmentError);
      } else {
        segments.push({
          from: previousBookingId ? `Booking ${previousBookingId}` : "Starting Location",
          to: booking.id,
          distance_km: distance,
          duration_minutes: duration,
          travel_fee: travelFee,
          customer: Array.isArray(booking.customer) ? booking.customer?.[0]?.full_name : (booking.customer as { full_name?: string })?.full_name,
          scheduled_at: booking.scheduled_at,
        });

        // Update booking with route information
        await supabase
          .from("bookings")
          .update({
            route_segment_id: segment.id,
            travel_distance_km: distance,
            travel_duration_minutes: duration,
            previous_booking_id: previousBookingId,
            travel_fee_method: 'route_chained',
            travel_fee: travelFee,
          })
          .eq("id", booking.id);

        // Update previous booking's next_booking_id
        if (previousBookingId) {
          await supabase
            .from("bookings")
            .update({ next_booking_id: booking.id })
            .eq("id", previousBookingId);
        }
      }

      previousLocation = currentLocation;
      previousBookingId = booking.id;
      segmentOrder++;
    }

    // Update route with totals
    await supabase
      .from("travel_routes")
      .update({
        total_distance_km: totalDistance,
        total_duration_minutes: totalDuration,
        optimization_status: 'optimized',
        optimized_at: new Date().toISOString(),
      })
      .eq("id", routeId);

    // Calculate savings (best-effort; avoid 500 if RPC or config is missing)
    let savings = {
      standard_total: 0,
      chained_total: 0,
      savings: 0,
      savings_percentage: 0,
    };
    const { data: savingsData, error: savingsError } = await supabase
      .rpc('calculate_route_savings', { p_route_id: routeId });
    if (!savingsError && savingsData?.[0]) {
      const row = savingsData[0] as any;
      savings = {
        standard_total: Number(row.standard_total ?? 0),
        chained_total: Number(row.chained_total ?? 0),
        savings: Number(row.savings ?? 0),
        savings_percentage: Number(row.savings_percentage ?? 0),
      };
    }

    return successResponse({
      route_id: routeId,
      bookings_count: bookings.length,
      segments_created: segments.length,
      total_distance_km: totalDistance,
      total_duration_minutes: totalDuration,
      segments,
      savings: {
        standard_total: savings.standard_total,
        chained_total: savings.chained_total,
        amount_saved: savings.savings,
        percentage_saved: savings.savings_percentage,
      },
    });

  } catch (error) {
    return handleApiError(error, "Failed to optimize route");
  }
}
