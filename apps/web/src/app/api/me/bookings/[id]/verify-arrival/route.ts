import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  handleApiError,
  successResponse,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { isValidOTPFormat, isOTPExpired } from "@/lib/otp/generator";
import type { Booking } from "@/types/beautonomi";
import { z } from "zod";

const verifyArrivalSchema = z.object({
  otp: z.string().min(6).max(6),
});

/**
 * POST /api/me/bookings/[id]/verify-arrival
 * 
 * Customer verifies provider arrival with OTP
 * Only for at-home bookings
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Allow any authenticated user (customer, provider, etc.)
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer();
    const { id } = await params;
    const body = await request.json();

    const validationResult = verifyArrivalSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Invalid OTP format",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { otp } = validationResult.data;

    // Validate OTP format
    if (!isValidOTPFormat(otp)) {
      return errorResponse("OTP must be 6 digits", "INVALID_OTP_FORMAT", 400);
    }

    // Get booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .eq("customer_id", user.id)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    const bookingData = booking as any;

    // Only allow for at-home bookings
    if (bookingData.location_type !== "at_home") {
      return errorResponse("This endpoint is only for at-home bookings", "INVALID_REQUEST", 400);
    }

    // Check if OTP exists
    if (!bookingData.arrival_otp) {
      return errorResponse("No OTP has been generated for this booking", "NO_OTP", 400);
    }

    // Check if OTP is expired
    if (bookingData.arrival_otp_expires_at && isOTPExpired(bookingData.arrival_otp_expires_at)) {
      return errorResponse(
        "OTP has expired. Please request a new one from the provider.",
        "OTP_EXPIRED",
        400
      );
    }

    // Check if already verified
    if (bookingData.arrival_otp_verified) {
      return errorResponse("OTP has already been verified", "ALREADY_VERIFIED", 400);
    }

    // Verify OTP
    if (bookingData.arrival_otp !== otp) {
      return errorResponse("Invalid OTP. Please check and try again.", "INVALID_OTP", 400);
    }

    // Create OTP verified event
    const { error: eventError } = await supabase
      .from("booking_events")
      .insert({
        booking_id: id,
        event_type: "otp_verified",
        event_data: {
          verified_at: new Date().toISOString(),
        },
        created_by: user.id,
      });

    if (eventError) {
      console.error("Error creating booking event:", eventError);
      // Continue - OTP verification is the important part
    }

    // Update booking
    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        arrival_otp_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return handleApiError(updateError, "Failed to update booking");
    }

    // Fetch updated booking
    const { data: updatedBooking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    return successResponse({
      booking: updatedBooking as Booking,
      message: "OTP verified successfully. Provider arrival confirmed.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to verify OTP");
  }
}
