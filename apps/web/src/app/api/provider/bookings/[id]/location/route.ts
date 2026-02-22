import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  badRequestResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const locationUpdateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().positive().optional(),
  altitude: z.number().optional(),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).optional(),
  is_estimated: z.boolean().default(false),
  estimated_reason: z.string().optional(),
});

/**
 * POST /api/provider/bookings/[id]/location
 * 
 * Update provider's location during journey (real-time GPS tracking)
 * This endpoint is called periodically when GPS is available, or manually when GPS is unavailable
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    const { id: bookingId } = await params;

    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const body = await request.json();
    const validationResult = locationUpdateSchema.safeParse(body);

    if (!validationResult.success) {
      return badRequestResponse(
        validationResult.error.issues.map((i) => i.message).join(", ")
      );
    }

    const data = validationResult.data;

    // Verify booking exists and belongs to provider
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, provider_id, location_type, status, current_stage, staff_id, address_latitude, address_longitude")
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return badRequestResponse("Booking not found or access denied");
    }

    // Only allow location updates for at-home bookings
    if (booking.location_type !== "at_home") {
      return badRequestResponse("Location tracking is only available for at-home bookings");
    }

    // Only allow location updates when journey has started or provider has arrived
    if (booking.current_stage !== "provider_on_way" && booking.current_stage !== "provider_arrived") {
      return badRequestResponse("Location tracking can only be updated during journey or after arrival");
    }

    // Insert location update
    const { data: locationUpdate, error: insertError } = await supabase
      .from("provider_location_updates")
      .insert({
        booking_id: bookingId,
        provider_id: providerId,
        staff_id: booking.staff_id || null,
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy || null,
        altitude: data.altitude || null,
        heading: data.heading || null,
        speed: data.speed || null,
        update_type: "periodic",
        is_estimated: data.is_estimated,
        estimated_reason: data.estimated_reason || null,
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    // Calculate ETA if we have destination coordinates
    let etaMinutes: number | null = null;
    if (booking.address_latitude && booking.address_longitude && !data.is_estimated) {
      try {
        const { getMapboxService } = await import("@/lib/mapbox/mapbox");
        const mapbox = await getMapboxService();
        
        const distance = mapbox.calculateDistance(
          { latitude: data.latitude, longitude: data.longitude },
          { latitude: booking.address_latitude, longitude: booking.address_longitude }
        );
        
        // Estimate travel time (assuming average speed of 40 km/h)
        etaMinutes = Math.ceil((distance / 40) * 60);
      } catch (error) {
        console.warn("Failed to calculate ETA:", error);
      }
    }

    return successResponse({
      location: locationUpdate,
      eta_minutes: etaMinutes,
      distance_km: booking.address_latitude && booking.address_longitude && !data.is_estimated
        ? (() => {
            try {
              const R = 6371; // Earth's radius in km
              const dLat = ((booking.address_latitude - data.latitude) * Math.PI) / 180;
              const dLon = ((booking.address_longitude - data.longitude) * Math.PI) / 180;
              const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos((data.latitude * Math.PI) / 180) *
                  Math.cos((booking.address_latitude * Math.PI) / 180) *
                  Math.sin(dLon / 2) *
                  Math.sin(dLon / 2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              return parseFloat((R * c).toFixed(2));
            } catch {
              return null;
            }
          })()
        : null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to update location");
  }
}

/**
 * GET /api/provider/bookings/[id]/location
 * 
 * Get latest location for a booking (for customer tracking)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getSupabaseServer(request);
    const { id: bookingId } = await params;

    // Get latest location update
    const { data: location, error } = await supabase
      .from("provider_location_updates")
      .select("latitude, longitude, accuracy, created_at, is_estimated")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !location) {
      return successResponse({ location: null });
    }

    return successResponse({ location });
  } catch (error) {
    return handleApiError(error, "Failed to get location");
  }
}
