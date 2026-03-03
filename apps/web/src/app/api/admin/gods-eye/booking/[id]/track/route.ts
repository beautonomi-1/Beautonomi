import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";

const MAX_EVENTS = 200;

/**
 * GET /api/admin/gods-eye/booking/[id]/track
 * Superadmin only. Returns tracking state and last N location events for a booking (disputes evidence).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const admin = getSupabaseAdmin();
    const { id: bookingId } = await params;

    const { data: booking, error: bookErr } = await admin
      .from("bookings")
      .select("id, provider_id, location_type, status, address_latitude, address_longitude")
      .eq("id", bookingId)
      .single();

    if (bookErr || !booking) return notFoundResponse("Booking not found");

    const { data: trackingState, error: trackErr } = await admin
      .from("booking_tracking_state")
      .select("*")
      .eq("booking_id", bookingId)
      .single();

    if (trackErr && trackErr.code !== "PGRST116") throw trackErr;

    const { data: events, error: eventsErr } = await admin
      .from("provider_location_events")
      .select("id, lat, lng, accuracy_m, speed_mps, heading_deg, recorded_at, source")
      .eq("booking_id", bookingId)
      .order("recorded_at", { ascending: false })
      .limit(MAX_EVENTS);

    if (eventsErr) throw eventsErr;

    const b = booking as any;
    const routeLine =
      b.address_latitude != null && b.address_longitude != null && (trackingState as any)?.provider_last_lat != null
        ? {
            from: {
              lat: (trackingState as any).provider_last_lat,
              lng: (trackingState as any).provider_last_lng,
            },
            to: {
              lat: Number(b.address_latitude),
              lng: Number(b.address_longitude),
            },
          }
        : null;

    return successResponse({
      booking_id: bookingId,
      tracking_state: trackingState || null,
      location_events: events || [],
      route_line: routeLine,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load booking track");
  }
}
