import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { sendProviderOnWayNotification } from "@/lib/otp/notifications";
import type { Booking } from "@/types/beautonomi";

/**
 * POST /api/provider/bookings/[id]/start-journey
 * 
 * Mark provider as "on the way" for at-home bookings
 * Creates booking event and notifies customer
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();
    const { estimated_arrival } = body; // Optional: estimated arrival time

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get provider business name
    const { data: provider } = await supabase
      .from("providers")
      .select("business_name")
      .eq("id", providerId)
      .single();

    const providerData = provider as any;

    // Get booking details
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        *,
        customers:users!bookings_customer_id_fkey(id, full_name, email, phone)
      `)
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    const bookingData = booking as any;

    // Only allow for at-home bookings
    if (bookingData.location_type !== "at_home") {
      return errorResponse("This endpoint is only for at-home bookings", "INVALID_REQUEST", 400);
    }

    // Check if booking is confirmed
    if (bookingData.status !== "confirmed") {
      return errorResponse("Booking must be confirmed before starting journey", "INVALID_STATUS", 400);
    }

    // Create booking event
    const { error: eventError } = await supabase
      .from("booking_events")
      .insert({
        booking_id: id,
        event_type: "provider_on_way",
        event_data: {
          estimated_arrival: estimated_arrival || null,
          started_at: new Date().toISOString(),
        },
        created_by: user.id,
      });

    if (eventError) {
      throw eventError;
    }

    // Update booking current_stage (if field exists, otherwise use status)
    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        current_stage: "provider_on_way",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("Error updating booking stage:", updateError);
      // Don't fail - event is created
    }

    // Send notification to customer
    const customer = bookingData.customers;
    if (customer) {
      await sendProviderOnWayNotification(
        customer.id,
        bookingData.booking_number,
        providerData?.business_name || "Provider",
        estimated_arrival
      );
    }

    // Fetch updated booking
    const { data: updatedBooking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    return successResponse({
      booking: updatedBooking as Booking,
      message: "Provider journey started successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to start provider journey");
  }
}
