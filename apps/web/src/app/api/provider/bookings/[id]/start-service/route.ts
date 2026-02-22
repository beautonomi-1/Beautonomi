import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import type { Booking } from "@/types/beautonomi";

/**
 * POST /api/provider/bookings/[id]/start-service
 * 
 * Mark service as started (after OTP verification for at-home bookings)
 */
export async function POST(
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

    // Get booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    const bookingData = booking as any;

    // For at-home bookings, check if verification was required and completed
    if (bookingData.location_type === "at_home") {
      // If OTP or QR code exists but not verified, require verification
      // If neither exists (simple confirmation mode), allow service start
      const hasVerificationMethod = bookingData.arrival_otp || bookingData.qr_code_data;
      if (hasVerificationMethod && !bookingData.arrival_otp_verified && !bookingData.qr_code_verified) {
        return errorResponse("Customer must verify provider arrival before starting service", "VERIFICATION_NOT_COMPLETE", 400);
      }
    }

    // Check if booking is in correct state
    if (bookingData.status !== "confirmed" && bookingData.current_stage !== "provider_arrived") {
      return errorResponse("Booking must be confirmed and provider must have arrived", "INVALID_STATUS", 400);
    }

    // Create booking event
    const { error: eventError } = await supabase
      .from("booking_events")
      .insert({
        booking_id: id,
        event_type: "service_started",
        event_data: {
          started_at: new Date().toISOString(),
        },
        created_by: user.id,
      });

    if (eventError) {
      console.error("Error creating booking event:", eventError);
    }

    // Update booking
    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        status: "in_progress",
        current_stage: "service_started",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      throw updateError;
    }

    // Fetch updated booking
    const { data: updatedBooking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    return successResponse({
      booking: updatedBooking as Booking,
      message: "Service started successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to start service");
  }
}
