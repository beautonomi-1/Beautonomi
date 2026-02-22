import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import type { BookingEvent } from "@/types/beautonomi";

/**
 * GET /api/provider/bookings/[id]/events
 * 
 * Get all events for a booking (for tracking status history)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify booking belongs to provider
    const { data: booking } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!booking) {
      return notFoundResponse("Booking not found");
    }

    // Get all events for this booking
    const { data: events, error: eventsError } = await supabase
      .from("booking_events")
      .select("*")
      .eq("booking_id", id)
      .order("created_at", { ascending: true });

    if (eventsError) {
      throw eventsError;
    }

    return successResponse({
      events: (events || []) as BookingEvent[],
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch booking events");
  }
}
