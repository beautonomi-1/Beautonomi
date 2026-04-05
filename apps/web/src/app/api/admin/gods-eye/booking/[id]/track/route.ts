import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchBookingInAdminTenant } from "@/lib/tenant/admin-booking-tenant";

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
    await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const admin = getSupabaseAdmin();
    const { id: bookingId } = await params;
    const tenantId = await resolveAdminApiTenantId(request);

    const bookResult = await fetchBookingInAdminTenant(
      admin,
      bookingId,
      tenantId,
      "id, provider_id, location_type, status, address_latitude, address_longitude"
    );
    if ("error" in bookResult) return bookResult.error;
    const booking = bookResult.booking;

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

    type BookingRow = { address_latitude?: number | null; address_longitude?: number | null };
    type TrackingRow = { provider_last_lat?: number | null; provider_last_lng?: number | null };
    const b = booking as BookingRow;
    const t = trackingState as TrackingRow | null;
    const routeLine =
      b.address_latitude != null && b.address_longitude != null && t?.provider_last_lat != null
        ? {
            from: {
              lat: t.provider_last_lat,
              lng: t.provider_last_lng ?? 0,
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
