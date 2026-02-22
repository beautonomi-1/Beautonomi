import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  handleApiError,
  successResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import type { BookingEvent } from "@/types/beautonomi";

/**
 * GET /api/me/bookings/[id]/events
 * 
 * Get all events for a customer's booking (for tracking status history)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer();
    const { id } = await params;

    // Verify booking belongs to customer
    const { data: booking } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", id)
      .eq("customer_id", user.id)
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
      return handleApiError(eventsError, "Failed to fetch events");
    }

    return successResponse({
      events: (events || []) as BookingEvent[],
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch booking events");
  }
}
